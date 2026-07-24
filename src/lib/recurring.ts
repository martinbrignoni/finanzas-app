import type { FinanceData, RecurringRule, Transaction } from "../types";
import { todayISO, addMonthsToDate, addDaysToDate, addYearsToDate } from "./dates";

/** Devuelve la fecha de la próxima ocurrencia de una regla, según su período. */
function advance(date: string, period: RecurringRule["period"]): string {
  if (period === "mensual") return addMonthsToDate(date, 1);
  if (period === "semanal") return addDaysToDate(date, 7);
  return addYearsToDate(date, 1);
}

/**
 * Genera como `Transaction` normales todas las ocurrencias vencidas (fecha
 * <= hoy) de cada regla recurrente activa, avanzando `nextDueDate` de la
 * regla un período por cada una. Si la app estuvo un tiempo sin abrirse,
 * genera de una sola vez todas las que quedaron pendientes ("catch-up"), no
 * solo la última. Reglas pausadas (`active: false`) no generan nada.
 *
 * Es una función pura: no muta `d`, devuelve un `FinanceData` nuevo (o el
 * mismo objeto si no había nada vencido, para no disparar guardados de más).
 */
export function generateDueRecurringTransactions(d: FinanceData): FinanceData {
  const today = todayISO();
  let transactions = d.transactions;
  let changed = false;

  const rules = (d.recurringRules ?? []).map((rule) => {
    if (!rule.active) return rule;

    let nextDue = rule.nextDueDate;
    const newTx: Transaction[] = [];
    // Tope de seguridad: evita un loop infinito si algún dato quedara corrupto.
    let guard = 0;
    while (nextDue <= today && guard < 500) {
      const now = new Date().toISOString();
      newTx.push({
        id: crypto.randomUUID(),
        type: rule.type,
        amountMinor: rule.amountMinor,
        currency: rule.currency,
        category: rule.category,
        date: nextDue,
        note: rule.note,
        accountId: rule.accountId,
        cardId: rule.type === "gasto" ? rule.cardId : undefined,
        createdByUserId: rule.createdByUserId,
        recurringRuleId: rule.id,
        createdAt: now,
        updatedAt: now,
      });
      nextDue = advance(nextDue, rule.period);
      guard++;
    }

    if (newTx.length === 0) return rule;
    changed = true;
    transactions = [...transactions, ...newTx];
    return { ...rule, nextDueDate: nextDue };
  });

  if (!changed) return d;
  return { ...d, transactions, recurringRules: rules };
}
