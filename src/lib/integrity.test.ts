import { describe, it, expect, vi, afterEach } from "vitest";
import { emptyFinanceData, type Card, type Category, type FinanceData, type MortgageLoan, type Transaction } from "../types";
import { categoryFullPath, categoryMovePaths, findCategoryByPath, remapCategoryInData, repairOrphanCategoryPaths } from "./categories";
import { cardConsumptionForMonth, cardsDueInMonth, statementMonthOf } from "./cards";
import { accountReferences, bankReferences, describeReferences } from "./references";
import { generateDueMortgagePayments, mortgageDueInMonth } from "./mortgage";

const tx = (id: string, extra: Partial<Transaction> = {}): Transaction =>
  ({ id, type: "gasto", amountMinor: 1000, currency: "UYU", date: "2026-10-10", ...extra }) as Transaction;

describe("categorías", () => {
  const cats: Category[] = [
    { id: "hogar", name: "Hogar", type: "gasto" } as Category,
    { id: "auto", name: "Auto", type: "gasto" } as Category,
    { id: "seguro", name: "Seguro", type: "gasto", parentId: "hogar" } as Category,
  ];
  const base: FinanceData = {
    ...emptyFinanceData(),
    categories: cats,
    transactions: [tx("t1", { category: "Hogar > Seguro" })],
    budgets: [{ id: "b1", category: "Hogar > Seguro" } as never],
    recurringRules: [{ id: "r1", category: "Hogar > Seguro" } as never],
    mortgageLoans: [{ id: "m1", paymentCategory: "Hogar > Seguro" } as never],
  };

  it("mover una categoría reescribe el path en todos los registros", () => {
    const { oldPath, newPath } = categoryMovePaths(cats[2], cats, "auto");
    expect(newPath).toBe("Auto > Seguro");
    const moved = remapCategoryInData(
      { ...base, categories: cats.map((c) => (c.id === "seguro" ? { ...c, parentId: "auto" } : c)) },
      oldPath,
      newPath
    );
    expect(moved.transactions[0].category).toBe("Auto > Seguro");
    expect(findCategoryByPath(moved.transactions[0].category, moved.categories)?.id).toBe("seguro");
    expect(moved.budgets[0].category).toBe("Auto > Seguro");
    expect(moved.recurringRules[0].category).toBe("Auto > Seguro");
    expect(moved.mortgageLoans[0].paymentCategory).toBe("Auto > Seguro");
  });

  it("repara movimientos que quedaron huérfanos por un movimiento anterior", () => {
    const movedCats = cats.map((c) => (c.id === "seguro" ? { ...c, parentId: "auto" } : c));
    const { data, repaired } = repairOrphanCategoryPaths({ ...base, categories: movedCats });
    expect(data.transactions[0].category).toBe(categoryFullPath(movedCats[2], movedCats));
    expect(repaired).toBe(4);
  });

  it("no adivina si el nombre se repite en más de una rama", () => {
    const dup: Category[] = [...cats, { id: "seguro2", name: "Seguro", type: "gasto", parentId: "auto" } as Category];
    const orphan = { ...base, categories: dup, transactions: [tx("t1", { category: "Viejo > Seguro" })] };
    expect(repairOrphanCategoryPaths(orphan).data.transactions[0].category).toBe("Viejo > Seguro");
  });
});

