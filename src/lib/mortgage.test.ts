import { describe, it, expect } from "vitest";
import { buildSchedule, frenchPayment, frenchPaymentActual365, loanSummary } from "./mortgage";
import { fromMinor } from "./money";
import { addMonthsToDate } from "./dates";
import type { MortgageLoan } from "../types";

/**
 * Estos tests validan `dayCountConvention: "actual365"` contra dos vales
 * reales de un hipotecario UI de Santander (ver comentario largo en
 * `mortgage.ts#buildFrenchScheduleActual365`): el préstamo original, y el
 * mismo préstamo después de una amortización extraordinaria real que hizo
 * el titular (fuera de fecha de vencimiento, con "reduceInstallment").
 */

const VALE_ORIGINAL: MortgageLoan = {
  id: "test-vale-1",
  name: "Hipotecario UI (vale original)",
  principalMinor: Math.round(698407 * 100),
  currency: "UI",
  annualRatePct: 6.68,
  rateType: "effective",
  termMonths: 240,
  startDate: "2018-05-15",
  system: "frances",
  dayCountConvention: "actual365",
  prepayments: [],
};

describe("mortgage - actual365 (Actual/365, días corridos)", () => {
  it("reproduce la cuota real del vale original dentro de una tolerancia chica (redondeo bancario)", () => {
    const schedule = buildSchedule(VALE_ORIGINAL);
    expect(schedule).toHaveLength(240);
    // La cuota real del vale es 5.201,82 UI; nuestra fórmula cerrada (misma
    // TNA, misma convención de días) da ~5.200,48 UI. La diferencia de ~1,3 UI
    // (0,025%) no se explica por nuestro cálculo (ver nota en mortgage.ts) —
    // por eso existe `paymentAdjustmentMinor` para reconciliar el resto.
    const firstPayment = fromMinor(schedule[0].paymentMinor);
    expect(firstPayment).toBeGreaterThan(5195);
    expect(firstPayment).toBeLessThan(5205);
  });

  it("cierra el saldo en (casi) $0 en la última cuota", () => {
    const schedule = buildSchedule(VALE_ORIGINAL);
    const last = schedule[schedule.length - 1];
    expect(Math.abs(fromMinor(last.balanceMinor))).toBeLessThan(5); // unidades de UI, no centésimos
  });

  it("el interés total es cercano al real del banco (550.031,98 UI)", () => {
    const schedule = buildSchedule(VALE_ORIGINAL);
    const totalInterest = schedule.reduce((s, r) => s + fromMinor(r.interestMinor), 0);
    expect(totalInterest).toBeGreaterThan(548000);
    expect(totalInterest).toBeLessThan(552000);
  });

  it("reconstruye la amortización real: ~131.145,90 UI el 19/08/2020, 'reduceInstallment' -> cuota nueva ~4.164,61 UI", () => {
    const loan: MortgageLoan = {
      ...VALE_ORIGINAL,
      prepayments: [
        { id: "p1", date: "2020-08-19", amountMinor: Math.round(131145.9 * 100), strategy: "reduceInstallment" },
      ],
    };
    const schedule = buildSchedule(loan);

    const settlement = schedule.find((r) => r.isPrepaymentSettlement);
    expect(settlement).toBeDefined();
    expect(settlement!.dueDate).toBe("2020-08-19");

    // la primera cuota regular DESPUÉS de la amortización debe vencer un mes
    // después de la fecha de la amortización (19/09/2020), no el día 15.
    const settlementIdx = schedule.indexOf(settlement!);
    const nextRow = schedule[settlementIdx + 1];
    expect(nextRow.dueDate).toBe("2020-09-19");

    const nuevaCuota = fromMinor(nextRow.paymentMinor);
    expect(nuevaCuota).toBeGreaterThan(4160);
    expect(nuevaCuota).toBeLessThan(4170);

    // el saldo tiene que seguir cayendo el día 19 de cada mes de ahí en adelante.
    const followingRow = schedule[settlementIdx + 2];
    expect(followingRow.dueDate).toBe("2020-10-19");

    // y el préstamo tiene que cerrar en 0 igual que antes (mismo plazo, cuota nueva).
    const last = schedule[schedule.length - 1];
    expect(Math.abs(fromMinor(last.balanceMinor))).toBeLessThan(5);
  });

  it("una amortización que cruza un 29 de febrero bisiesto también cierra el saldo en (casi) $0, en ambas estrategias", () => {
    for (const strategy of ["reduceInstallment", "reduceTerm"] as const) {
      const loan: MortgageLoan = {
        ...VALE_ORIGINAL,
        prepayments: [{ id: "p1", date: "2028-03-10", amountMinor: Math.round(80000 * 100), strategy }],
      };
      const schedule = buildSchedule(loan);
      const last = schedule[schedule.length - 1];
      expect(Math.abs(fromMinor(last.balanceMinor))).toBeLessThan(5);
      // el vencimiento final tiene que haber corrido al día 10.
      expect(last.dueDate.slice(-2)).toBe("10");
    }
  });

  it("'reduceTerm' termina antes que el plazo original y ahorra más interés que 'reduceInstallment' para el mismo monto", () => {
    const base = { ...VALE_ORIGINAL, prepayments: [{ id: "p1", date: "2025-06-19" as string, amountMinor: Math.round(100000 * 100), strategy: "reduceTerm" as const }] };
    const withReduceTerm = buildSchedule(base);
    const withReduceInstallment = buildSchedule({ ...base, prepayments: [{ ...base.prepayments[0], strategy: "reduceInstallment" }] });

    expect(withReduceTerm.length).toBeLessThan(241); // 240 cuotas regulares + 1 fila de liquidación de la amortización
    expect(withReduceInstallment.length).toBe(241); // 240 cuotas regulares (mismo plazo) + 1 fila de liquidación

    const interestTerm = withReduceTerm.reduce((s, r) => s + fromMinor(r.interestMinor), 0);
    const interestInstallment = withReduceInstallment.reduce((s, r) => s + fromMinor(r.interestMinor), 0);
    expect(interestTerm).toBeLessThan(interestInstallment);
  });
});

