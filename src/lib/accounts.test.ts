import { describe, it, expect } from "vitest";
import { accountBalance } from "./accounts";
import type { Account, Transaction } from "../types";

describe("accountBalance", () => {
  const account: Account = { id: "a1", bankId: "b1", name: "Caja de ahorro", currency: "UYU", initialBalanceMinor: 10000 };

  it("suma ingresos y resta gastos de esa cuenta", () => {
    const transactions: Transaction[] = [
      { id: "1", type: "ingreso", amountMinor: 5000, currency: "UYU", category: "Sueldo", date: "2026-07-01", accountId: "a1" },
      { id: "2", type: "gasto", amountMinor: 2000, currency: "UYU", category: "Alimentación", date: "2026-07-02", accountId: "a1" },
    ];
    expect(accountBalance(account, transactions)).toBe(10000 + 5000 - 2000);
  });

  it("ignora movimientos de otras cuentas o sin cuenta asignada", () => {
    const transactions: Transaction[] = [
      { id: "3", type: "ingreso", amountMinor: 99999, currency: "UYU", category: "Otros ingresos", date: "2026-07-01", accountId: "otra-cuenta" },
      { id: "4", type: "gasto", amountMinor: 500, currency: "UYU", category: "Ocio", date: "2026-07-01" },
    ];
    expect(accountBalance(account, transactions)).toBe(10000);
  });
});
