import { toMinor, fromMinor, formatMoney } from "./money";
import { addMonthsToDate, daysBetween, todayISO } from "./dates";
import type { MortgageLoan, MortgageCurrency, MortgagePrepayment } from "../types";

/**
 * Cálculo de préstamos por sistema francés, alemán o americano (ver
 * `MortgageLoan.system` en types.ts). Todos los cálculos intermedios se
 * hacen en unidades decimales (no en centavos) para no arrastrar error de
 * redondeo cuota a cuota; solo se redondea al armar cada fila de la tabla
 * para mostrarla/guardarla.
 */

const EPSILON = 0.005; // medio centavo: tolerancia para dar por saldado el préstamo

/**
 * Tasa mensual equivalente a `loan.annualRatePct`, según `loan.rateType`:
 * - "nominal" (TNA, default): tasa/12 directamente.
 * - "effective" (TEA): `(1+tasa)^(1/12) - 1`, la conversión correcta de una
 *   tasa efectiva anual a su mensual equivalente (da un valor menor que
 *   TNA/12 para la misma tasa anual nominal en %, porque ya viene compuesta).
 * Usar la que no corresponde es la causa más común de que una cuota
 * calculada no coincida con la real de un préstamo hipotecario: los bancos
 * en Uruguay casi siempre cotizan el hipotecario como TEA.
 */
export function monthlyRateOf(loan: MortgageLoan): number {
  const annual = loan.annualRatePct / 100;
  if (loan.rateType === "effective") return Math.pow(1 + annual, 1 / 12) - 1;
  return annual / 12;
}

/**
 * TNA (tasa nominal anual, en fracción) equivalente a `loan.annualRatePct`,
 * la que se usa para prorratear interés por días corridos con
 * `dayCountConvention: "actual365"`: interés = saldo × (TNA/365) × días.
 * Si la tasa ya es nominal (`rateType !== "effective"`), es la tasa tal
 * cual; si es efectiva (TEA), es la nominal equivalente capitalizable
 * mensualmente: `TNA = 12 × ((1+TEA)^(1/12) - 1)` = `12 × monthlyRateOf`.
 * Esta es la fórmula que, verificada contra dos vales reales de un
 * hipotecario UI de Santander (capital y cuota antes y después de una
 * amortización extraordinaria real), reproduce el interés de cada cuota con
 * un error menor a 1 UI acumulado en 240 cuotas, y la cuota nueva tras una
 * amortización con un error de centésimos de UI.
 */
export function annualNominalRateOf(loan: MortgageLoan): number {
  return monthlyRateOf(loan) * 12;
}

/** `count` vencimientos mensuales consecutivos a partir de `firstDueDate` (incluida), todos el mismo día del mes que ella. */
function generateDueDates(firstDueDate: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonthsToDate(firstDueDate, i));
}

/**
 * Cuota fija (sistema francés) que cancela exactamente `principal` en las
 * fechas de vencimiento `dueDates` (una por cuota, ya generadas, no
 * necesariamente equiespaciadas en días), devengando interés día a día sobre
 * saldo a la tasa nominal anual `annualRate` con año de 365 días — interés
 * del período i = saldo × (annualRate/365) × días entre el vencimiento
 * anterior (o `fromDate` para el primero) y `dueDates[i]`.
 *
 * Es la variante de `frenchPayment` para `dayCountConvention: "actual365"`.
 * A diferencia de esa (que asume una tasa mensual fija, como si todos los
 * meses tuvieran la misma duración), esta calcula la cuota exacta que
 * cierra el saldo en $0 en la última fecha con los días reales de cada mes
 * (28 a 31): con `frenchPayment` sobre un préstamo real, típicamente queda
 * un saldo residual de más de una cuota entera al cabo del plazo, porque los
 * bancos en Uruguay sí liquidan el interés por días corridos aunque la
 * cuota sea fija en unidades monetarias.
 *
 * Fórmula cerrada: si `factor_i = 1 + (annualRate/365)*días_i`, entonces
 * `cuota = principal × Π(factor_i) / Σ_j Π_{i>j}(factor_i)`.
 */
