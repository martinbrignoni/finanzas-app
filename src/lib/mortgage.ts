import { toMinor, fromMinor, formatMoney } from "./money";
import { addMonthsToDate, todayISO } from "./dates";
import type { MortgageLoan, MortgageCurrency, MortgagePrepayment } from "../types";

/**
 * Cálculo de préstamos por sistema francés, alemán o americano (ver
 * `MortgageLoan.system` en types.ts). Todos los cálculos intermedios se
 * hacen en unidades decimales (no en centavos) para no arrastrar error de
 * redondeo cuota a cuota; solo se redondea al armar cada fila de la tabla
 * para mostrarla/guardarla.
 */

const EPSILON = 0.005; // medio centavo: tolerancia para dar por saldado el préstamo

/** Cuota fija (sistema francés) para cancelar `principal` en `months` cuotas a una tasa mensual `monthlyRate` (ej. 0.004 = 0.4%/mes). */
export function frenchPayment(principal: number, monthlyRate: number, months: number): number {
  if (months <= 0 || principal <= 0) return 0;
  if (monthlyRate === 0) return principal / months;
  const factor = Math.pow(1 + monthlyRate, months);
  return (principal * monthlyRate * factor) / (factor - 1);
}

/**
 * Cuántas cuotas (redondeando hacia arriba) hacen falta para cancelar
 * `principal` a `monthlyRate` pagando siempre `payment`. Si `payment` no
 * alcanza a cubrir ni el interés del primer período, el préstamo nunca se
 * cancela con ese importe (devuelve `Infinity`).
 */
export function monthsForPayment(principal: number, monthlyRate: number, payment: number): number {
  if (principal <= 0) return 0;
  if (monthlyRate === 0) return Math.ceil(principal / payment);
  if (payment <= principal * monthlyRate) return Infinity;
  const n = -Math.log(1 - (principal * monthlyRate) / payment) / Math.log(1 + monthlyRate);
  return Math.max(1, Math.ceil(n - 1e-9));
}

/** Cuántos períodos hacen falta para cancelar `principal` amortizando siempre `fixedPrincipalPortion` de capital por período (sistema alemán). */
function monthsForFixedPrincipalPortion(principal: number, fixedPrincipalPortion: number): number {
  if (principal <= 0) return 0;
  if (fixedPrincipalPortion <= 0) return Infinity;
  return Math.max(1, Math.ceil(principal / fixedPrincipalPortion - 1e-9));
}

export interface AmortizationRow {
  number: number;
  dueDate: string; // YYYY-MM-DD
  paymentMinor: number;
  interestMinor: number;
  principalMinor: number;
  balanceMinor: number;
  /** Amortización extraordinaria aplicada junto con esta cuota, si la hubo. */
  extraPaymentMinor?: number;
  /** Si esta cuota ya venció respecto a hoy (informativo, no implica que se haya pagado realmente). */
  isPast: boolean;
  /** Si esta cuota es parte del período de gracia (antes de que arranque la amortización regular). */
  isGrace?: boolean;
}

/**
 * Sistema francés: cuota fija (redondeada a centésimos en cada fila), interés
 * decreciente y amortización de capital creciente. Ante una amortización
 * extraordinaria, "reduceInstallment" recalcula la cuota manteniendo el plazo
 * restante; "reduceTerm" mantiene la cuota y recalcula cuántas cuotas faltan.
 */
