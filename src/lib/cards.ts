import type { Card, Bank, Currency, Installment, Transaction, CardPayment, CardStatement, ContactEntry } from "../types";
import { monthKeyOf, monthsBetween, addMonths } from "./dates";
import { getCardStatement } from "./cardStatements";

/**
 * Nombre a mostrar de una tarjeta con su banco emisor delante (ej. "ITAU
 * Visa"), para distinguirla de tarjetas iguales de otros bancos en selects y
 * listados (varias tarjetas pueden llamarse igual, ej. "Visa" en dos bancos
 * distintos).
 */
export function cardLabel(card: Card | undefined, banks: Bank[]): string {
  if (!card) return "tarjeta eliminada";
  const bank = banks.find((b) => b.id === card.bankId);
  return bank ? `${bank.name} ${card.name}` : card.name;
}

/** Nombre de quién usó la tarjeta (una extensión puntual), o null si la pagó el titular o no aplica. */
export function cardExtensionLabel(cards: Card[], cardId: string | undefined, extensionId: string | undefined): string | null {
  if (!cardId || !extensionId) return null;
  const card = cards.find((c) => c.id === cardId);
  return card?.extensions?.find((e) => e.id === extensionId)?.name ?? "Extensión eliminada";
}

/** Cuota (por moneda) que vence este mes puntualmente para una tarjeta, para sugerir el monto de pago. */
export function dueForCardInMonth(cardId: string, installments: Installment[], mk: string): Record<Currency, number> {
  const due: Record<Currency, number> = { UYU: 0, USD: 0 };
  installments.filter((i) => i.cardId === cardId).forEach((inst) => {
    const idx = monthsBetween(inst.startMonth, mk);
    if (idx >= 0 && idx < inst.numInstallments) due[inst.currency] += inst.installmentAmountMinor;
  });
  return due;
}

/**
 * Consumo total de un período puntual (mes) para una tarjeta: cuotas que
 * vencen ese mes + gastos de pago único fechados ese mes + movimientos con
 * personas pagados con esta tarjeta (ver `ContactEntry.cardId`) fechados ese
 * mes. Es lo que debería figurar en el estado de cuenta de ese período.
 */
/**
 * Mes del resumen (YYYY-MM, el período que CIERRA ese mes) en el que cae una
 * compra hecha con la tarjeta en `date`, según su día de cierre. Ej. con
 * cierre el 20, una compra del 25/10 entra en el resumen que cierra en
 * noviembre, no en el de octubre. Si el mes tiene menos días que el día de
 * cierre (ej. cierre 31 en noviembre), cierra el último día del mes.
 */
export function statementMonthOf(card: Pick<Card, "closingDay">, date: string): string {
  const mk = monthKeyOf(date);
  const day = Number(date.slice(8, 10));
  const [y, m] = mk.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const closing = Math.min(card.closingDay || lastDay, lastDay);
  return day > closing ? addMonths(mk, 1) : mk;
}

export function cardConsumptionForMonth(
  card: Pick<Card, "id" | "closingDay">,
  installments: Installment[],
  transactions: Transaction[],
  contactEntries: ContactEntry[],
  mk: string
): Record<Currency, number> {
  const cardId = card.id;
  const total = dueForCardInMonth(cardId, installments, mk);
  transactions
    .filter((t) => t.type === "gasto" && t.cardId === cardId && statementMonthOf(card, t.date) === mk)
    .forEach((t) => {
      total[t.currency] += t.amountMinor;
    });
  contactEntries
    .filter((e) => e.cardId === cardId && statementMonthOf(card, e.date) === mk)
    .forEach((e) => {
      total[e.currency] += Math.abs(e.amountMinor);
    });
  return total;
}

/** Último día del mes `mk` (1-31), para no generar una fecha inválida (ej. 31 de febrero) al estimar un vencimiento. */
function clampDayInMonth(mk: string, day: number): string {
  const [y, m] = mk.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${mk}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

/**
 * Fecha de vencimiento "efectiva" del estado de cuenta de una tarjeta que
 * cierra en `statementMonth`: la real (`CardStatement.dueDate`) si ya se
 * cargó, o si no una estimación a partir de `card.dueDay`/`card.closingDay`.
 * Estimación: si el día de vencimiento es igual o posterior al de cierre,
 * asumimos que vence el mismo mes que cierra; si es anterior (el caso más
 * común: cierra ~día 20, vence ~día 5), asumimos que vence al mes siguiente.
 * Es una aproximación: para tarjetas con vencimientos que se corren por fin
 * de semana o feriado, cargar la fecha real en Tarjetas > Estado de cuenta
 * la reemplaza automáticamente acá.
 */
function effectiveCardDueDate(card: Card, cardStatements: CardStatement[], statementMonth: string): string {
  const explicit = getCardStatement(cardStatements, card.id, statementMonth)?.dueDate;
  if (explicit) return explicit;
  const dueMonth = card.dueDay >= card.closingDay ? statementMonth : addMonths(statementMonth, 1);
  return clampDayInMonth(dueMonth, card.dueDay);
}

export interface CardDueItem {
  cardId: string;
  currency: Currency;
  amountMinor: number;
  /** Mes (YYYY-MM) del estado de cuenta que generó este saldo (el que cierra, no el que vence). */
  statementMonth: string;
  dueDate: string;
}

/**
 * Saldo a pagar (por tarjeta y moneda) de los estados de cuenta cuyo
 * vencimiento cae dentro de `dueMonth`, para usar en "Vencimientos" de
 * Inicio. El saldo es `cardConsumptionForMonth` del período que cierra (que
 * puede ser `dueMonth` o el mes anterior, según `effectiveCardDueDate`).
 *
 * Un saldo se considera ya pagado (y no se devuelve) si hay al menos un
 * `CardPayment` de esa tarjeta y moneda registrado durante `dueMonth`: no
 * concilia si el pago cubre el importe completo, solo detecta que "el
 * movimiento ya se cargó" (que es lo que le importa a Inicio para dejar de
 * reclamarlo). Para un control más fino de pagos parciales, ver el detalle
 * de cada tarjeta en Tarjetas.
 */
export function cardsDueInMonth(
  cards: Card[],
  installments: Installment[],
  transactions: Transaction[],
  contactEntries: ContactEntry[],
  cardPayments: CardPayment[],
  cardStatements: CardStatement[],
  dueMonth: string
): CardDueItem[] {
  const items: CardDueItem[] = [];
  const candidateStatementMonths = [addMonths(dueMonth, -1), dueMonth];
  for (const card of cards) {
    for (const statementMonth of candidateStatementMonths) {
      const dueDate = effectiveCardDueDate(card, cardStatements, statementMonth);
      if (monthKeyOf(dueDate) !== dueMonth) continue;
      const consumption = cardConsumptionForMonth(card, installments, transactions, contactEntries, statementMonth);
      (["UYU", "USD"] as Currency[]).forEach((cur) => {
        if (consumption[cur] <= 0) return;
        // Se descuenta lo ya pagado en el mes del vencimiento. Antes cualquier
        // pago (aunque fuera parcial, ej. el mínimo) daba el resumen por
        // pagado entero y el saldo restante desaparecía de Inicio.
        const paid = cardPayments
          .filter((p) => p.cardId === card.id && p.currency === cur && monthKeyOf(p.date) === dueMonth)
          .reduce((sum, p) => sum + p.amountMinor, 0);
        const remaining = consumption[cur] - paid;
        if (remaining <= 0) return;
        items.push({ cardId: card.id, currency: cur, amountMinor: remaining, statementMonth, dueDate });
      });
    }
  }
  return items;
}
