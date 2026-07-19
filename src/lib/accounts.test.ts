import { describe, it, expect } from "vitest";
import { accountBalance, shareableAccountText } from "./accounts";
import type { Account, Bank, Transaction, Transfer, CardPayment } from "../types";

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

  it("resta transferencias salientes y suma las entrantes, misma moneda", () => {
    const transfers: Transfer[] = [
      { id: "t1", date: "2026-07-01", fromAccountId: "a1", toAccountId: "a2", fromAmountMinor: 3000, toAmountMinor: 3000 },
      { id: "t2", date: "2026-07-02", fromAccountId: "a2", toAccountId: "a1", fromAmountMinor: 1000, toAmountMinor: 1000 },
    ];
    expect(accountBalance(account, [], transfers)).toBe(10000 - 3000 + 1000);
  });

  it("en transferencias entre monedas usa el monto de la pata correspondiente a la cuenta", () => {
    const usdAccount: Account = { id: "a2", bankId: "b1", name: "Caja USD", currency: "USD", initialBalanceMinor: 0 };
    const transfers: Transfer[] = [
      // 100 USD salen de a2, entran 4000 UYU a a1, cotización 40
      { id: "t3", date: "2026-07-01", fromAccountId: "a2", toAccountId: "a1", fromAmountMinor: 10000, toAmountMinor: 400000, exchangeRate: 40 },
    ];
    expect(accountBalance(usdAccount, [], transfers)).toBe(0 - 10000);
    expect(accountBalance(account, [], transfers)).toBe(10000 + 400000);
  });

  it("resta pagos de tarjeta hechos desde esa cuenta, e ignora los de otras cuentas", () => {
    const cardPayments: CardPayment[] = [
      { id: "p1", cardId: "c1", accountId: "a1", date: "2026-07-05", amountMinor: 1500, currency: "UYU" },
      { id: "p2", cardId: "c1", accountId: "otra-cuenta", date: "2026-07-05", amountMinor: 99999, currency: "UYU" },
    ];
    expect(accountBalance(account, [], [], cardPayments)).toBe(10000 - 1500);
  });
});

describe("shareableAccountText", () => {
  const banks: Bank[] = [{ id: "b1", name: "Santander" }];

  it("incluye titular y número de cuenta cuando están cargados", () => {
    const account: Account = {
      id: "a1",
      bankId: "b1",
      name: "Caja de ahorro",
      currency: "UYU",
      initialBalanceMinor: 0,
      holderName: "María Pérez",
      accountNumber: "001234567",
    };
    const text = shareableAccountText(account, banks);
    expect(text).toContain("Banco: Santander");
    expect(text).toContain("Titular: María Pérez");
    expect(text).toContain("Número de cuenta: 001234567");
  });

  it("omite titular y número de cuenta cuando no están cargados", () => {
    const account: Account = { id: "a2", bankId: "b1", name: "Cuenta corriente", currency: "USD", initialBalanceMinor: 0 };
    const text = shareableAccountText(account, banks);
    expect(text).not.toContain("Titular");
    expect(text).not.toContain("Número de cuenta");
  });
});
