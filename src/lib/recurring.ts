import type { Currency, FinanceData, RecurringRule, Transaction } from "../types";
import { todayISO, addMonthsToDate, addDaysToDate, addYearsToDate, monthKeyOf } from "./dates";

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

export interface RecurringDueItem {
  ruleId: string;
  label: string;
  amountMinor: number;
  currency: Currency;
  date: string; // YYYY-MM-DD
}

/**
 * Ocurrencias de reglas recurrentes de GASTO activas que van a cargarse en
 * algún día de `mk` pero todavía no se generaron como `Transaction` (porque
 * su fecha es posterior a hoy: `generateDueRecurringTransactions`, que corre
 * al abrir la app, todavía no llegó a esa fecha — `rule.nextDueDate` siempre
 * queda en el futuro después de esa función). Pensada para "Vencimientos"
 * de Inicio: apenas se generan, dejan de aparecer acá solas y pasan a
 * contarse en "Gastos" del mes como cualquier otro movimiento (siguen
 * visibles en Movimientos, con el ícono de recurrente).
 */
export function upcomingRecurringExpensesInMonth(rules: RecurringRule[], mk: string): RecurringDueItem[] {
  const items: RecurringDueItem[] = [];
  for (const rule of rules) {
    if (!rule.active || rule.type !== "gasto") continue;
    let date = rule.nextDueDate;
    let guard = 0; // tope de seguridad, igual que en generateDueRecurringTransactions
    while (monthKeyOf(date) <= mk && guard < 500) {
      if (monthKeyOf(date) === mk) {
        items.push({ ruleId: rule.id, label: rule.description, amountMinor: rule.amountMinor, currency: rule.currency, date });
      }
      date = advance(date, rule.period);
      guard++;
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date));
}
