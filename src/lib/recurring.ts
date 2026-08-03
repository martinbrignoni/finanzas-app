import type { Contact, ContactEntry, Currency, FinanceData, RecurringRule, Transaction } from "../types";
import { todayISO, addMonthsToDate, addDaysToDate, addYearsToDate, monthKeyOf } from "./dates";
import { resolveIvaContact } from "./contacts";

/** Devuelve la fecha de la próxima ocurrencia de una regla, según su período. */
function advance(date: string, period: RecurringRule["period"]): string {
  if (period === "diaria") return addDaysToDate(date, 1);
  if (period === "semanal") return addDaysToDate(date, 7);
  if (period === "mensual") return addMonthsToDate(date, 1);
  if (period === "trimestral") return addMonthsToDate(date, 3);
  return addYearsToDate(date, 1);
}

/**
 * Genera como `Transaction` normales todas las ocurrencias vencidas (fecha
 * <= hoy) de cada regla recurrente activa, avanzando `nextDueDate` de la
 * regla un período por cada una. Si la app estuvo un tiempo sin abrirse,
 * genera de una sola vez todas las que quedaron pendientes ("catch-up"), no
 * solo la última. Reglas pausadas (`active: false`) no generan nada.
 *
 * Si la regla tiene `ivaAmountMinor` cargado, cada ocurrencia se registra por
 * el neto (`amountMinor - ivaAmountMinor`) y, aparte, se genera un movimiento
 * en Personas contra Gustavo Brignoni por el IVA (mismo criterio que en
 * Nuevo Movimiento: crédito recuperable si es gasto/Compras, débito a
 * remitir si es ingreso/Ventas), ligado a la misma cuenta/tarjeta de la
 * regla para que el saldo real refleje el bruto.
 *
 * Si la regla tiene `personaContactId` cargado, cada ocurrencia genera
 * además un movimiento informativo en Personas contra ese contacto (sin
 * ligar a cuenta/tarjeta), por `personaAmountMinor` (o el 100% de
 * `amountMinor` si no está cargado), con signo a favor del usuario si es
 * ingreso o en contra si es gasto.
 *
 * Es una función pura: no muta `d`, devuelve un `FinanceData` nuevo (o el
 * mismo objeto si no había nada vencido, para no disparar guardados de más).
 */
export function generateDueRecurringTransactions(d: FinanceData): FinanceData {
  const today = todayISO();
  let transactions = d.transactions;
  let contacts = d.contacts;
  let contactEntries = d.contactEntries;
  let changed = false;

  // Si alguna ocurrencia necesita crear el contacto de IVA, lo hacemos una
  // sola vez para todas las reglas procesadas en esta corrida.
  let ivaContactId: string | null = null;
  const ensureIvaContactId = (): string => {
    if (ivaContactId) return ivaContactId;
    const { id, contactToCreate } = resolveIvaContact(contacts);
    if (contactToCreate) contacts = [...contacts, contactToCreate as Contact];
    ivaContactId = id;
    return id;
  };

  const rules = (d.recurringRules ?? []).map((rule) => {
    if (!rule.active) return rule;

    let nextDue = rule.nextDueDate;
    const newTx: Transaction[] = [];
    const newEntries: ContactEntry[] = [];
    // Tope de seguridad: evita un loop infinito si algún dato quedara corrupto.
    let guard = 0;
    while (nextDue <= today && guard < 500) {
      const now = new Date().toISOString();
      const txId = crypto.randomUUID();
      const isIngreso = rule.type === "ingreso";
      const ivaAmountMinor = rule.ivaAmountMinor && rule.ivaAmountMinor > 0 ? rule.ivaAmountMinor : 0;
      const netAmountMinor = ivaAmountMinor > 0 ? rule.amountMinor - ivaAmountMinor : rule.amountMinor;

      newTx.push({
        id: txId,
        type: rule.type,
        amountMinor: netAmountMinor,
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

      if (ivaAmountMinor > 0) {
        const contactId = ensureIvaContactId();
        newEntries.push({
          id: crypto.randomUUID(),
          contactId,
          date: nextDue,
          amountMinor: isIngreso ? -ivaAmountMinor : ivaAmountMinor,
          currency: rule.currency,
          accountId: rule.accountId,
          cardId: rule.type === "gasto" ? rule.cardId : undefined,
          description: `${isIngreso ? "IVA Ventas" : "IVA Compras"} · ${rule.description}`,
          createdByUserId: rule.createdByUserId,
          createdAt: now,
          updatedAt: now,
        });
      }

      if (rule.personaContactId) {
        const personaAmountMinor =
          rule.personaAmountMinor && rule.personaAmountMinor > 0 ? rule.personaAmountMinor : rule.amountMinor;
        newEntries.push({
          id: crypto.randomUUID(),
          contactId: rule.personaContactId,
          date: nextDue,
          amountMinor: isIngreso ? personaAmountMinor : -personaAmountMinor,
          currency: rule.currency,
          description: rule.description,
          createdByUserId: rule.createdByUserId,
          createdAt: now,
          updatedAt: now,
        });
      }

      nextDue = advance(nextDue, rule.period);
      guard++;
    }

    if (newTx.length === 0) return rule;
    changed = true;
    transactions = [...transactions, ...newTx];
    if (newEntries.length > 0) contactEntries = [...contactEntries, ...newEntries];
    return { ...rule, nextDueDate: nextDue };
  });

  if (!changed) return d;
  return { ...d, transactions, contacts, contactEntries, recurringRules: rules };
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