describe("mortgage - actual365 con requestDate real (fecha de desembolso)", () => {
  it("con la fecha real de desembolso, la cuota 1 (y la cuota fija) coinciden casi exacto con el vale, sin ajuste", () => {
    const loan: MortgageLoan = { ...VALE_ORIGINAL, requestDate: "2018-04-16" }; // desembolso real: 29 días antes de la 1ª cuota, no 30
    const schedule = buildSchedule(loan);

    // sin paymentAdjustmentMinor, la cuota calculada tiene que coincidir con la real del vale (5.201,82 UI).
    expect(fromMinor(schedule[0].paymentMinor)).toBeCloseTo(5201.82, 1);

    // el interés de cada una de las primeras cuotas tiene que quedar a menos de 1 UI del real del banco.
    const realFirstFive = [3597.4, 3837.35, 3705.96, 3821.59, 3813.99];
    realFirstFive.forEach((real, i) => {
      expect(Math.abs(fromMinor(schedule[i].interestMinor) - real)).toBeLessThan(1);
    });

    const last = schedule[schedule.length - 1];
    expect(Math.abs(fromMinor(last.balanceMinor))).toBeLessThan(0.01);
  });

  it("sin requestDate, el error en la cuota 1 es más grande (asume 30 días en vez de los 29 reales)", () => {
    const withRequestDate = buildSchedule({ ...VALE_ORIGINAL, requestDate: "2018-04-16" });
    const withoutRequestDate = buildSchedule(VALE_ORIGINAL);
    const errorWith = Math.abs(fromMinor(withRequestDate[0].interestMinor) - 3597.4);
    const errorWithout = Math.abs(fromMinor(withoutRequestDate[0].interestMinor) - 3597.4);
    expect(errorWith).toBeLessThan(errorWithout);
  });
});