function buildFrenchSchedule(loan: MortgageLoan): AmortizationRow[] {
  const monthlyRate = loan.annualRatePct / 100 / 12;
  const principal = fromMinor(loan.principalMinor);
  const today = todayISO();

  let balance = principal;
  let totalMonths = loan.termMonths;
  let payment = frenchPayment(balance, monthlyRate, totalMonths);

  const prepayments = [...loan.prepayments].sort((a, b) => a.date.localeCompare(b.date));
  let nextPrepaymentIdx = 0;

  const rows: AmortizationRow[] = [];

  for (let month = 1; month <= totalMonths && balance > EPSILON; month++) {
    const dueDate = addMonthsToDate(loan.startDate, month - 1);
    const interest = balance * monthlyRate;
    let principalPortion = payment - interest;
    if (principalPortion < 0) principalPortion = 0; // cuota no alcanza a cubrir interés (no debería pasar con una cuota bien calculada)
    if (principalPortion > balance) principalPortion = balance; // última cuota: ajusta redondeo acumulado
    let newBalance = balance - principalPortion;

    let extraThisMonth = 0;
    while (nextPrepaymentIdx < prepayments.length && prepayments[nextPrepaymentIdx].date <= dueDate && newBalance > EPSILON) {
      const pre = prepayments[nextPrepaymentIdx];
      const extra = Math.min(fromMinor(pre.amountMinor), newBalance);
      newBalance -= extra;
      extraThisMonth += extra;
      nextPrepaymentIdx++;

      if (newBalance <= EPSILON) {
        totalMonths = month; // se termina de pagar acá mismo
        break;
      }

      const monthsRemaining = totalMonths - month;
      if (pre.strategy === "reduceInstallment") {
        if (monthsRemaining > 0) payment = frenchPayment(newBalance, monthlyRate, monthsRemaining);
      } else {
        const monthsNeeded = monthsForPayment(newBalance, monthlyRate, payment);
        totalMonths = Number.isFinite(monthsNeeded) ? month + monthsNeeded : totalMonths;
      }
    }

    rows.push({
      number: month,
      dueDate,
      paymentMinor: toMinor(principalPortion + interest),
      interestMinor: toMinor(interest),
      principalMinor: toMinor(principalPortion),
      balanceMinor: toMinor(Math.max(0, newBalance)),
      extraPaymentMinor: extraThisMonth > 0 ? toMinor(extraThisMonth) : undefined,
      isPast: dueDate < today,
    });

    balance = newBalance;
  }

  return rows;
}

/**
 * Sistema alemán: amortización de capital fija por período (la cuota total
 * baja mes a mes porque el interés se calcula sobre un saldo cada vez
 * menor). Ante una amortización extraordinaria, "reduceInstallment"
 * recalcula esa amortización fija sobre el plazo restante (mismo plazo,
 * cuotas más bajas de ahí en más); "reduceTerm" mantiene la amortización fija
 * de antes del pago extra y recalcula cuántas cuotas faltan.
 */
function buildGermanSchedule(loan: MortgageLoan): AmortizationRow[] {
  const monthlyRate = loan.annualRatePct / 100 / 12;
  const principal = fromMinor(loan.principalMinor);
  const today = todayISO();

  let balance = principal;
  let totalMonths = loan.termMonths;
  let fixedPrincipalPortion = totalMonths > 0 ? principal / totalMonths : 0;

  const prepayments = [...loan.prepayments].sort((a, b) => a.date.localeCompare(b.date));
  let nextPrepaymentIdx = 0;

  const rows: AmortizationRow[] = [];

  for (let month = 1; month <= totalMonths && balance > EPSILON; month++) {
    const dueDate = addMonthsToDate(loan.startDate, month - 1);
    const interest = balance * monthlyRate;
    const principalPortion = Math.min(fixedPrincipalPortion, balance);
    let newBalance = balance - principalPortion;

    let extraThisMonth = 0;
    while (nextPrepaymentIdx < prepayments.length && prepayments[nextPrepaymentIdx].date <= dueDate && newBalance > EPSILON) {
      const pre = prepayments[nextPrepaymentIdx];
      const extra = Math.min(fromMinor(pre.amountMinor), newBalance);
      newBalance -= extra;
      extraThisMonth += extra;
      nextPrepaymentIdx++;

      if (newBalance <= EPSILON) {
        totalMonths = month;
        break;
      }

      const monthsRemaining = totalMonths - month;
      if (pre.strategy === "reduceInstallment") {
        if (monthsRemaining > 0) fixedPrincipalPortion = newBalance / monthsRemaining;
      } else {
        const monthsNeeded = monthsForFixedPrincipalPortion(newBalance, fixedPrincipalPortion);
        totalMonths = Number.isFinite(monthsNeeded) ? month + monthsNeeded : totalMonths;
      }
    }

    rows.push({
      number: month,
      dueDate,
      paymentMinor: toMinor(principalPortion + interest),
      interestMinor: toMinor(interest),
      principalMinor: toMinor(principalPortion),
      balanceMinor: toMinor(Math.max(0, newBalance)),
      extraPaymentMinor: extraThisMonth > 0 ? toMinor(extraThisMonth) : undefined,
      isPast: dueDate < today,
    });

    balance = newBalance;
  }

  return rows;
}

/**
 * Sistema americano: durante todo el plazo solo se pagan intereses sobre el
 * capital original; el capital se cancela entero en la última cuota
 * ("bullet"). Como no hay amortización de capital programada antes de esa
 * última cuota, una amortización extraordinaria siempre baja el saldo (y con
 * él, el interés de las cuotas siguientes) sin importar qué estrategia se
 * haya elegido: no existe acá una diferencia real entre "bajar cuota" y
 * "bajar plazo".
 */
