import { currentMonthKey, addMonths } from "./dates";
import type { Card, CardStatement } from "../types";

/** Estado de cuenta de una tarjeta para un período puntual, si ya se cargó algo. */
export function getCardStatement(statements: CardStatement[], cardId: string, month: string): CardStatement | undefined {
  return statements.find((s) => s.cardId === cardId && s.month === month);
}

/** true si un período ya tiene el estado de cuenta completo (PDF y Excel) para esa tarjeta. */
export function isCardStatementComplete(statements: CardStatement[], cardId: string, month: string): boolean {
  const st = getCardStatement(statements, cardId, month);
  return !!st?.pdfPath && !!st?.excelPath;
}

/**
 * Períodos ya cerrados (anteriores al actual) a los que les falta el estado
 * de cuenta completo (PDF y Excel) para una tarjeta con el recordatorio
 * activo. No mira períodos anteriores a `statementRemindersSince` (el mes en
 * que se prendió el recordatorio), para no reclamar retroactivamente
 * historial de antes de haberlo activado.
 */
export function pendingCardStatementMonths(card: Card, statements: CardStatement[]): string[] {
  if (!card.statementReminders || !card.statementRemindersSince) return [];
  const thisMonth = currentMonthKey();
  const months: string[] = [];
  let m = card.statementRemindersSince;
  while (m < thisMonth) {
    if (!isCardStatementComplete(statements, card.id, m)) months.push(m);
    m = addMonths(m, 1);
  }
  return months;
}