describe("mortgage - numeración de cuotas tras una amortización (actual365)", () => {
  it("la cuota regular siguiente a la liquidación sigue la numeración sin saltarse un número", () => {
    const loan: MortgageLoan = {
      ...VALE_ORIGINAL,
      prepayments: [
        { id: "p1", date: "2020-08-19", amountMinor: Math.round(131145.9 * 100), strategy: "reduceInstallment" },
      ],
    };
    const schedule = buildSchedule(loan);
    const settlementIdx = schedule.findIndex((r) => r.isPrepaymentSettlement);

    // la última cuota regular antes de la amortización es la #28 (venció el 15/08/2020).
    expect(schedule[settlementIdx - 1].number).toBe(28);
    // la fila de liquidación no "gasta" un número: la siguiente cuota regular tiene que ser
    // la #29, no la #30 (antes de este fix, la liquidación corría +1 la numeración de ahí en más).
    expect(schedule[settlementIdx + 1].number).toBe(29);
    // y la última cuota del préstamo sigue siendo la #240 en total (240 cuotas regulares + 1 liquidación).
    expect(schedule[schedule.length - 1].number).toBe(240);
    expect(schedule).toHaveLength(241);
  });

  it("loanSummary no cuenta la liquidación como una cuota más (totalInstallments tiene que ser 240, no 241)", () => {
    const loan: MortgageLoan = {
      ...VALE_ORIGINAL,
      prepayments: [
        { id: "p1", date: "2020-08-19", amountMinor: Math.round(131145.9 * 100), strategy: "reduceInstallment" },
      ],
    };
    const summary = loanSummary(buildSchedule(loan));
    expect(summary.totalInstallments).toBe(240);
  });
});

describe("mortgage - interés y capital pendiente de vencer (loanSummary)", () => {
  it("el capital pendiente de vencer coincide con el saldo de capital a hoy", () => {
    const schedule = buildSchedule(VALE_ORIGINAL);
    const summary = loanSummary(schedule);
    // por construcción de la tabla, la suma del capital de las cuotas que no vencieron
    // todavía tiene que coincidir con el saldo de capital actual (a menos de 1 UI de redondeo).
    expect(Math.abs(summary.remainingPrincipalMinor - summary.balanceMinor)).toBeLessThan(100); // 100 = 1 UI en centésimos
  });

  it("el interés pendiente de vencer es menor al interés total del préstamo", () => {
    const schedule = buildSchedule(VALE_ORIGINAL);
    const summary = loanSummary(schedule);
    expect(summary.remainingInterestMinor).toBeGreaterThan(0);
    expect(summary.remainingInterestMinor).toBeLessThan(summary.totalInterestMinor);
  });
});

describe("mortgage - regresión de la convención 'monthly' existente", () => {
  it("sin dayCountConvention (undefined) usa la fórmula mensual de siempre, sin cambios", () => {
    const loan: MortgageLoan = { ...VALE_ORIGINAL, dayCountConvention: undefined };
    const schedule = buildSchedule(loan);
    // Cuota fija clásica (tasa mensual efectiva de la TEA, sin días corridos).
    const monthlyRate = Math.pow(1 + 0.0668, 1 / 12) - 1;
    const expectedPayment = frenchPayment(698407, monthlyRate, 240);
    expect(fromMinor(schedule[0].paymentMinor)).toBeCloseTo(expectedPayment, 1);
    // sin actual365 no hay filas de liquidación de amortización.
    expect(schedule.some((r) => r.isPrepaymentSettlement)).toBe(false);
  });
});

describe("frenchPaymentActual365", () => {
  it("da 0 con principal 0 o sin fechas", () => {
    expect(frenchPaymentActual365(0, 0.05, "2020-01-01", ["2020-02-01"])).toBe(0);
    expect(frenchPaymentActual365(1000, 0.05, "2020-01-01", [])).toBe(0);
  });

  it("con una sola cuota, equivale a devolver principal + interés de ese período", () => {
    const cuota = frenchPaymentActual365(1000, 0.10, "2020-01-01", ["2020-02-01"]); // 31 días
    const expectedInterest = 1000 * (0.10 / 365) * 31;
    expect(cuota).toBeCloseTo(1000 + expectedInterest, 6);
  });

  it("con muchas cuotas, cierra el saldo exactamente en $0 al iterar día a día", () => {
    const first = "2021-01-15";
    const dueDates = Array.from({ length: 36 }, (_, i) => addMonthsToDate(first, i));
    const annualRate = 0.08;
    const principal = 50000;
    const cuota = frenchPaymentActual365(principal, annualRate, addMonthsToDate(first, -1), dueDates);

    let balance = principal;
    let prev = addMonthsToDate(first, -1);
    for (const d of dueDates) {
      const days = (new Date(d).getTime() - new Date(prev).getTime()) / 86400000;
      const interest = balance * (annualRate / 365) * days;
      balance = balance + interest - cuota;
      prev = d;
    }
    expect(Math.abs(balance)).toBeLessThan(1e-6);
  });
});