export function frenchPaymentActual365(principal: number, annualRate: number, fromDate: string, dueDates: string[]): number {
  if (dueDates.length === 0 || principal <= 0) return 0;
  const factors = dueDates.map((d, i) => 1 + (annualRate / 365) * daysBetween(i === 0 ? fromDate : dueDates[i - 1], d));

  let prodTotal = 1;
  for (const f of factors) prodTotal *= f;

  let sumPartial = 0;
  let suffixProd = 1; // producto de los factores DESPUÉS de la posición actual
  for (let i = factors.length - 1; i >= 0; i--) {
    sumPartial += suffixProd;
    suffixProd *= factors[i];
  }

  return (principal * prodTotal) / sumPartial;
}

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
  /**
   * Solo con `dayCountConvention: "actual365"`: esta fila no es una cuota
   * regular, sino la liquidación de una amortización extraordinaria que cayó
   * en una fecha distinta a un vencimiento (`principalMinor`/`paymentMinor`
   * son el monto amortizado; `interestMinor` es 0 porque el interés de esos
   * días queda capitalizado en el saldo, no se paga aparte). A partir de la
   * cuota siguiente, los vencimientos corren al día del mes de esta fecha.
   */
  isPrepaymentSettlement?: boolean;
}

/**
 * Sistema francés: cuota fija (redondeada a centésimos en cada fila), interés
 * decreciente y amortización de capital creciente. Ante una amortización
 * extraordinaria, "reduceInstallment" recalcula la cuota manteniendo el plazo
 * restante; "reduceTerm" mantiene la cuota y recalcula cuántas cuotas faltan.
 */