function buildAmericanSchedule(loan: MortgageLoan): AmortizationRow[] {
  const monthlyRate = loan.annualRatePct / 100 / 12;
  const principal = fromMinor(loan.principalMinor);
  const today = todayISO();
  const totalMonths = loan.termMonths;

  let balance = principal;
  const prepayments = [...loan.prepayments].sort((a, b) => a.date.localeCompare(b.date));
  let nextPrepaymentIdx = 0;

  const rows: AmortizationRow[] = [];

  for (let month = 1; month <= totalMonths && balance > EPSILON; month++) {
    const dueDate = addMonthsToDate(loan.startDate, month - 1);
    const interest = balance * monthlyRate;
    const isLast = month === totalMonths;
    const principalPortion = isLast ? balance : 0;
    let newBalance = balance - principalPortion;

    let extraThisMonth = 0;
    while (nextPrepaymentIdx < prepayments.length && prepayments[nextPrepaymentIdx].date <= dueDate && newBalance > EPSILON) {
      const extra = Math.min(fromMinor(prepayments[nextPrepaymentIdx].amountMinor), newBalance);
      newBalance -= extra;
      extraThisMonth += extra;
      nextPrepaymentIdx++;
    }

    rows.push({
      number: month,
      dueDate,
      paymentMinor: toMinor(principalPortion + interest),
      interestMinor: toMinor(interest),
      principalMinor: toMinor(principalPortion),
      balanceMinor: toMinor(Math.max(0, newBalance)),
      extraPaymentMinor: extraThisMonth > 0 ? toMinor(extraThisMonth) : undefined,
      isPast: dueDate < today,
    });

    balance = newBalance;
    if (balance <= EPSILON) break; // se saldó antes de la última cuota por amortizaciones extraordinarias
  }

  return rows;
}

/**
 * Cuotas de gracia al inicio del préstamo, antes de que arranque la
 * amortización regular (francés/alemán/americano). No dependen del sistema
 * elegido: durante la gracia, o se paga solo el interés (`interestOnly`,
 * saldo constante) o no se paga nada y el interés capitaliza (`capitalized`,
 * saldo creciente). Una amortización extraordinaria con fecha dentro de la
 * gracia siempre baja el saldo de inmediato: todavía no hay una cuota o
 * plazo "regular" que acelerar, así que no aplica la distinción
 * bajar-cuota/bajar-plazo (mismo criterio que el sistema americano).
 */
function buildGracePrefix(loan: MortgageLoan): {
  rows: AmortizationRow[];
  balanceAfter: number;
  remainingPrepayments: MortgagePrepayment[];
} {
  const graceMonths = loan.gracePeriodMonths ?? 0;
  const principal = fromMinor(loan.principalMinor);
  if (graceMonths <= 0) {
    return { rows: [], balanceAfter: principal, remainingPrepayments: loan.prepayments };
  }

  const monthlyRate = loan.annualRatePct / 100 / 12;
  const graceType = loan.graceType ?? "interestOnly";
  const today = todayISO();

  let balance = principal;
  const prepayments = [...loan.prepayments].sort((a, b) => a.date.localeCompare(b.date));
  let idx = 0;
  const rows: AmortizationRow[] = [];

  for (let month = 1; month <= graceMonths && balance > EPSILON; month++) {
    const dueDate = addMonthsToDate(loan.startDate, month - 1);
    const interest = balance * monthlyRate;
    const paid = graceType === "capitalized" ? 0 : interest;
    let newBalance = graceType === "capitalized" ? balance + interest : balance;

    let extraThisMonth = 0;
    while (idx < prepayments.length && prepayments[idx].date <= dueDate && newBalance > EPSILON) {
      const extra = Math.min(fromMinor(prepayments[idx].amountMinor), newBalance);
      newBalance -= extra;
      extraThisMonth += extra;
      idx++;
    }

    rows.push({
      number: month,
      dueDate,
      paymentMinor: toMinor(paid),
      interestMinor: toMinor(interest),
      principalMinor: 0,
      balanceMinor: toMinor(Math.max(0, newBalance)),
      extraPaymentMinor: extraThisMonth > 0 ? toMinor(extraThisMonth) : undefined,
      isPast: dueDate < today,
      isGrace: true,
    });

    balance = newBalance;
  }

  return { rows, balanceAfter: balance, remainingPrepayments: prepayments.slice(idx) };
}

