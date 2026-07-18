import type { Account, Transaction, Transfer } from "../types";

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
