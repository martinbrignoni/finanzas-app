import { describe, it, expect } from "vitest";
import { installmentsDueInMonth, buildProjection } from "./projection";
import { emptyFinanceData } from "../types";
import { currentMonthKey, addMonths } from "./dates";

describe("projection", () => {
  it("detecta una cuota que cae dentro del rango de meses de la compra", () => {
    const data = emptyFinanceData();
    const mk = currentMonthKey();
    data.installments.push({
      id: "1",
      cardId: "c1",
      description: "Notebook",
      currency: "USD",
      totalAmountMinor: 120000,
      numInstallments: 12,
      startMonth: mk,
      installmentAmountMinor: 10000,
    });

    expect(installmentsDueInMonth(data, mk).USD).toBe(10000);
    expect(installmentsDueInMonth(data, addMonths(mk, 11)).USD).toBe(10000);
    expect(installmentsDueInMonth(data, addMonths(mk, 12)).USD).toBe(0); // ya terminó de pagarse
  });

  it("genera la cantidad de meses solicitada", () => {
    const months = buildProjection(emptyFinanceData(), 6);
    expect(months).toHaveLength(6);
  });
});
