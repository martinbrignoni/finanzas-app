import type { FinanceData, Reminder, ReminderRule, RecurrencePeriod } from "../types";
import { todayISO, addDaysToDate, addMonthsToDate, addYearsToDate, monthKeyOf } from "./dates";

/** Devuelve la fecha de la próxima ocurrencia de una regla, según su período. Mismo criterio que `lib/recurring.ts#advance`. */
function advance(date: string, period: RecurrencePeriod): string {
  if (period === "diaria") return addDaysToDate(date, 1);
  if (period === "semanal") return addDaysToDate(date, 7);
  if (period === "mensual") return addMonthsToDate(date, 1);
  if (period === "trimestral") return addMonthsToDate(date, 3);
  return addYearsToDate(date, 1);
}

/**
 * Genera como `Reminder` normales todas las ocurrencias vencidas (fecha <=
 * hoy) de cada `ReminderRule` activa, avanzando `nextDueDate` de la regla un
 * período por cada una ("catch-up", igual que
 * `lib/recurring.ts#generateDueRecurringTransactions"). Cada ocurrencia
 * generada queda totalmente independiente y editable.
 *
 * Es una función pura: no muta `d`, devuelve un `FinanceData` nuevo (o el
 * mismo objeto si no había nada vencido, para no disparar guardados de más).
 */
export function generateDueReminders(d: FinanceData): FinanceData {
  const today = todayISO();
  let reminders = d.reminders;
  let changed = false;

  const rules = (d.reminderRules ?? []).map((rule) => {
    if (!rule.active) return rule;

    let nextDue = rule.nextDueDate;
    const newReminders: Reminder[] = [];
    // Tope de seguridad: evita un loop infinito si algún dato quedara corrupto.
    let guard = 0;
    while (nextDue <= today && guard < 500) {
      const now = new Date().toISOString();
      newReminders.push({
        id: crypto.randomUUID(),
        title: rule.title,
        description: rule.description,
        date: nextDue,
        time: rule.time,
        priority: rule.priority,
        assignedUserIds: rule.assignedUserIds,
        createdByUserId: rule.createdByUserId,
        done: false,
        subtasks: (rule.subtasksTemplate ?? []).map((text) => ({ id: crypto.randomUUID(), text, done: false })),
        reminderRuleId: rule.id,
        notify: rule.notify,
        createdAt: now,
        updatedAt: now,
      });
      nextDue = advance(nextDue, rule.period);
      guard++;
    }

    if (newReminders.length === 0) return rule;
    changed = true;
    reminders = [...reminders, ...newReminders];
    return { ...rule, nextDueDate: nextDue };
  });

  if (!changed) return d;
  return { ...d, reminders, reminderRules: rules };
}

export interface UpcomingReminderOccurrence {
  ruleId: string;
  title: string;
  time?: string;
  priority: Reminder["priority"];
  date: string; // YYYY-MM-DD
}

/**
 * Ocurrencias futuras (virtuales, no persistidas) de reglas recurrentes
 * activas dentro del mes `mk`, para poder mostrarlas en la vista Calendario
 * aunque todavía no se hayan generado como `Reminder` real (eso recién pasa
 * cuando su fecha ya venció, ver `generateDueReminders`). Mismo criterio que
 * `lib/recurring.ts#upcomingRecurringExpensesInMonth`.
 */
export function upcomingReminderOccurrencesInMonth(rules: ReminderRule[], mk: string): UpcomingReminderOccurrence[] {
  const items: UpcomingReminderOccurrence[] = [];
  for (const rule of rules) {
    if (!rule.active) continue;
    let date = rule.nextDueDate;
    let guard = 0; // tope de seguridad, igual que en generateDueReminders
    while (monthKeyOf(date) <= mk && guard < 500) {
      if (monthKeyOf(date) === mk) {
        items.push({ ruleId: rule.id, title: rule.title, time: rule.time, priority: rule.priority, date });
      }
      date = advance(date, rule.period);
      guard++;
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
}

/** Orden de prioridad para desempatar listas (mayor primero). */
const PRIORITY_RANK: Record<Reminder["priority"], number> = { alta: 3, media: 2, baja: 1 };

/**
 * Orden por defecto de la lista de Recordatorios: primero los pendientes
 * (no completados) por fecha/hora ascendente (los más próximos primero,
 * vencidos incluidos), y dentro de un mismo momento, por prioridad
 * descendente; los completados quedan al final, más recientes primero.
 */
export function sortReminders(items: Reminder[]): Reminder[] {
  return [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.done && b.done) return (b.doneAt ?? "").localeCompare(a.doneAt ?? "");
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    const timeCmp = (a.time ?? "23:59").localeCompare(b.time ?? "23:59");
    if (timeCmp !== 0) return timeCmp;
    return PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
  });
}

/** Si el recordatorio ya venció (fecha/hora pasada) y sigue sin completarse. */
export function isReminderOverdue(r: Reminder): boolean {
  if (r.done) return false;
  const today = todayISO();
  if (r.date < today) return true;
  if (r.date > today) return false;
  if (!r.time) return false;
  const now = new Date();
  const nowHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return r.time < nowHM;
}

/** Para quién es un recordatorio, en texto: "Personal", un nombre, o varios separados por coma. */
export function assignedLabel(assignedUserIds: string[], users: { id: string; name: string }[]): string {
  if (assignedUserIds.length === 0) return "Personal";
  return assignedUserIds.map((id) => users.find((u) => u.id === id)?.name ?? "Perfil eliminado").join(", ");
}