function buildFrenchSchedule(loan: MortgageLoan): AmortizationRow[] {
  if ((loan.dayCountConvention ?? "monthly") === "actual365") return buildFrenchScheduleActual365(loan);

  const monthlyRate = monthlyRateOf(loan);
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
 * Sistema francés con `dayCountConvention: "actual365"`: interés por días
 * corridos reales (28 a 31 según el mes) sobre una tasa nominal anual con
 * año de 365 días, en vez de una tasa mensual fija aplicada por igual sin
 * importar cuántos días tenga el mes (ver `buildFrenchSchedule`).
 *
 * Validado contra dos vales reales de un hipotecario UI de Santander:
 * - Vale original: capital 698.407,00 UI, TEA 6,68%, 240 cuotas de
 *   5.201,82 UI, vencimientos el día 15, año de 365 días (así lo dice
 *   textualmente el vale: "cómputo de días: meses calendario, año de 365
 *   días"). Con `annualNominalRateOf` (6,483805% TNA) y esta fórmula, el
 *   interés de cada una de las 240 cuotas reales se reproduce con un error
 *   promedio de 0,13 UI y máximo de 0,74 UI (redondeo de centésimos
 *   acumulado en 240 filas, no una tasa distinta).
 * - Segundo vale, tras una amortización real de ≈131.145,90 UI el
 *   19/08/2020 (a mitad del período 15/08→15/09, "reduceInstallment"): el
 *   vencimiento pasó del día 15 al día 19, quedaron 212 cuotas de
 *   4.164,61 UI. Reconstruyendo el saldo al 19/08/2020 (día a día, desde la
 *   última cuota vieja) y resolviendo la cuota nueva con
 *   `frenchPaymentActual365` sobre 212 vencimientos reales anclados al 19,
 *   da 4.164,6047 UI — 0,005 UI de diferencia con la cuota real.
 *
 * Por eso, ante una amortización extraordinaria que no coincide con un
 * vencimiento, esta función NO reparte el interés del período "a mitad de
 * camino": corta ahí (liquida esa amortización en su propia fila, con el
 * saldo devengado día a día desde la última cuota) y arranca una anualidad
 * nueva, con vencimientos anclados al día de esa fecha, exactamente como
 * hizo el banco en el caso real de arriba.
 *
 * OJO al reconstruir un préstamo REAL con una amortización YA hecha: si el
 * préstamo necesita `paymentAdjustmentMinor` para que la cuota calculada
 * coincida con la real del banco (pasa seguido: nuestra fórmula suele quedar
 * a un ~0,02% de la real, ver ejemplo arriba), ese ajuste es solo de
 * presentación — no se filtra al saldo que se usa internamente para calcular
 * la cuota nueva tras la amortización. Con un ajuste de más de un puñado de
 * unidades por cuota y muchos períodos antes de la amortización, la cuota
 * nueva calculada acá puede quedar por encima de la real por un margen algo
 * mayor al de antes de amortizar (en el caso real documentado arriba, sin
 * ajuste, queda ≈0,9 UI por encima en vez de los ≈0,005 UI que da reconstruir
 * el cálculo con el saldo real exacto de cada cuota vieja).
 */
function buildFrenchScheduleActual365(loan: MortgageLoan): AmortizationRow[] {
  const annualRate = annualNominalRateOf(loan);
  const monthlyRate = monthlyRateOf(loan); // solo para estimar el plazo restante en "reduceTerm" (ver más abajo)
  const principal = fromMinor(loan.principalMinor);
  const today = todayISO();

  const prepayments = [...loan.prepayments].sort((a, b) => a.date.localeCompare(b.date));
  let nextPrepaymentIdx = 0;

  let balance = principal;
  let anchorDate = loan.startDate; // fecha del PRIMER vencimiento vigente; cambia si se amortiza fuera de fecha
  let indexSinceAnchor = 0; // cuántos vencimientos ya se generaron desde que se fijó `anchorDate`
  let remainingCount = loan.termMonths; // cuotas REGULARES que faltan generar (no cuenta las filas de liquidación)
  // Punto de partida para contar los días de la CUOTA 1: `requestDate` (fecha de desembolso/solicitud) si está
  // cargada, porque con días corridos sí importa el desfasaje real hasta la primera cuota (no es solo informativo
  // como en la convención "monthly" — ver `MortgageLoan.requestDate`). Sin ese dato, se asume un mes exacto antes.
  const firstPeriodStart = loan.requestDate ?? addMonthsToDate(anchorDate, -1);
  let payment = frenchPaymentActual365(balance, annualRate, firstPeriodStart, generateDueDates(anchorDate, remainingCount));
  let lastDueDate = firstPeriodStart; // último vencimiento ya pagado (o la fecha de desembolso, al arrancar)

  const rows: AmortizationRow[] = [];
  let rowNumber = 0;
  let guard = 0; // tope de filas de seguridad: nunca colgar la UI aunque los datos del préstamo sean inconsistentes

  while (remainingCount > 0 && balance > EPSILON && guard < 1000) {
    guard++;
    const dueDate = addMonthsToDate(anchorDate, indexSinceAnchor);

    const pre = prepayments[nextPrepaymentIdx];
    if (pre && pre.date > lastDueDate && pre.date < dueDate) {
      // Cae a mitad del período: se liquida en su propia fila (no se genera la cuota regular de este período;
      // el ancla de vencimiento pasa a ser el día del mes de esta fecha desde la próxima cuota).
      const daysToPrepayment = daysBetween(lastDueDate, pre.date);
      const balanceAtPrepayment = balance * (1 + (annualRate / 365) * daysToPrepayment);
      const extra = Math.min(fromMinor(pre.amountMinor), balanceAtPrepayment);
      const newBalance = balanceAtPrepayment - extra;
      nextPrepaymentIdx++;
      // OJO: no se incrementa `rowNumber` acá. Esta fila no es una cuota — es
      // la liquidación de la amortización — así que no debe "gastar" un
      // número de cuota: si lo hiciera, todas las cuotas regulares
      // posteriores quedarían corridas +1 (la cuota 29 real pasaría a
      // mostrarse como 30, etc.). La UI ya la muestra como "—", no como un
      // número, así que el valor exacto de `number` en esta fila no importa.

      rows.push({
        number: rowNumber,
        dueDate: pre.date,
        paymentMinor: toMinor(extra),
        interestMinor: 0,
        principalMinor: toMinor(extra),
        balanceMinor: toMinor(Math.max(0, newBalance)),
        extraPaymentMinor: toMinor(extra),
        isPast: pre.date < today,
        isPrepaymentSettlement: true,
      });

      balance = newBalance;
      lastDueDate = pre.date;
      anchorDate = addMonthsToDate(pre.date, 1);
      indexSinceAnchor = 0;

      if (balance > EPSILON) {
        if (pre.strategy === "reduceInstallment") {
          payment = frenchPaymentActual365(balance, annualRate, pre.date, generateDueDates(anchorDate, remainingCount));
        } else {
          // reduceTerm: la cuota no cambia; se re-estima (con la tasa mensual "monthly", una aproximación
          // razonable) cuántas cuotas más hacen falta, con margen — el corte real lo decide el `while` por saldo.
          const approx = monthsForPayment(balance, monthlyRate, payment);
          remainingCount = Number.isFinite(approx) ? Math.ceil(approx) + 6 : remainingCount;
        }
      }
      continue; // no se genera cuota regular esta vuelta: ya se liquidó la amortización, se re-arranca con el ancla nueva
    }

    const days = daysBetween(lastDueDate, dueDate);
    const interest = balance * (annualRate / 365) * days;
    let principalPortion = payment - interest;
    if (principalPortion < 0) principalPortion = 0;
    if (principalPortion > balance) principalPortion = balance;
    let newBalance = balance - principalPortion;

    // Si la amortización cae justo EN este vencimiento (no a mitad de período), se liquida junto con la
    // cuota, sin correr el ancla (comportamiento histórico, igual que la convención "monthly").
    let extraOnDueDate = 0;
    if (pre && pre.date === dueDate && newBalance > EPSILON) {
      const extra = Math.min(fromMinor(pre.amountMinor), newBalance);
      newBalance -= extra;
      extraOnDueDate = extra;
      nextPrepaymentIdx++;

      if (newBalance > EPSILON) {
        if (pre.strategy === "reduceInstallment") {
          payment = frenchPaymentActual365(newBalance, annualRate, dueDate, generateDueDates(addMonthsToDate(dueDate, 1), remainingCount - 1));
        } else {
          // +1 porque esta misma fila (la que se está armando ahora) todavía no se descontó de `remainingCount`.
          const approx = monthsForPayment(newBalance, monthlyRate, payment);
          remainingCount = Number.isFinite(approx) ? 1 + Math.ceil(approx) + 6 : remainingCount;
        }
      }
    }

    rowNumber++;
    rows.push({
      number: rowNumber,
      dueDate,
      paymentMinor: toMinor(principalPortion + interest),
      interestMinor: toMinor(interest),
      principalMinor: toMinor(principalPortion),
      balanceMinor: toMinor(Math.max(0, newBalance)),
      extraPaymentMinor: extraOnDueDate > 0 ? toMinor(extraOnDueDate) : undefined,
      isPast: dueDate < today,
    });

    balance = newBalance;
    lastDueDate = dueDate;
    indexSinceAnchor++;
    remainingCount--;
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
  const monthlyRate = monthlyRateOf(loan);
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
  const monthlyRate = monthlyRateOf(loan);
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

  const monthlyRate = monthlyRateOf(loan);
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
  const rows = buildRawSchedule(loan);
  return applyPaymentAdjustment(rows, loan.paymentAdjustmentMinor);
}

function buildRawSchedule(loan: MortgageLoan): AmortizationRow[] {
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

/**
 * Suma (o resta) `adjustmentMinor` al interés y a la cuota de cada período
 * regular (no a los de gracia), para reconciliar contra la cuota real del
 * banco cuando queda una diferencia mínima que no se puede replicar exacto.
 * No toca `principalMinor` ni `balanceMinor`: la amortización de capital
 * sigue el cálculo teórico tal cual.
 */
function applyPaymentAdjustment(rows: AmortizationRow[], adjustmentMinor: number | undefined): AmortizationRow[] {
  if (!adjustmentMinor) return rows;
  return rows.map((r) =>
    r.isGrace
      ? r
      : { ...r, interestMinor: r.interestMinor + adjustmentMinor, paymentMinor: r.paymentMinor + adjustmentMinor }
  );
}

export interface LoanSummary {
  currentPaymentMinor: number;
  balanceMinor: number;
  remainingInstallments: number;
  totalInstallments: number;
  nextDueDate: string | null;
  totalInterestMinor: number;
  totalPrepaidMinor: number;
  /** Suma de intereses de las cuotas que todavía no vencieron (a hoy). No incluye lo ya devengado/pagado. */
  remainingInterestMinor: number;
  /**
   * Suma de la porción de capital de las cuotas que todavía no vencieron (a
   * hoy), incluidas las filas de liquidación de amortización futuras si las
   * hubiera. Por construcción de la tabla, esto tiene que coincidir con
   * `balanceMinor` (salvo algún centésimo de redondeo) — se muestra aparte
   * como forma de reconciliar/auditar que la tabla cierra bien.
   */
  remainingPrincipalMinor: number;
  isPaidOff: boolean;
}

/** Resumen de estado actual del préstamo (a hoy) a partir de su tabla de amortización. */
export function loanSummary(schedule: AmortizationRow[]): LoanSummary {
  const today = todayISO();
  const future = schedule.filter((r) => r.dueDate >= today);
  const next = future[0] ?? schedule[schedule.length - 1];
  const totalInterestMinor = schedule.reduce((s, r) => s + r.interestMinor, 0);
  const totalPrepaidMinor = schedule.reduce((s, r) => s + (r.extraPaymentMinor ?? 0), 0);
  const remainingInterestMinor = future.reduce((s, r) => s + r.interestMinor, 0);
  const remainingPrincipalMinor = future.reduce((s, r) => s + r.principalMinor, 0);

  return {
    currentPaymentMinor: next?.paymentMinor ?? 0,
    balanceMinor: next ? next.balanceMinor + next.principalMinor : 0,
    remainingInstallments: future.length,
    totalInstallments: schedule.length,
    nextDueDate: future[0]?.dueDate ?? null,
    remainingInterestMinor,
    remainingPrincipalMinor,
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