describe("tarjetas", () => {
  const card = { id: "c", closingDay: 20, dueDay: 5 } as Card;

  it("una compra posterior al cierre va al resumen siguiente", () => {
    expect(statementMonthOf(card, "2026-10-20")).toBe("2026-10");
    expect(statementMonthOf(card, "2026-10-25")).toBe("2026-11");
    expect(statementMonthOf(card, "2026-12-25")).toBe("2027-01");
    const txs = [tx("a", { cardId: "c", date: "2026-10-25" })];
    expect(cardConsumptionForMonth(card, [], txs, [], "2026-10").UYU).toBe(0);
    expect(cardConsumptionForMonth(card, [], txs, [], "2026-11").UYU).toBe(1000);
  });

  it("cierre 31 en un mes de 30 días cierra el último día", () => {
    expect(statementMonthOf({ closingDay: 31 }, "2026-11-30")).toBe("2026-11");
  });

  it("un pago parcial deja el saldo restante como vencimiento", () => {
    const txs = [tx("a", { cardId: "c", amountMinor: 10000, date: "2026-10-10" })];
    const payments = [{ id: "p", cardId: "c", currency: "UYU", amountMinor: 3000, date: "2026-11-03", accountId: "x" } as never];
    const items = cardsDueInMonth([card], [], txs, [], payments, [], "2026-11");
    expect(items).toHaveLength(1);
    expect(items[0].amountMinor).toBe(7000);
    const paidAll = [{ ...(payments[0] as object), amountMinor: 10000 } as never];
    expect(cardsDueInMonth([card], [], txs, [], paidAll, [], "2026-11")).toHaveLength(0);
  });
});

describe("referencias (borrado seguro)", () => {
  const d: FinanceData = {
    ...emptyFinanceData(),
    accounts: [{ id: "a1", bankId: "b1" } as never, { id: "a2", bankId: "b1" } as never],
    transactions: [tx("t1", { accountId: "a1" }), tx("t2", { accountId: "a1" })],
    transfers: [{ id: "tr", fromAccountId: "a2", toAccountId: "zz" } as never],
  };
  it("detecta movimientos y transferencias de una caja", () => {
    expect(describeReferences(accountReferences(d, "a1"))).toBe("2 movimientos");
    expect(describeReferences(accountReferences(d, "a2"))).toBe("1 transferencia");
    expect(accountReferences(d, "a3")).toEqual([]);
  });
  it("suma las referencias de todas las cajas de un banco", () => {
    expect(describeReferences(bankReferences(d, "b1"))).toBe("2 movimientos y 1 transferencia");
  });
});

describe("hipoteca", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const loan: MortgageLoan = {
    id: "m",
    name: "Préstamo",
    principalMinor: 10_000_000,
    currency: "UYU",
    annualRatePct: 10,
    termMonths: 12,
    startDate: "2026-08-15",
    system: "frances",
    prepayments: [],
    paymentCategory: "Hogar > Hipoteca",
    paymentAccountId: "a1",
    paymentAutomationStartDate: "2026-08-01",
  };

  it("no regenera una cuota generada que después se eliminó", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T12:00:00-03:00"));
    const d0: FinanceData = { ...emptyFinanceData(), mortgageLoans: [loan] };
    const d1 = await generateDueMortgagePayments(d0);
    const generated = d1.transactions.filter((t) => t.mortgageLoanId === "m");
    expect(generated.length).toBeGreaterThan(0);

    // Se elimina una cuota generada: no tiene que volver a aparecer.
    const d2 = { ...d1, transactions: d1.transactions.filter((t) => t.id !== generated[0].id) };
    const d3 = await generateDueMortgagePayments(d2);
    expect(d3.transactions.filter((t) => t.mortgageLoanId === "m")).toHaveLength(generated.length - 1);
    // Y tampoco figura como pendiente en Vencimientos.
    const mk = generated[0].date.slice(0, 7);
    expect(mortgageDueInMonth(d3.mortgageLoans, d3.transactions, mk)).toHaveLength(0);
  });

  it("anota las cuotas generadas antes de existir el registro", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T12:00:00-03:00"));
    const d1 = await generateDueMortgagePayments({ ...emptyFinanceData(), mortgageLoans: [loan] });
    const legacy = { ...d1, mortgageLoans: [{ ...loan, generatedPaymentDates: undefined }] };
    const d2 = await generateDueMortgagePayments(legacy);
    expect(d2.transactions).toHaveLength(d1.transactions.length);
    expect(d2.mortgageLoans[0].generatedPaymentDates?.length).toBe(d1.transactions.length);
  });
});
