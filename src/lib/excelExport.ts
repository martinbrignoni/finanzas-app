import * as XLSX from "xlsx";
import { fromMinor } from "./money";
import { accountBalance, accountLabel, ledgerEntryLabel, type AccountLedgerEntry } from "./accounts";
import { categoryFullPath } from "./categories";
import { cardLabel, cardExtensionLabel } from "./cards";
import type { Bank, Account, Transaction, Transfer, CardPayment, ContactEntry, Category, Installment, Card, Contact, FamilyMember, AppUser, Budget, RecurringRule, AuditEntry } from "../types";
import { RECURRENCE_PERIOD_LABELS } from "../types";
import type { ExchangeRateRow } from "./exchangeRates";
import type { ReconciliationResult } from "./reconciliation";
import { contactEntryAccountImpact, contactKind, contactBalance, isContactSettled } from "./contacts";
import { entityTypeLabel, auditActionLabel } from "./audit";
import { todayISO, formatDateTimeDMY, currentMonthKey, monthKeyOf } from "./dates";

/** Nombres de hoja de Excel: máx 31 caracteres, sin : \ / ? * [ ] */
function sheetName(raw: string): string {
  return raw.replace(/[:\\/?*[\]]/g, "-").slice(0, 31) || "Cuenta";
}

/** Nombre del perfil (`AppUser`) que cargó un registro, para la columna "Cargado por". */
function userName(users: AppUser[], id: string | undefined): string {
  return id ? users.find((u) => u.id === id)?.name ?? "" : "";
}

/**
 * Detalle de integrantes de familia asignados a un movimiento (ver
 * `Transaction.familyMemberIds`/`familyMemberAmounts`): nombre solo si es
 * compartido, o "Nombre (monto)" si tiene reparto cargado.
 */
function familyDetail(familyMembers: FamilyMember[], ids: string[] | undefined, amounts: Record<string, number> | undefined): string {
  if (!ids || ids.length === 0) return "";
  return ids
    .map((id) => {
      const name = familyMembers.find((m) => m.id === id)?.name;
      if (!name) return null;
      const amt = amounts?.[id];
      return amt ? `${name} (${fromMinor(amt)})` : name;
    })
    .filter((x): x is string => !!x)
    .join(", ");
}

