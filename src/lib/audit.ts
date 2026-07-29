import { formatMoney } from "./money";
import { formatDateDMY } from "./dates";
import { categoryDisplayName } from "./categories";
import { accountLabel } from "./accounts";
import { cardLabel } from "./cards";
import type {
  Transaction,
  Transfer,
  CardPayment,
  Installment,
  ContactEntry,
  Category,
  Account,
  Bank,
  Card,
  Contact,
  AuditEntry,
  AuditFieldChange,
  AuditEntityType,
} from "../types";

/** "Foto" de un registro en un momento dado, campo legible → valor ya formateado para mostrar. */
type Snapshot = Record<string, string>;

/** Compara dos "fotos" del mismo registro y arma la lista de campos que cambiaron de verdad. */
function diffSnapshots(before: Snapshot, after: Snapshot): AuditFieldChange[] {
  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: AuditFieldChange[] = [];
  fields.forEach((field) => {
    const b = before[field] ?? "";
    const a = after[field] ?? "";
    if (b !== a) changes.push({ field, before: b, after: a });
  });
  return changes;
}

/** Medio de pago (cuenta o tarjeta, con extensión si corresponde) en texto, para Transaction/ContactEntry. */
function paymentMethodLabel(
  accountId: string | undefined,
  cardId: string | undefined,
  cardExtensionId: string | undefined,
  accounts: Account[],
  banks: Bank[],
  cards: Card[]
): string {
  if (accountId) return accountLabel(accounts.find((a) => a.id === accountId), banks);
  if (cardId) {
    const card = cards.find((c) => c.id === cardId);
    const ext = card?.extensions?.find((e) => e.id === cardExtensionId)?.name;
    return cardLabel(card, banks) + (ext ? ` (${ext})` : "");
  }
  return "Sin medio de pago";
}

// ---------------------------------------------------------------------------
// Transaction
// ---------------------------------------------------------------------------

function transactionSnapshot(t: Transaction, categories: Category[], accounts: Account[], banks: Bank[], cards: Card[]): Snapshot {
  return {
    Tipo: t.type === "ingreso" ? "Ingreso" : "Gasto",
    Categoría: t.category ? categoryDisplayName(t.category, categories) : "Sin categorizar",
    Importe: formatMoney(t.amountMinor, t.currency),
    Fecha: formatDateDMY(t.date),
    "Medio de pago": paymentMethodLabel(t.accountId, t.cardId, t.cardExtensionId, accounts, banks, cards),
    Nota: t.note?.trim() || "—",
  };
}

export function transactionAuditSummary(t: Transaction, categories: Category[]): string {
  const cat = t.category ? categoryDisplayName(t.category, categories) : "Sin categorizar";
  return `${cat} · ${formatMoney(t.amountMinor, t.currency)} · ${formatDateDMY(t.date)}`;
}

export function transactionChanges(
  before: Transaction,
  after: Transaction,
  categories: Category[],
  accounts: Account[],
  banks: Bank[],
  cards: Card[]
): AuditFieldChange[] {
  return diffSnapshots(
    transactionSnapshot(before, categories, accounts, banks, cards),
    transactionSnapshot(after, categories, accounts, banks, cards)
  );
}

// ---------------------------------------------------------------------------
// Transfer
// ---------------------------------------------------------------------------

function transferSnapshot(tr: Transfer, accounts: Account[], banks: Bank[]): Snapshot {
  const fromAcc = accounts.find((a) => a.id === tr.fromAccountId);
  const toAcc = accounts.find((a) => a.id === tr.toAccountId);
  const sameCurrency = fromAcc && toAcc && fromAcc.currency === toAcc.currency;
  return {
    Desde: accountLabel(fromAcc, banks),
    Hacia: accountLabel(toAcc, banks),
    Importe: sameCurrency
      ? formatMoney(tr.fromAmountMinor, fromAcc.currency)
      : `${fromAcc ? formatMoney(tr.fromAmountMinor, fromAcc.currency) : ""} → ${toAcc ? formatMoney(tr.toAmountMinor, toAcc.currency) : ""}`,
    Fecha: formatDateDMY(tr.date),
    Nota: tr.note?.trim() || "—",
  };
}

export function transferAuditSummary(tr: Transfer, accounts: Account[], banks: Bank[]): string {
  const fromAcc = accounts.find((a) => a.id === tr.fromAccountId);
  const toAcc = accounts.find((a) => a.id === tr.toAccountId);
  return `${accountLabel(fromAcc, banks)} → ${accountLabel(toAcc, banks)} · ${formatMoney(tr.fromAmountMinor, fromAcc?.currency ?? "UYU")} · ${formatDateDMY(tr.date)}`;
}

export function transferChanges(before: Transfer, after: Transfer, accounts: Account[], banks: Bank[]): AuditFieldChange[] {
  return diffSnapshots(transferSnapshot(before, accounts, banks), transferSnapshot(after, accounts, banks));
}

// ---------------------------------------------------------------------------
// CardPayment
// ---------------------------------------------------------------------------

function cardPaymentSnapshot(p: CardPayment, accounts: Account[], banks: Bank[], cards: Card[]): Snapshot {
  return {
    Tarjeta: cardLabel(cards.find((c) => c.id === p.cardId), banks),
    Cuenta: accountLabel(accounts.find((a) => a.id === p.accountId), banks),
    Importe: formatMoney(p.amountMinor, p.currency),
    Fecha: formatDateDMY(p.date),
    Nota: p.note?.trim() || "—",
  };
}