function buildRegularSchedule(loan: MortgageLoan): AmortizationRow[] {
  const system = loan.system ?? "frances";
  if (system === "aleman") return buildGermanSchedule(loan);
  if (system === "americano") return buildAmericanSchedule(loan);
  return buildFrenchSchedule(loan);
}

/**
 * Arma la tabla de amortización completa de un préstamo: primero las cuotas
 * de gracia si las hay (`loan.gracePeriodMonths`), y después la amortización
 * regular según el sistema elegido (`loan.system`, sin definir = francés),
 * sobre el saldo y la fecha ya corridos por la gracia.
 */
export function buildSchedule(loan: MortgageLoan): AmortizationRow[] {
  const graceMonths = loan.gracePeriodMonths ?? 0;
  if (graceMonths <= 0) return buildRegularSchedule(loan);

  const { rows: graceRows, balanceAfter, remainingPrepayments } = buildGracePrefix(loan);
  if (balanceAfter <= EPSILON || graceRows.length < graceMonths) {
    // El préstamo se saldó durante la gracia (amortizaciones extraordinarias): no hay fase regular.
    return graceRows;
  }

  const regularLoan: MortgageLoan = {
    ...loan,
    principalMinor: toMinor(balanceAfter),
    startDate: addMonthsToDate(loan.startDate, graceMonths),
    prepayments: remainingPrepayments,
  };
  const regularRows = buildRegularSchedule(regularLoan).map((r) => ({ ...r, number: r.number + graceMonths }));
  return [...graceRows, ...regularRows];
}

export interface LoanSummary {
  currentPaymentMinor: number;
  balanceMinor: number;
  remainingInstallments: number;
  totalInstallments: number;
  nextDueDate: string | null;
  totalInterestMinor: number;
  totalPrepaidMinor: number;
  isPaidOff: boolean;
}

/** Resumen de estado actual del préstamo (a hoy) a partir de su tabla de amortización. */
export function loanSummary(schedule: AmortizationRow[]): LoanSummary {
  const today = todayISO();
  const future = schedule.filter((r) => r.dueDate >= today);
  const next = future[0] ?? schedule[schedule.length - 1];
  const totalInterestMinor = schedule.reduce((s, r) => s + r.interestMinor, 0);
  const totalPrepaidMinor = schedule.reduce((s, r) => s + (r.extraPaymentMinor ?? 0), 0);

  return {
    currentPaymentMinor: next?.paymentMinor ?? 0,
    balanceMinor: next ? next.balanceMinor + next.principalMinor : 0,
    remainingInstallments: future.length,
    totalInstallments: schedule.length,
    nextDueDate: future[0]?.dueDate ?? null,
    totalInterestMinor,
    totalPrepaidMinor,
    isPaidOff: schedule.length > 0 && future.length === 0,
  };
}

/** Formatea un monto según la moneda del préstamo. UI no es una `Currency` de cuentas/movimientos, así que no puede pasar por `formatMoney`. */
export function formatMortgageAmount(minorAmount: number, currency: MortgageCurrency): string {
  if (currency === "UI") return formatUiAmount(fromMinor(minorAmount));
  return formatMoney(minorAmount, currency);
}

/** Formatea un monto decimal en Unidades Indexadas (ej. 133452.1 -> "133.452,10 UI"). */
export function formatUiAmount(value: number): string {
  return `${new Intl.NumberFormat("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} UI`;
}

export interface UsdReferenceConversion {
  /** Monto en pesos uruguayos (decimal, no en centésimos). */
  amountUyu: number;
  /** Monto en Unidades Indexadas (decimal). */
  amountUi: number;
}

/**
 * Convierte un importe en USD (guardado en centésimos) a pesos y a UI, usando
 * el TC USD->UYU y la cotización de la UI (ambos en pesos) vigentes a la
 * fecha del préstamo. Devuelve `null` si falta alguna cotización.
 */
export function convertUsdReference(
  amountUsdMinor: number,
  usdToUyuRate: number | undefined,
  uiRate: number | undefined
): UsdReferenceConversion | null {
  if (!usdToUyuRate || usdToUyuRate <= 0 || !uiRate || uiRate <= 0) return null;
  const amountUsd = fromMinor(amountUsdMinor);
  const amountUyu = amountUsd * usdToUyuRate;
  const amountUi = amountUyu / uiRate;
  return { amountUyu, amountUi };
}
