import type { Account, Bank, Transaction, Transfer } from "../types";

/**
 * Saldo actual de una cuenta: saldo inicial + ingresos - gastos asignados a
 * esa cuenta, +/- transferencias donde la cuenta es origen o destino.
 */
export function accountBalance(account: Account, transactions: Transaction[], transfers: Transfer[] = []): number {
  const movement = transactions
    .filter((t) => t.accountId === account.id)
    .reduce((sum, t) => sum + (t.type === "ingreso" ? t.amountMinor : -t.amountMinor), 0);

  const transferMovement = transfers.reduce((sum, tr) => {
    if (tr.fromAccountId === account.id) sum -= tr.fromAmountMinor;
    if (tr.toAccountId === account.id) sum += tr.toAmountMinor;
    return sum;
  }, 0);

  return account.initialBalanceMinor + movement + transferMovement;
}

export function accountsByBank(accounts: Account[], bankId: string): Account[] {
  return accounts.filter((a) => a.bankId === bankId);
}

/** "Banco · Caja", o solo el nombre de la caja si no se encuentra el banco (o la cuenta fue eliminada). */
export function accountLabel(account: Account | undefined, banks: Bank[]): string {
  if (!account) return "cuenta eliminada";
  const bank = banks.find((b) => b.id === account.bankId);
  return bank ? `${bank.name} · ${account.name}` : account.name;
}

export interface AccountLedgerEntry {
  date: string;
  /** Monto con signo, en la moneda de la cuenta: positivo = entra, negativo = sale. */
  amountMinor: number;
  runningBalanceMinor: number;
  kind: "transaction" | "transfer-out" | "transfer-in";
  transaction?: Transaction;
  transfer?: Transfer;
}

/**
 * Historial completo de una cuenta (movimientos propios + ambas patas de
 * transferencias donde participa), con saldo corriendo, del más reciente al
 * más antiguo. Pensado para la vista "Movimientos de esta cuenta".
 */
export function accountLedger(account: Account, transactions: Transaction[], transfers: Transfer[]): AccountLedgerEntry[] {
  type Raw = { date: string; id: string; amountMinor: number; kind: AccountLedgerEntry["kind"]; transaction?: Transaction; transfer?: Transfer };

  const raw: Raw[] = [
    ...transactions
      .filter((t) => t.accountId === account.id)
      .map((t): Raw => ({ date: t.date, id: t.id, amountMinor: t.type === "ingreso" ? t.amountMinor : -t.amountMinor, kind: "transaction", transaction: t })),
    ...transfers
      .filter((tr) => tr.fromAccountId === account.id)
      .map((tr): Raw => ({ date: tr.date, id: `${tr.id}-out`, amountMinor: -tr.fromAmountMinor, kind: "transfer-out", transfer: tr })),
    ...transfers
      .filter((tr) => tr.toAccountId === account.id)
      .map((tr): Raw => ({ date: tr.date, id: `${tr.id}-in`, amountMinor: tr.toAmountMinor, kind: "transfer-in", transfer: tr })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  let running = account.initialBalanceMinor;
  const withBalance = raw.map((r) => {
    running += r.amountMinor;
    return { date: r.date, amountMinor: r.amountMinor, kind: r.kind, transaction: r.transaction, transfer: r.transfer, runningBalanceMinor: running };
  });

  return withBalance.reverse();
}
