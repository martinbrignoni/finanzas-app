import { currentMonthKey, addMonths } from "./dates";
import type { Account, AccountStatement } from "../types";

/** Estado de cuenta de una caja para un mes puntual, si ya se cargó algo. */
export function getStatement(statements: AccountStatement[], accountId: string, month: string): AccountStatement | undefined {
  return statements.find((s) => s.accountId === accountId && s.month === month);
}

/** true si un mes ya tiene el estado de cuenta completo (PDF y Excel) para esa caja. */
export function isStatementComplete(statements: AccountStatement[], accountId: string, month: string): boolean {
  const st = getStatement(statements, accountId, month);
  return !!st?.pdfPath && !!st?.excelPath;
}

/**
 * Meses ya cerrados (anteriores al actual) a los que les falta el estado de
 * cuenta completo (PDF y Excel), para una caja con el recordatorio activo.
 * No mira meses anteriores a `statementRemindersSince` (el mes en que se
 * prendió el recordatorio), para no reclamar retroactivamente historial de
 * antes de haberlo activado.
 */
export function pendingStatementMonths(account: Account, statements: AccountStatement[]): string[] {
  if (!account.statementReminders || !account.statementRemindersSince) return [];
  const thisMonth = currentMonthKey();
  const months: string[] = [];
  let m = account.statementRemindersSince;
  while (m < thisMonth) {
    if (!isStatementComplete(statements, account.id, m)) months.push(m);
    m = addMonths(m, 1);
  }
  return months;
}