export function cardPaymentAuditSummary(p: CardPayment, banks: Bank[], cards: Card[]): string {
  return `Pago ${cardLabel(cards.find((c) => c.id === p.cardId), banks)} · ${formatMoney(p.amountMinor, p.currency)} · ${formatDateDMY(p.date)}`;
}

export function cardPaymentChanges(before: CardPayment, after: CardPayment, accounts: Account[], banks: Bank[], cards: Card[]): AuditFieldChange[] {
  return diffSnapshots(cardPaymentSnapshot(before, accounts, banks, cards), cardPaymentSnapshot(after, accounts, banks, cards));
}

// ---------------------------------------------------------------------------
// Installment
// ---------------------------------------------------------------------------

function installmentSnapshot(inst: Installment, categories: Category[], banks: Bank[], cards: Card[]): Snapshot {
  return {
    Descripción: inst.description,
    Categoría: inst.category ? categoryDisplayName(inst.category, categories) : "Sin categorizar",
    Tarjeta: cardLabel(cards.find((c) => c.id === inst.cardId), banks),
    "Importe total": formatMoney(inst.totalAmountMinor, inst.currency),
    Cuotas: `${inst.numInstallments} de ${formatMoney(inst.installmentAmountMinor, inst.currency)}`,
    Fecha: formatDateDMY(inst.date ?? `${inst.startMonth}-01`),
    Nota: inst.note?.trim() || "—",
  };
}

export function installmentAuditSummary(inst: Installment, categories: Category[]): string {
  const cat = inst.category ? categoryDisplayName(inst.category, categories) : "Sin categorizar";
  return `${inst.description} · ${cat} · ${formatMoney(inst.totalAmountMinor, inst.currency)} en ${inst.numInstallments} cuotas`;
}

export function installmentChanges(before: Installment, after: Installment, categories: Category[], banks: Bank[], cards: Card[]): AuditFieldChange[] {
  return diffSnapshots(installmentSnapshot(before, categories, banks, cards), installmentSnapshot(after, categories, banks, cards));
}

// ---------------------------------------------------------------------------
// ContactEntry
// ---------------------------------------------------------------------------

function contactEntrySnapshot(e: ContactEntry, contacts: Contact[], accounts: Account[], banks: Bank[], cards: Card[]): Snapshot {
  const contact = contacts.find((c) => c.id === e.contactId);
  return {
    Persona: contact?.name ?? "Persona eliminada",
    Descripción: e.description,
    Importe: `${e.amountMinor >= 0 ? "Te debe" : "Le debés"} ${formatMoney(Math.abs(e.amountMinor), e.currency)}`,
    Fecha: formatDateDMY(e.date),
    "Medio de pago": paymentMethodLabel(e.accountId, e.cardId, e.cardExtensionId, accounts, banks, cards),
  };
}

export function contactEntryAuditSummary(e: ContactEntry, contacts: Contact[]): string {
  const contact = contacts.find((c) => c.id === e.contactId);
  return `${contact?.name ?? "Persona eliminada"} · ${e.description} · ${formatMoney(Math.abs(e.amountMinor), e.currency)}`;
}

export function contactEntryChanges(
  before: ContactEntry,
  after: ContactEntry,
  contacts: Contact[],
  accounts: Account[],
  banks: Bank[],
  cards: Card[]
): AuditFieldChange[] {
  return diffSnapshots(
    contactEntrySnapshot(before, contacts, accounts, banks, cards),
    contactEntrySnapshot(after, contacts, accounts, banks, cards)
  );
}

// ---------------------------------------------------------------------------
// Builders genéricos de AuditEntry
// ---------------------------------------------------------------------------

export function makeCreateEntry(entityType: AuditEntityType, entityId: string, userId: string | null | undefined, summary: string): AuditEntry {
  return { id: crypto.randomUUID(), entityType, entityId, action: "create", at: new Date().toISOString(), userId: userId ?? null, summary };
}

export function makeDeleteEntry(entityType: AuditEntityType, entityId: string, userId: string | null | undefined, summary: string): AuditEntry {
  return { id: crypto.randomUUID(), entityType, entityId, action: "delete", at: new Date().toISOString(), userId: userId ?? null, summary };
}

/** Devuelve `null` si `changes` está vacío: no vale la pena guardar un evento de "modificación" que no cambió nada. */
export function makeUpdateEntry(
  entityType: AuditEntityType,
  entityId: string,
  userId: string | null | undefined,
  summary: string,
  changes: AuditFieldChange[]
): AuditEntry | null {
  if (changes.length === 0) return null;
  return { id: crypto.randomUUID(), entityType, entityId, action: "update", at: new Date().toISOString(), userId: userId ?? null, summary, changes };
}

/** Etiqueta legible de cada tipo de entidad, para la pantalla global de Auditoría. */
export function entityTypeLabel(entityType: AuditEntityType): string {
  switch (entityType) {
    case "transaction": return "Movimiento";
    case "transfer": return "Transferencia";
    case "cardPayment": return "Pago de tarjeta";
    case "installment": return "Compra en cuotas";
    case "contactEntry": return "Movimiento con persona";
  }
}

/** Etiqueta legible de la acción, para mostrar en la UI. */
export function auditActionLabel(action: AuditEntry["action"]): string {
  switch (action) {
    case "create": return "Alta";
    case "update": return "Modificación";
    case "delete": return "Baja";
  }
}
