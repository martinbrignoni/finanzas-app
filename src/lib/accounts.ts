import type { Account, Transaction } from "../types";

/** Saldo actual de una cuenta: saldo inicial + ingresos - gastos asignados a esa cuenta. */
export function accountBalance(account: Account, transactions: Transaction[]): number {
  const movement = transactions
    .filter((t) => t.accountId === account.id)
    .reduce((sum, t) => sum + (t.type === "ingreso" ? t.amountMinor : -t.amountMinor), 0);
  return account.initialBalanceMinor + movement;
}

export function accountsByBank(accounts: Account[], bankId: string): Account[] {
  return accounts.filter((a) => a.bankId === bankId);
}
