import { toMinor, fromMinor } from "./money";
import { addMonthsToDate, todayISO } from "./dates";
import type { MortgageLoan } from "../types";

/**
 * Cálculo de préstamos por sistema francés: cuota fija (redondeada a
 * centésimos en cada fila), compuesta de interés + amortización de capital;
 * el interés baja y la amortización de capital sube mes a mes. Todos los
 * cálculos intermedios se hacen en unidades decimales (no en centavos) para
 * no arrastrar error de redondeo cuota a cuota; solo se redondea al armar
 * cada fila de la tabla para mostrarla/guardarla.
 */

/** Cuota fija para cancelar `principal` en `months` cuotas a una tasa mensual `monthlyRate` (ej. 0.004 = 0.4%/mes). */
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
}

/**
 * Arma la tabla de amortización completa de un préstamo, incorporando sus
 * amortizaciones extraordinarias en la cuota vigente a la fecha de cada una
 * (la primera cuyo vencimiento sea igual o posterior a la fecha del pago
 * extra). A partir de ahí, según la estrategia elegida en cada pago extra,
 * se recalcula la cuota (mismo plazo restante) o el plazo (misma cuota).
 */
export function buildSchedule(loan: MortgageLoan): AmortizationRow[] {
  const monthlyRate = loan.annualRatePct / 100 / 12;
  const principal = fromMinor(loan.principalMinor);
  const today = todayISO();

  let balance = principal;
  let totalMonths = loan.termMonths;
  let payment = frenchPayment(balance, monthlyRate, totalMonths);

  const prepayments = [...loan.prepayments].sort((a, b) => a.date.localeCompare(b.date));
  let nextPrepaymentIdx = 0;

  const rows: AmortizationRow[] = [];
  const EPSILON = 0.005; // medio centavo: tolerancia para dar por saldado el préstamo

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
