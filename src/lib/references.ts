import type { FinanceData } from "../types";

/**
 * Qué registros apuntan a una caja, tarjeta o banco. Se usa para no permitir
 * borrar algo que tiene historia: antes, borrar una caja eliminaba sus
 * transferencias (y con eso cambiaba el saldo de la OTRA caja) y sus pagos de
 * tarjeta (y la deuda de la tarjeta volvía a aparecer), sin dejar rastro.
 * Es el mismo criterio contable de "no se da de baja una cuenta con
 * movimientos": se desactiva.
 */
export interface Reference {
  label: string;
  count: number;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function only(refs: Reference[]): Reference[] {
  return refs.filter((r) => r.count > 0);
}

export function accountReferences(d: FinanceData, accountId: string): Reference[] {
  return only([
    { label: "movimiento", count: d.transactions.filter((t) => t.accountId === accountId).length },
    { label: "transferencia", count: d.transfers.filter((t) => t.fromAccountId === accountId || t.toAccountId === accountId).length },
    { label: "pago de tarjeta", count: d.cardPayments.filter((p) => p.accountId === accountId).length },
    { label: "movimiento con personas", count: d.contactEntries.filter((e) => e.accountId === accountId).length },
    { label: "recurrente", count: d.recurringRules.filter((r) => r.accountId === accountId).length },
    { label: "hipoteca", count: d.mortgageLoans.filter((m) => m.paymentAccountId === accountId).length },
  ]);
}

export function cardReferences(d: FinanceData, cardId: string): Reference[] {
  return only([
    { label: "gasto", count: d.transactions.filter((t) => t.cardId === cardId).length },
    { label: "compra en cuotas", count: d.installments.filter((i) => i.cardId === cardId).length },
    { label: "pago", count: d.cardPayments.filter((p) => p.cardId === cardId).length },
    { label: "movimiento con personas", count: d.contactEntries.filter((e) => e.cardId === cardId).length },
    { label: "recurrente", count: d.recurringRules.filter((r) => r.cardId === cardId).length },
  ]);
}

/** Referencias de un banco: las de todas sus cajas, más sus tarjetas. */
export function bankReferences(d: FinanceData, bankId: string): Reference[] {
  const totals = new Map<string, number>();
  for (const a of d.accounts.filter((x) => x.bankId === bankId)) {
    for (const r of accountReferences(d, a.id)) totals.set(r.label, (totals.get(r.label) ?? 0) + r.count);
  }
  const cards = d.cards.filter((c) => c.bankId === bankId).length;
  return only([...Array.from(totals, ([label, count]) => ({ label, count })), { label: "tarjeta", count: cards }]);
}

const PLURALS: Record<string, string> = {
  movimiento: "movimientos",
  transferencia: "transferencias",
  "pago de tarjeta": "pagos de tarjeta",
  "movimiento con personas": "movimientos con personas",
  recurrente: "recurrentes",
  hipoteca: "hipotecas",
  gasto: "gastos",
  "compra en cuotas": "compras en cuotas",
  pago: "pagos",
  tarjeta: "tarjetas",
};

/** "12 movimientos, 3 transferencias y 1 recurrente" */
export function describeReferences(refs: Reference[]): string {
  const parts = refs.map((r) => plural(r.count, r.label, PLURALS[r.label] ?? `${r.label}s`));
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}
