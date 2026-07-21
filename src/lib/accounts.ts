import type { Account, Bank, Transaction, Transfer, CardPayment } from "../types";

/**
 * Saldo de una cuenta: saldo inicial + ingresos - gastos asignados a esa
 * cuenta, +/- transferencias donde la cuenta es origen o destino, - pagos de
 * tarjeta hechos desde esa cuenta. Si se pasa `asOfDate` (YYYY-MM-DD), solo
 * se consideran movimientos con fecha hasta ese día (saldo "a esa fecha");
 * sin `asOfDate` se consideran todos, incluidos los de fecha futura.
 */
export function accountBalance(
  account: Account,
  transactions: Transaction[],
  transfers: Transfer[] = [],
  cardPayments: CardPayment[] = [],
  asOfDate?: string
): number {
  const inRange = (d: string) => !asOfDate || d <= asOfDate;

  const movement = transactions
    .filter((t) => t.accountId === account.id && inRange(t.date))
    .reduce((sum, t) => sum + (t.type === "ingreso" ? t.amountMinor : -t.amountMinor), 0);

  const transferMovement = transfers.reduce((sum, tr) => {
    if (!inRange(tr.date)) return sum;
    if (tr.fromAccountId === account.id) sum -= tr.fromAmountMinor;
    if (tr.toAccountId === account.id) sum += tr.toAmountMinor;
    return sum;
  }, 0);

  const cardPaymentsMovement = cardPayments
    .filter((p) => p.accountId === account.id && inRange(p.date))
    .reduce((sum, p) => sum - p.amountMinor, 0);

  return account.initialBalanceMinor + movement + transferMovement + cardPaymentsMovement;
}

export function accountsByBank(accounts: Account[], bankId: string): Account[] {
  return accounts.filter((a) => a.bankId === bankId);
}

/** `false` solo si la caja se marcó explícitamente como inactiva; `undefined` (cajas viejas) cuenta como activa. */
export function isAccountActive(account: Account): boolean {
  return account.active !== false;
}

/**
 * Visibilidad de una caja en la vista Cuentas para una fecha puntual
 * (`asOfDate`, YYYY-MM-DD). Si la caja está activa hoy, siempre es visible.
 * Si está inactiva, solo es visible al consultar una fecha anterior a que se
 * haya desactivado (`inactiveSince`), para poder ver saldos históricos de
 * cuando todavía estaba activa.
 */
export function isAccountVisibleAt(account: Account, asOfDate: string): boolean {
  if (isAccountActive(account)) return true;
  if (!account.inactiveSince) return false;
  return asOfDate < account.inactiveSince;
}

/** "Banco · Caja", o solo el nombre de la caja si no se encuentra el banco (o la cuenta fue eliminada). */
export function accountLabel(account: Account | undefined, banks: Bank[]): string {
  if (!account) return "cuenta eliminada";
  const bank = banks.find((b) => b.id === account.bankId);
  return bank ? `${bank.name} · ${account.name}` : account.name;
}

/** "Banco · Caja · Moneda", para selects donde conviene ver la moneda junto al nombre (ej. elegir cuenta al cargar un movimiento). */
export function accountSelectLabel(account: Account | undefined, banks: Bank[]): string {
  if (!account) return "cuenta eliminada";
  return `${accountLabel(account, banks)} · ${account.currency}`;
}

/**
 * Texto listo para compartir (WhatsApp, etc.) cuando te piden los datos para
 * transferirte. Si la caja tiene `shareMessage` cargado (Configuración →
 * Bancos), se usa tal cual en vez de armarlo automáticamente.
 */
export function shareableAccountText(account: Account, banks: Bank[]): string {
  if (account.shareMessage && account.shareMessage.trim()) return account.shareMessage;
  const bank = banks.find((b) => b.id === account.bankId);
  const lines = [
    "Datos para transferencia:",
    bank ? `Banco: ${bank.name}` : null,
    `Cuenta: ${account.name}`,
    `Moneda: ${account.currency}`,
    account.accountNumber ? `Número de cuenta: ${account.accountNumber}` : null,
    account.branch ? `Sucursal: ${account.branch}` : null,
    account.holderName ? `Titular: ${account.holderName}` : null,
  ].filter((l): l is string => l !== null);
  return lines.join("\n");
}

export interface AccountLedgerEntry {
  date: string;
  /** Monto con signo, en la moneda de la cuenta: positivo = entra, negativo = sale. */
  amountMinor: number;
  runningBalanceMinor: number;
  kind: "transaction" | "transfer-out" | "transfer-in" | "card-payment";
  transaction?: Transaction;
  transfer?: Transfer;
  cardPayment?: CardPayment;
}

/**
 * Historial completo de una cuenta (movimientos propios, ambas patas de
 * transferencias donde participa, y pagos de tarjeta hechos desde ella), con
 * saldo corriendo, del más reciente al más antiguo. Pensado para la vista
 * "Movimientos de esta cuenta". Si se pasa `asOfDate`, no incluye movimientos
 * con fecha posterior (ver `accountBalance`).
 */
export function accountLedger(
  account: Account,
  transactions: Transaction[],
  transfers: Transfer[],
  cardPayments: CardPayment[] = [],
  asOfDate?: string
): AccountLedgerEntry[] {
  type Raw = {
    date: string;
    id: string;
    amountMinor: number;
    kind: AccountLedgerEntry["kind"];
    transaction?: Transaction;
    transfer?: Transfer;
    cardPayment?: CardPayment;
  };

  const inRange = (d: string) => !asOfDate || d <= asOfDate;

  const raw: Raw[] = [
    ...transactions
      .filter((t) => t.accountId === account.id && inRange(t.date))
      .map((t): Raw => ({ date: t.date, id: t.id, amountMinor: t.type === "ingreso" ? t.amountMinor : -t.amountMinor, kind: "transaction", transaction: t })),
    ...transfers
      .filter((tr) => tr.fromAccountId === account.id && inRange(tr.date))
      .map((tr): Raw => ({ date: tr.date, id: `${tr.id}-out`, amountMinor: -tr.fromAmountMinor, kind: "transfer-out", transfer: tr })),
    ...transfers
      .filter((tr) => tr.toAccountId === account.id && inRange(tr.date))
      .map((tr): Raw => ({ date: tr.date, id: `${tr.id}-in`, amountMinor: tr.toAmountMinor, kind: "transfer-in", transfer: tr })),
    ...cardPayments
      .filter((p) => p.accountId === account.id && inRange(p.date))
      .map((p): Raw => ({ date: p.date, id: `${p.id}-pay`, amountMinor: -p.amountMinor, kind: "card-payment", cardPayment: p })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  let running = account.initialBalanceMinor;
  const withBalance = raw.map((r) => {
    running += r.amountMinor;
    return { date: r.date, amountMinor: r.amountMinor, kind: r.kind, transaction: r.transaction, transfer: r.transfer, cardPayment: r.cardPayment, runningBalanceMinor: running };
  });

  return withBalance.reverse();
}
