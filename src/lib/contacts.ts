import type { Contact, ContactEntry, Currency } from "../types";

/**
 * Saldo de un contacto: suma de sus entries por moneda. Positivo = te debe,
 * negativo = le debés, cero = está saldado.
 */
export function contactBalance(contact: Contact, entries: ContactEntry[]): Record<Currency, number> {
  const balance: Record<Currency, number> = { UYU: 0, USD: 0 };
  entries.filter((e) => e.contactId === contact.id).forEach((e) => {
    balance[e.currency] += e.amountMinor;
  });
  return balance;
}

/**
 * Impacto de un entry en el saldo de la cuenta propia que tenga vinculada
 * (si tiene): sale plata cuando el entry suma a favor tuyo (vos pusiste la
 * plata), entra cuando resta a favor tuyo (recibiste plata).
 */
export function contactEntryAccountImpact(entry: ContactEntry): number {
  return -entry.amountMinor;
}

/**
 * Categorías ya usadas en los contactos, para armar los chips de filtro y
 * sugerencias al crear uno nuevo. Siempre incluye algunas sugeridas
 * (Personas, Clientes, Familia) aunque todavía no se hayan usado.
 */
export function contactCategories(contacts: Contact[]): string[] {
  const suggested = ["Personas", "Clientes", "Familia"];
  const used = contacts.map((c) => c.category).filter((c): c is string => !!c);
  return Array.from(new Set([...suggested, ...used]));
}
