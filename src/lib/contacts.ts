import type { Contact, ContactEntry, Currency } from "../types";

/**
 * Nombre fijo del contacto (Personas) al que se le acreditan/debitan los
 * movimientos de IVA Compras/Ventas (ver Transactions.tsx y lib/recurring.ts).
 */
export const IVA_CONTACT_NAME = "Gustavo Brignoni";

/**
 * Busca el contacto de IVA por nombre (sin distinguir mayúsculas); si no
 * existe todavía, devuelve uno nuevo para crear junto con el movimiento que
 * lo necesita (ver `contactToCreate`).
 */
export function resolveIvaContact(contacts: Contact[]): { id: string; contactToCreate?: Contact } {
  const existing = contacts.find((c) => c.name.trim().toLowerCase() === IVA_CONTACT_NAME.toLowerCase());
  if (existing) return { id: existing.id };
  const id = crypto.randomUUID();
  return { id, contactToCreate: { id, name: IVA_CONTACT_NAME, kind: "persona" } };
}

/** `contact.kind`, con "persona" como default para contactos cargados antes de este campo. */
export function contactKind(contact: Contact): "persona" | "concepto" {
  return contact.kind ?? "persona";
}

/**
 * Un "concepto" se considera saldado (y deja de mostrarse en la lista
 * principal de Personas) cuando su saldo llega a cero en todas las monedas.
 * Las "persona" (personas, familia, clientes) siempre se consideran
 * vigentes, tengan saldo o no: son una relación duradera, no una
 * discriminación puntual.
 */
export function isContactSettled(contact: Contact, entries: ContactEntry[]): boolean {
  if (contactKind(contact) !== "concepto") return false;
  const balance = contactBalance(contact, entries);
  return balance.UYU === 0 && balance.USD === 0;
}

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