export function exportBankToExcel(
  bank: Bank,
  accounts: Account[],
  transactions: Transaction[],
  transfers: Transfer[] = [],
  cardPayments: CardPayment[] = [],
  contactEntries: ContactEntry[] = []
): void {
  const wb = XLSX.utils.book_new();

  const summary = accounts.map((acc) => ({
    Cuenta: acc.name,
    Moneda: acc.currency,
    "Saldo inicial": fromMinor(acc.initialBalanceMinor),
    "Saldo actual": fromMinor(accountBalance(acc, transactions, transfers, cardPayments, undefined, contactEntries)),
  }));
  const summarySheet = XLSX.utils.json_to_sheet(summary);
  XLSX.utils.book_append_sheet(wb, summarySheet, "Resumen");

  const usedNames = new Set<string>(["Resumen"]);
  accounts.forEach((acc) => {
    const accTx = transactions
      .filter((t) => t.accountId === acc.id)
      .map((t) => ({
        Fecha: t.date,
        Tipo: t.type === "ingreso" ? "Ingreso" : "Gasto",
        Categoría: t.category ?? "",
        Nota: t.note ?? "",
        Monto: fromMinor(t.amountMinor) * (t.type === "gasto" ? -1 : 1),
        Moneda: t.currency,
      }));

    const accTransfersOut = transfers
      .filter((tr) => tr.fromAccountId === acc.id)
      .map((tr) => ({
        Fecha: tr.date,
        Tipo: "Transferencia enviada",
        Categoría: "",
        Nota: tr.note ?? "",
        Monto: -fromMinor(tr.fromAmountMinor),
        Moneda: acc.currency,
      }));

    const accTransfersIn = transfers
      .filter((tr) => tr.toAccountId === acc.id)
      .map((tr) => ({
        Fecha: tr.date,
        Tipo: "Transferencia recibida",
        Categoría: "",
        Nota: tr.note ?? "",
        Monto: fromMinor(tr.toAmountMinor),
        Moneda: acc.currency,
      }));

    const accCardPayments = cardPayments
      .filter((p) => p.accountId === acc.id)
      .map((p) => ({
        Fecha: p.date,
        Tipo: "Pago tarjeta",
        Categoría: "",
        Nota: p.note ?? "",
        Monto: -fromMinor(p.amountMinor),
        Moneda: p.currency,
      }));

    const accContactEntries = contactEntries
      .filter((e) => e.accountId === acc.id)
      .map((e) => ({
        Fecha: e.date,
        Tipo: "Personas",
        Categoría: "",
        Nota: e.description,
        Monto: fromMinor(contactEntryAccountImpact(e)),
        Moneda: e.currency,
      }));

    const accRows = [...accTx, ...accTransfersOut, ...accTransfersIn, ...accCardPayments, ...accContactEntries].sort((a, b) => a.Fecha.localeCompare(b.Fecha));

    let name = sheetName(acc.name);
    let suffix = 2;
    while (usedNames.has(name)) {
      name = sheetName(`${acc.name} (${suffix})`);
      suffix++;
    }
    usedNames.add(name);

    const sheet = XLSX.utils.json_to_sheet(accRows.length ? accRows : [{ Fecha: "", Tipo: "", Categoría: "", Nota: "Sin movimientos", Monto: "", Moneda: "" }]);
    XLSX.utils.book_append_sheet(wb, sheet, name);
  });

  const today = todayISO();
  const filename = `${bank.name.replace(/[^a-zA-Z0-9-_ ]/g, "")}_${today}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Exporta todos los movimientos (gastos/ingresos y compras en cuotas) de una
 * categoría puntual a un Excel de una sola hoja, ordenados por fecha.
 */
export function exportCategoryToExcel(
  category: Category,
  categories: Category[],
  transactions: Transaction[],
  installments: Installment[]
): void {
  const fullPath = categoryFullPath(category, categories);

  const txRows = transactions
    .filter((t) => t.category === fullPath)
    .map((t) => ({
      Fecha: t.date,
      Tipo: t.type === "ingreso" ? "Ingreso" : "Gasto",
      Nota: t.note ?? "",
      Monto: fromMinor(t.amountMinor) * (t.type === "gasto" ? -1 : 1),
      Moneda: t.currency,
    }));

  const instRows = installments
    .filter((i) => i.category === fullPath)
    .map((i) => ({
      Fecha: i.date ?? `${i.startMonth}-01`,
      Tipo: `Compra en cuotas (${i.numInstallments})`,
      Nota: [i.description, i.note].filter(Boolean).join(" · "),
      Monto: -fromMinor(i.totalAmountMinor),
      Moneda: i.currency,
    }));

  const rows = [...txRows, ...instRows].sort((a, b) => a.Fecha.localeCompare(b.Fecha));

  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(
    rows.length ? rows : [{ Fecha: "", Tipo: "", Nota: "Sin movimientos", Monto: "", Moneda: "" }]
  );
  XLSX.utils.book_append_sheet(wb, sheet, sheetName(category.name));

  const today = todayISO();
  XLSX.writeFile(wb, `${category.name.replace(/[^a-zA-Z0-9-_ ]/g, "")}_movimientos_${today}.xlsx`);
}

/**
 * Exporta TODO lo que se ve en Movimientos (gastos/ingresos, cuotas,
 * transferencias, pagos de tarjeta y movimientos con personas), cada tipo en
 * su propia hoja y con el máximo detalle disponible por columna: cuenta,
 * tarjeta y extensión, integrantes de familia asignados (y su reparto por
 * monto si está cargado), quién lo cargó, fecha de alta y última
 * modificación, cantidad de comprobantes, etc.
 */
export function exportMovementsToExcel(
  transactions: Transaction[],
  installments: Installment[],
  transfers: Transfer[],
  cardPayments: CardPayment[],
  contactEntries: ContactEntry[],
  accounts: Account[],
  banks: Bank[],
  cards: Card[],
  contacts: Contact[],
  familyMembers: FamilyMember[],
  users: AppUser[]
): void {
  const wb = XLSX.utils.book_new();

  const txRows = [...transactions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => ({
      Fecha: t.date,
      Tipo: t.type === "ingreso" ? "Ingreso" : "Gasto",
      Categoría: t.category ?? "",
      Nota: t.note ?? "",
      Monto: fromMinor(t.amountMinor) * (t.type === "gasto" ? -1 : 1),
      Moneda: t.currency,
      Cuenta: t.accountId ? accountLabel(accounts.find((a) => a.id === t.accountId), banks) : "",
      Tarjeta: t.cardId ? cardLabel(cards.find((c) => c.id === t.cardId), banks) : "",
      "Extensión tarjeta": cardExtensionLabel(cards, t.cardId, t.cardExtensionId) ?? "",
      "Cuota hipoteca": t.mortgageLoanId ? "Sí" : "",
      Recurrente: t.recurringRuleId ? "Sí" : "",
      "Integrante(s) de familia": familyDetail(familyMembers, t.familyMemberIds, t.familyMemberAmounts),
      Comprobantes: t.receiptPaths?.length ?? (t.receiptPath ? 1 : 0),
      "Cargado por": userName(users, t.createdByUserId),
      Alta: t.createdAt ? formatDateTimeDMY(t.createdAt) : "",
      "Última modificación": t.updatedAt ? formatDateTimeDMY(t.updatedAt) : "",
      ID: t.id,
    }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txRows.length ? txRows : [{ Fecha: "Sin movimientos" }]), "Gastos e ingresos");

  const instRows = [...installments]
    .sort((a, b) => (a.date ?? `${a.startMonth}-01`).localeCompare(b.date ?? `${b.startMonth}-01`))
    .map((i) => ({
      Fecha: i.date ?? `${i.startMonth}-01`,
      Descripción: i.description,
      Categoría: i.category ?? "",
      Nota: i.note ?? "",
      "Monto total": -fromMinor(i.totalAmountMinor),
      Moneda: i.currency,
      Cuotas: i.numInstallments,
      "Monto por cuota": fromMinor(i.installmentAmountMinor),
      "Mes de inicio": i.startMonth,
      Tarjeta: cardLabel(cards.find((c) => c.id === i.cardId), banks),
      "Extensión tarjeta": cardExtensionLabel(cards, i.cardId, i.cardExtensionId) ?? "",
      "Integrante(s) de familia": familyDetail(familyMembers, i.familyMemberIds, i.familyMemberAmounts),
      Comprobantes: i.receiptPaths?.length ?? (i.receiptPath ? 1 : 0),
      "Cargado por": userName(users, i.createdByUserId),
      Alta: i.createdAt ? formatDateTimeDMY(i.createdAt) : "",
      "Última modificación": i.updatedAt ? formatDateTimeDMY(i.updatedAt) : "",
      ID: i.id,
    }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(instRows.length ? instRows : [{ Fecha: "Sin cuotas" }]), "Cuotas");

  const transferRows = [...transfers]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((tr) => {
      const fromAcc = accounts.find((a) => a.id === tr.fromAccountId);
      const toAcc = accounts.find((a) => a.id === tr.toAccountId);
      return {
        Fecha: tr.date,
        "Cuenta origen": accountLabel(fromAcc, banks),
        "Cuenta destino": accountLabel(toAcc, banks),
        "Monto origen": fromMinor(tr.fromAmountMinor),
        "Moneda origen": fromAcc?.currency ?? "",
        "Monto destino": fromMinor(tr.toAmountMinor),
        "Moneda destino": toAcc?.currency ?? "",
        Cotización: tr.exchangeRate ?? "",
        Nota: tr.note ?? "",
        Comprobantes: tr.receiptPaths?.length ?? (tr.receiptPath ? 1 : 0),
        "Cargado por": userName(users, tr.createdByUserId),
        Alta: tr.createdAt ? formatDateTimeDMY(tr.createdAt) : "",
        "Última modificación": tr.updatedAt ? formatDateTimeDMY(tr.updatedAt) : "",
        ID: tr.id,
      };
    });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(transferRows.length ? transferRows : [{ Fecha: "Sin transferencias" }]), "Transferencias");

  const cardPaymentRows = [...cardPayments]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => ({
      Fecha: p.date,
      Tarjeta: cardLabel(cards.find((c) => c.id === p.cardId), banks),
      Cuenta: accountLabel(accounts.find((a) => a.id === p.accountId), banks),
      Monto: fromMinor(p.amountMinor),
      Moneda: p.currency,
      Nota: p.note ?? "",
      Comprobantes: p.receiptPaths?.length ?? (p.receiptPath ? 1 : 0),
      "Cargado por": userName(users, p.createdByUserId),
      Alta: p.createdAt ? formatDateTimeDMY(p.createdAt) : "",
      "Última modificación": p.updatedAt ? formatDateTimeDMY(p.updatedAt) : "",
      ID: p.id,
    }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cardPaymentRows.length ? cardPaymentRows : [{ Fecha: "Sin pagos de tarjeta" }]), "Pagos de tarjeta");

  const contactRows = [...contactEntries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => {
      const contact = contacts.find((c) => c.id === e.contactId);
      return {
        Fecha: e.date,
        "Persona/concepto": contact?.name ?? "eliminado",
        Tipo: contact ? (contactKind(contact) === "concepto" ? "Concepto" : "Persona") : "",
        Descripción: e.description,
        Monto: fromMinor(e.amountMinor),
        Moneda: e.currency,
        "A favor de": e.amountMinor >= 0 ? "Vos" : "Él/ella",
        Cuenta: e.accountId ? accountLabel(accounts.find((a) => a.id === e.accountId), banks) : "",
        Tarjeta: e.cardId ? cardLabel(cards.find((c) => c.id === e.cardId), banks) : "",
        "Extensión tarjeta": cardExtensionLabel(cards, e.cardId, e.cardExtensionId) ?? "",
        Cuotas: e.numInstallments ?? "",
        Comprobantes: e.receiptPaths?.length ?? 0,
        "Cargado por": userName(users, e.createdByUserId),
        Alta: e.createdAt ? formatDateTimeDMY(e.createdAt) : "",
        "Última modificación": e.updatedAt ? formatDateTimeDMY(e.updatedAt) : "",
        ID: e.id,
      };
    });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(contactRows.length ? contactRows : [{ Fecha: "Sin movimientos con personas" }]), "Personas");

  const today = todayISO();
  XLSX.writeFile(wb, `Movimientos_${today}.xlsx`);
}

/**
 * Exporta todo lo cargado a una tarjeta puntual (compras en cuotas, gastos de
 * pago único, pagos registrados y movimientos con personas pagados con esa
 * tarjeta), cada tipo en su propia hoja, con el mismo detalle que
 * `exportMovementsToExcel`.
 */
export function exportCardToExcel(
  card: Card,
  banks: Bank[],
  installments: Installment[],
  expenses: Transaction[],
  contactEntries: ContactEntry[],
  payments: CardPayment[],
  accounts: Account[],
  contacts: Contact[],
  familyMembers: FamilyMember[],
  users: AppUser[]
): void {
  const wb = XLSX.utils.book_new();

  const instRows = [...installments]
    .sort((a, b) => (a.date ?? `${a.startMonth}-01`).localeCompare(b.date ?? `${b.startMonth}-01`))
    .map((i) => ({
      Fecha: i.date ?? `${i.startMonth}-01`,
      Descripción: i.description,
      Categoría: i.category ?? "",
      Nota: i.note ?? "",
      "Monto total": -fromMinor(i.totalAmountMinor),
      Moneda: i.currency,
      Cuotas: i.numInstallments,
      "Monto por cuota": fromMinor(i.installmentAmountMinor),
      "Mes de inicio": i.startMonth,
      "Extensión tarjeta": cardExtensionLabel([card], card.id, i.cardExtensionId) ?? "",
      "Integrante(s) de familia": familyDetail(familyMembers, i.familyMemberIds, i.familyMemberAmounts),
      "Cargado por": userName(users, i.createdByUserId),
      ID: i.id,
    }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(instRows.length ? instRows : [{ Fecha: "Sin compras en cuotas" }]), "Compras en cuotas");

  const expenseRows = [...expenses]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => ({
      Fecha: t.date,
      Categoría: t.category ?? "",
      Nota: t.note ?? "",
      Monto: -fromMinor(t.amountMinor),
      Moneda: t.currency,
      "Extensión tarjeta": cardExtensionLabel([card], card.id, t.cardExtensionId) ?? "",
      Recurrente: t.recurringRuleId ? "Sí" : "",
      "Integrante(s) de familia": familyDetail(familyMembers, t.familyMemberIds, t.familyMemberAmounts),
      "Cargado por": userName(users, t.createdByUserId),
      ID: t.id,
    }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expenseRows.length ? expenseRows : [{ Fecha: "Sin gastos de pago único" }]), "Gastos");

  const paymentRows = [...payments]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => ({
      Fecha: p.date,
      Cuenta: accountLabel(accounts.find((a) => a.id === p.accountId), banks),
      Monto: fromMinor(p.amountMinor),
      Moneda: p.currency,
      Nota: p.note ?? "",
      "Cargado por": userName(users, p.createdByUserId),
      ID: p.id,
    }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(paymentRows.length ? paymentRows : [{ Fecha: "Sin pagos" }]), "Pagos");

  const contactRows = [...contactEntries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => {
      const contact = contacts.find((c) => c.id === e.contactId);
      return {
        Fecha: e.date,
        "Persona/concepto": contact?.name ?? "eliminado",
        Descripción: e.description,
        Monto: fromMinor(e.amountMinor),
        Moneda: e.currency,
        "Extensión tarjeta": cardExtensionLabel([card], card.id, e.cardExtensionId) ?? "",
        Cuotas: e.numInstallments ?? "",
        "Cargado por": userName(users, e.createdByUserId),
        ID: e.id,
      };
    });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(contactRows.length ? contactRows : [{ Fecha: "Sin movimientos con personas" }]), "Personas");

  const today = todayISO();
  XLSX.writeFile(wb, `${cardLabel(card, banks).replace(/[^a-zA-Z0-9-_ ]/g, "")}_${today}.xlsx`);
}

/**
 * Exporta todas las personas/conceptos (con su saldo actual) y todos sus
 * movimientos, en dos hojas: "Resumen" y "Movimientos".
 */
export function exportContactsToExcel(
  contacts: Contact[],
  contactEntries: ContactEntry[],
  accounts: Account[],
  banks: Bank[],
  cards: Card[],
  users: AppUser[]
): void {
  const wb = XLSX.utils.book_new();

  const summaryRows = [...contacts]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => {
      const balance = contactBalance(c, contactEntries);
      return {
        Nombre: c.name,
        Tipo: contactKind(c) === "concepto" ? "Concepto" : "Persona",
        Categoría: c.category ?? "",
        "Saldo UYU": fromMinor(balance.UYU),
        "Saldo USD": fromMinor(balance.USD),
        Saldado: isContactSettled(c, contactEntries) ? "Sí" : "No",
      };
    });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows.length ? summaryRows : [{ Nombre: "Sin personas cargadas" }]), "Resumen");

  const entryRows = [...contactEntries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => {
      const contact = contacts.find((c) => c.id === e.contactId);
      return {
        Fecha: e.date,
        "Persona/concepto": contact?.name ?? "eliminado",
        Tipo: contact ? (contactKind(contact) === "concepto" ? "Concepto" : "Persona") : "",
        Descripción: e.description,
        Monto: fromMinor(e.amountMinor),
        Moneda: e.currency,
        "A favor de": e.amountMinor >= 0 ? "Vos" : "Él/ella",
        Cuenta: e.accountId ? accountLabel(accounts.find((a) => a.id === e.accountId), banks) : "",
        Tarjeta: e.cardId ? cardLabel(cards.find((c) => c.id === e.cardId), banks) : "",
        "Extensión tarjeta": cardExtensionLabel(cards, e.cardId, e.cardExtensionId) ?? "",
        Cuotas: e.numInstallments ?? "",
        Comprobantes: e.receiptPaths?.length ?? 0,
        "Cargado por": userName(users, e.createdByUserId),
        Alta: e.createdAt ? formatDateTimeDMY(e.createdAt) : "",
        "Última modificación": e.updatedAt ? formatDateTimeDMY(e.updatedAt) : "",
        ID: e.id,
      };
    });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(entryRows.length ? entryRows : [{ Fecha: "Sin movimientos" }]), "Movimientos");

  const today = todayISO();
  XLSX.writeFile(wb, `Personas_${today}.xlsx`);
}

/** Exporta todos los presupuestos con el límite mensual y lo gastado en el mes en curso. */
export function exportBudgetsToExcel(budgets: Budget[], transactions: Transaction[]): void {
  const mk = currentMonthKey();
  const monthExpenses = transactions.filter((t) => monthKeyOf(t.date) === mk && t.type === "gasto");

  const rows = budgets.map((b) => {
    const spent = monthExpenses.filter((t) => t.category === b.category && t.currency === b.currency).reduce((s, t) => s + t.amountMinor, 0);
    return {
      Categoría: b.category,
      Moneda: b.currency,
      "Límite mensual": fromMinor(b.limitMinor),
      "Gastado este mes": fromMinor(spent),
      "% usado": Math.round((spent / b.limitMinor) * 1000) / 10,
      Excedido: spent > b.limitMinor ? "Sí" : "No",
    };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Categoría: "Sin presupuestos cargados" }]), "Presupuestos");
  const today = todayISO();
  XLSX.writeFile(wb, `Presupuestos_${today}.xlsx`);
}

/** Exporta todas las reglas de movimientos recurrentes, con su configuración completa (IVA, personas, periodicidad, medio de pago). */
export function exportRecurringRulesToExcel(
  rules: RecurringRule[],
  accounts: Account[],
  banks: Bank[],
  cards: Card[],
  contacts: Contact[],
  users: AppUser[]
): void {
  const rows = [...rules]
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate))
    .map((r) => ({
      Descripción: r.description,
      Tipo: r.type === "ingreso" ? "Ingreso" : "Gasto",
      Categoría: r.category ?? "",
      Nota: r.note ?? "",
      Monto: fromMinor(r.amountMinor),
      Moneda: r.currency,
      Periodicidad: RECURRENCE_PERIOD_LABELS[r.period],
      "Próxima fecha": r.nextDueDate,
      Estado: r.active ? "Activa" : "Pausada",
      Cuenta: r.accountId ? accountLabel(accounts.find((a) => a.id === r.accountId), banks) : "",
      Tarjeta: r.cardId ? cardLabel(cards.find((c) => c.id === r.cardId), banks) : "",
      "IVA (monto)": r.ivaAmountMinor ? fromMinor(r.ivaAmountMinor) : "",
      "Persona (medio de pago)": r.personaContactId ? contacts.find((c) => c.id === r.personaContactId)?.name ?? "eliminada" : "",
      "Monto a cargo de la persona": r.personaAmountMinor ? fromMinor(r.personaAmountMinor) : "",
      "Cargado por": userName(users, r.createdByUserId),
      Alta: r.createdAt ? formatDateTimeDMY(r.createdAt) : "",
      "Última modificación": r.updatedAt ? formatDateTimeDMY(r.updatedAt) : "",
      ID: r.id,
    }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Descripción: "Sin reglas recurrentes cargadas" }]), "Recurrentes");
  const today = todayISO();
  XLSX.writeFile(wb, `Recurrentes_${today}.xlsx`);
}

/** Exporta el historial completo de auditoría (alta/modificación/baja) a un Excel. */
export function exportAuditLogToExcel(auditLog: AuditEntry[], users: AppUser[]): void {
  const rows = [...auditLog]
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((e) => ({
      "Fecha/hora": formatDateTimeDMY(e.at),
      Tipo: entityTypeLabel(e.entityType),
      Acción: auditActionLabel(e.action),
      Resumen: e.summary,
      Usuario: userName(users, e.userId ?? undefined),
      Cambios: e.changes?.length ? e.changes.map((c) => `${c.field}: ${c.before} → ${c.after}`).join(" · ") : "",
      "ID del registro": e.entityId,
    }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ "Fecha/hora": "Sin eventos de auditoría" }]), "Auditoría");
  const today = todayISO();
  XLSX.writeFile(wb, `Auditoria_${today}.xlsx`);
}

/** Exporta el histórico completo de cotizaciones (una hoja por moneda) a un Excel. */
export function exportExchangeRatesToExcel(porMoneda: Record<string, ExchangeRateRow[]>): void {
  const wb = XLSX.utils.book_new();

  Object.entries(porMoneda).forEach(([moneda, filas]) => {
    const rows = filas.map((f) => ({
      "Fecha aplicable": f.rate_date,
      "Fecha publicación BCU": f.published_date,
      Venta: f.sell,
      "Arbitraje vs USD": f.arbitrage ?? "",
    }));
    const sheet = XLSX.utils.json_to_sheet(
      rows.length ? rows : [{ "Fecha aplicable": "", "Fecha publicación BCU": "", Venta: "", "Arbitraje vs USD": "" }]
    );
    XLSX.utils.book_append_sheet(wb, sheet, moneda.slice(0, 31));
  });

  const today = todayISO();
  XLSX.writeFile(wb, `Cotizaciones_BCU_${today}.xlsx`);
}

/**
 * Exporta el resultado de una conciliación (`reconcileAccount`, ver
 * `lib/reconciliation.ts`) a un único Excel con todo junto: lo registrado en
 * la app, lo que trae el archivo del banco, y en qué categoría cayó cada
 * cosa (Concilia / Posible diferencia / cada lado sin contraparte).
 */
export function exportReconciliationToExcel(account: Account, cards: Card[], contacts: Contact[], result: ReconciliationResult): void {
  const row = (
    categoria: string,
    opts: {
      appEntry?: AccountLedgerEntry;
      bancoFecha?: string;
      bancoDescripcion?: string;
      bancoMontoMinor?: number;
      diferenciaMinor?: number;
    }
  ) => ({
    Categoría: categoria,
    "Fecha (app)": opts.appEntry?.date ?? "",
    "Descripción (app)": opts.appEntry ? ledgerEntryLabel(opts.appEntry, cards, contacts) : "",
    "Monto (app)": opts.appEntry ? fromMinor(opts.appEntry.amountMinor) : "",
    "Fecha (banco)": opts.bancoFecha ?? "",
    "Descripción (banco)": opts.bancoDescripcion ?? "",
    "Monto (banco)": opts.bancoMontoMinor !== undefined ? fromMinor(opts.bancoMontoMinor) : "",
    Diferencia: opts.diferenciaMinor !== undefined ? fromMinor(opts.diferenciaMinor) : "",
  });

  const rows = [
    ...result.matched.map((m) =>
      row("Concilia", {
        appEntry: m.ledgerEntry,
        bancoFecha: m.statementLine.date,
        bancoDescripcion: m.statementLine.description,
        bancoMontoMinor: m.statementLine.amountMinor,
        diferenciaMinor: 0,
      })
    ),
    ...result.suggested.map((s) =>
      row("Posible diferencia", {
        appEntry: s.ledgerEntry,
        bancoFecha: s.statementLine.date,
        bancoDescripcion: s.statementLine.description,
        bancoMontoMinor: s.statementLine.amountMinor,
        diferenciaMinor: s.amountDiffMinor,
      })
    ),
    ...result.unmatchedInFile.map((line) =>
      row("En el banco, no cargado en la app", {
        bancoFecha: line.date,
        bancoDescripcion: line.description,
        bancoMontoMinor: line.amountMinor,
      })
    ),
    ...result.unmatchedInApp.map((entry) =>
      row("Cargado en la app, no aparece en el banco", { appEntry: entry })
    ),
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Categoría: "Sin diferencias ni movimientos" }]), sheetName("Conciliación"));
  const today = todayISO();
  XLSX.writeFile(wb, `Conciliacion_${sheetName(account.name)}_${today}.xlsx`);
}
