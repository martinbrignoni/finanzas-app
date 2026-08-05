import { useState, useEffect, Fragment } from "react";
import { ArrowUpRight, ArrowDownRight, ArrowRightLeft, Pencil, Trash2, CreditCard as CreditCardIcon, Search, X, Repeat, User, Tag, History, Download } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Modal, Field, TextInput, Select, Combobox, Segment, PrimaryButton, IconBtn, CurrencyPill } from "../../components/ui";
import { ReceiptField, ReceiptButton } from "../../components/ReceiptField";
import { receiptPathsOf } from "../../lib/receipts";
import { CategoryPicker } from "../../components/CategoryPicker";
import { categoryFullPath, categoryDisplayName, isMinuchiRootCategory, isMinuchiCategoryPath, filterCategoriesByScope, findCategoryByPath, categoryAllowsFamilyMembers, categoryTracksOrders } from "../../lib/categories";
import type { MovementScope } from "../../lib/categories";
import { CategoryModal } from "../settings/Categories";
import { ContactModal } from "../contacts/Contacts";
import { formatMoney, parseAmountInput, fromMinor, ivaIncluidoEn } from "../../lib/money";
import { monthKeyOf, todayISO, monthLabel, capitalize, formatDateDMY, formatDateTimeDMY, currentMonthKey } from "../../lib/dates";
import { accountLabel, accountSelectLabel, isAccountActive } from "../../lib/accounts";
import { contactKind, IVA_CONTACT_NAME, resolveIvaContact } from "../../lib/contacts";
import { canEditOwnRecord } from "../../lib/permissions";
import { cardLabel, cardExtensionLabel, dueForCardInMonth } from "../../lib/cards";
import { fetchRateForDate } from "../../lib/exchangeRates";
import { auditActionLabel } from "../../lib/audit";
import { exportMovementsToExcel } from "../../lib/excelExport";
import { UserBadge } from "../../components/UserBadge";
import type { Transaction, Currency, Account, Bank, Category, Transfer, CardPayment, Card, Installment, AppUser, Contact, ContactEntry, AuditEntry, AuditEntityType, FamilyMember } from "../../types";

/** Modal de solo lectura con el historial de alta/modificación/baja de un registro puntual (ver `AuditEntry`). */
function AuditTrailModal({
  title,
  entries,
  users,
  fallbackCreatedAt,
  fallbackCreatedByUserId,
  onClose,
}: {
  title: string;
  /** Entradas ya filtradas para este registro (cualquier orden: se reordenan acá). */
  entries: AuditEntry[];
  users: AppUser[];
  /** Si el registro no tiene ninguna entrada (es anterior a esta función), se usa esto como alta "sintética". */
  fallbackCreatedAt?: string;
  fallbackCreatedByUserId?: string;
  onClose: () => void;
}) {
  const sorted = [...entries].sort((a, b) => b.at.localeCompare(a.at));
  const actionColor = (action: AuditEntry["action"]) =>
    action === "delete" ? C.negative : action === "create" ? C.positive : C.text;

  return (
    <Modal title={`Auditoría · ${title}`} onClose={onClose}>
      {sorted.length === 0 && !fallbackCreatedAt && (
        <p className="text-sm" style={{ color: C.textMuted }}>
          No hay información de auditoría para este registro: es anterior a esta función.
        </p>
      )}
      <div className="space-y-2">
        {sorted.length === 0 && fallbackCreatedAt && (
          <div className="rounded-lg p-3 text-sm" style={{ background: C.surface2, border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-semibold" style={{ color: C.positive }}>Alta</span>
              <span className="text-xs" style={{ color: C.textFaint }}>{formatDateTimeDMY(fallbackCreatedAt)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <UserBadge users={users} userId={fallbackCreatedByUserId} />
              <span className="text-xs" style={{ color: C.textFaint }}>
                {users.find((u) => u.id === fallbackCreatedByUserId)?.name ?? "Perfil desconocido"}
              </span>
            </div>
          </div>
        )}
        {sorted.map((entry) => (
          <div key={entry.id} className="rounded-lg p-3 text-sm" style={{ background: C.surface2, border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-semibold" style={{ color: actionColor(entry.action) }}>{auditActionLabel(entry.action)}</span>
              <span className="text-xs" style={{ color: C.textFaint }}>{formatDateTimeDMY(entry.at)}</span>
            </div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <UserBadge users={users} userId={entry.userId ?? undefined} />
              <span className="text-xs" style={{ color: C.textFaint }}>
                {users.find((u) => u.id === entry.userId)?.name ?? "Perfil eliminado"}
              </span>
            </div>
            {entry.changes && entry.changes.length > 0 && (
              <ul className="space-y-0.5">
                {entry.changes.map((c) => (
                  <li key={c.field} className="text-xs" style={{ color: C.textMuted }}>
                    <span style={{ color: C.text }}>{c.field}:</span> {c.before} → {c.after}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

type LedgerItem =
  | { kind: "transaction"; date: string; data: Transaction }
  | { kind: "transfer"; date: string; data: Transfer }
  | { kind: "cardPayment"; date: string; data: CardPayment }
  | { kind: "installment"; date: string; data: Installment }
  | { kind: "contactEntry"; date: string; data: ContactEntry };

const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");

/** Saca tildes y pasa a minúsculas, para que buscar "alimentacion" encuentre "Alimentación". */
function normalizeText(s: string): string {
  return s.normalize("NFD").replace(DIACRITICS_RE, "").toLowerCase();
}

/** Devuelve el importe como texto en las dos notaciones que alguien podría tipear ("1500.5" y "1500,5"). */
function amountVariants(amountMinor: number): string {
  const plain = String(fromMinor(amountMinor));
  return `${plain} ${plain.replace(".", ",")}`;
}

/** Junta todo el texto relevante de un movimiento (categoría, nota, fecha, importe, cuenta, tarjeta...) para buscar en él. */
function itemSearchText(item: LedgerItem, accounts: Account[], banks: Bank[], cards: Card[], contacts: Contact[]): string {
  if (item.kind === "installment") {
    const inst = item.data;
    const card = cards.find((c) => c.id === inst.cardId);
    const date = inst.date ?? `${inst.startMonth}-01`;
    return [
      "cuotas",
      inst.category,
      inst.description,
      inst.note,
      date,
      formatDateDMY(date),
      monthLabel(monthKeyOf(date)),
      amountVariants(inst.totalAmountMinor),
      formatMoney(inst.totalAmountMinor, inst.currency),
      card?.name,
      cardExtensionLabel(cards, inst.cardId, inst.cardExtensionId) ?? undefined,
    ].filter((x): x is string => !!x).join(" ");
  }
  if (item.kind === "transaction") {
    const t = item.data;
    const acc = accounts.find((a) => a.id === t.accountId);
    const card = cards.find((c) => c.id === t.cardId);
    return [
      t.recurringRuleId ? "recurrente" : undefined,
      t.category,
      t.note,
      t.date,
      formatDateDMY(t.date),
      monthLabel(monthKeyOf(t.date)),
      t.type === "ingreso" ? "ingreso" : "gasto",
      amountVariants(t.amountMinor),
      formatMoney(t.amountMinor, t.currency),
      acc ? accountLabel(acc, banks) : undefined,
      card?.name,
      cardExtensionLabel(cards, t.cardId, t.cardExtensionId) ?? undefined,
      t.orderNumber ? `pedido ${t.orderNumber}` : undefined,
      t.orderType === "sena" ? "seña pedido" : t.orderType === "saldo" ? "saldo pedido" : t.orderType === "pedido" ? "pedido" : undefined,
    ].filter((x): x is string => !!x).join(" ");
  }
  if (item.kind === "transfer") {
    const tr = item.data;
    const fromAcc = accounts.find((a) => a.id === tr.fromAccountId);
    const toAcc = accounts.find((a) => a.id === tr.toAccountId);
    return [
      "transferencia",
      tr.note,
      tr.date,
      formatDateDMY(tr.date),
      monthLabel(monthKeyOf(tr.date)),
      amountVariants(tr.fromAmountMinor),
      amountVariants(tr.toAmountMinor),
      fromAcc ? accountLabel(fromAcc, banks) : undefined,
      toAcc ? accountLabel(toAcc, banks) : undefined,
    ].filter((x): x is string => !!x).join(" ");
  }
  if (item.kind === "contactEntry") {
    const e = item.data;
    const contact = contacts.find((c) => c.id === e.contactId);
    const acc = accounts.find((a) => a.id === e.accountId);
    const card = cards.find((c) => c.id === e.cardId);
    return [
      "persona",
      contact?.name,
      e.description,
      e.date,
      formatDateDMY(e.date),
      monthLabel(monthKeyOf(e.date)),
      amountVariants(e.amountMinor),
      formatMoney(Math.abs(e.amountMinor), e.currency),
      acc ? accountLabel(acc, banks) : undefined,
      card?.name,
    ].filter((x): x is string => !!x).join(" ");
  }
  const p = item.data;
  const acc = accounts.find((a) => a.id === p.accountId);
  const card = cards.find((c) => c.id === p.cardId);
  return [
    "pago tarjeta",
    p.note,
    p.date,
    formatDateDMY(p.date),
    monthLabel(monthKeyOf(p.date)),
    amountVariants(p.amountMinor),
    formatMoney(p.amountMinor, p.currency),
    acc ? accountLabel(acc, banks) : undefined,
    card?.name,
  ].filter((x): x is string => !!x).join(" ");
}

export function Transactions({
  transactions,
  transfers,
  cardPayments,
  installments,
  contactEntries,
  contacts,
  cards,
  accounts,
  banks,
  categories,
  familyMembers,
  auditLog,
  users,
  activeUser,
  canEdit,
  canEditContacts,
  onEdit,
  onDelete,
  onEditTransfer,
  onDeleteTransfer,
  onEditCardPayment,
  onDeleteCardPayment,
  onEditInstallment,
  onDeleteInstallment,
  onEditContactEntry,
  onDeleteContactEntry,
}: {
  transactions: Transaction[];
  transfers: Transfer[];
  cardPayments: CardPayment[];
  installments: Installment[];
  contactEntries: ContactEntry[];
  contacts: Contact[];
  cards: Card[];
  accounts: Account[];
  banks: Bank[];
  /** Para decidir si mostrar la categoría entera o solo la hoja (ver `categoryDisplayName`). */
  categories: Category[];
  /** Para mostrar a quién de la familia corresponde cada gasto/ingreso, si tiene asignado (ver `Transaction.familyMemberIds`). */
  familyMembers: FamilyMember[];
  /** Historial de alta/modificación/baja de cada registro, ver botón "Auditoría" en cada fila. */
  auditLog: AuditEntry[];
  /** Para mostrar de quién es cada movimiento (solo tiene sentido mostrarlo si hay más de un perfil). */
  users: AppUser[];
  /** Perfil activo: junto con `canEdit`/`canEditContacts`, decide si puede editar/eliminar cada registro puntual (ver `canEditOwnRecord`). */
  activeUser: AppUser | null;
  canEdit: boolean;
  /** Permiso del módulo Personas: gobierna editar/eliminar los movimientos con personas mostrados acá. */
  canEditContacts: boolean;
  onEdit: (t: Transaction) => void;
  onDelete: (id: string) => void;
  onEditTransfer: (t: Transfer) => void;
  onDeleteTransfer: (id: string) => void;
  onEditCardPayment: (p: CardPayment) => void;
  onDeleteCardPayment: (id: string) => void;
  onEditInstallment: (i: Installment) => void;
  onDeleteInstallment: (id: string) => void;
  onEditContactEntry: (e: ContactEntry) => void;
  onDeleteContactEntry: (id: string) => void;
}) {
  const [filterMonth, setFilterMonth] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  // Solo tiene sentido marcar de quién es cada movimiento si hay más de un perfil cargando datos.
  const showAuthor = users.length > 1;
  // Integrantes de familia asignados a un gasto/ingreso o cuota (ver `familyMemberIds`/`familyMemberAmounts`), para mostrar en la lista.
  // Si hay reparto por monto cargado, muestra "Nombre $monto" por cada uno; si no, solo los nombres.
  const familyMemberNames = (ids: string[] | undefined, amounts: Record<string, number> | undefined, currency: Currency): string => {
    if (!ids || ids.length === 0) return "";
    return ids
      .map((id) => {
        const name = familyMembers.find((m) => m.id === id)?.name;
        if (!name) return null;
        const amt = amounts?.[id];
        return amt ? `${name} ${formatMoney(amt, currency)}` : name;
      })
      .filter(Boolean)
      .join(", ");
  };

  const [auditView, setAuditView] = useState<{
    title: string;
    entityType: AuditEntityType;
    entityId: string;
    fallbackCreatedAt?: string;
    fallbackCreatedByUserId?: string;
  } | null>(null);
  const openAudit = (
    title: string,
    entityType: AuditEntityType,
    record: { id: string; createdAt?: string; createdByUserId?: string }
  ) => setAuditView({ title, entityType, entityId: record.id, fallbackCreatedAt: record.createdAt, fallbackCreatedByUserId: record.createdByUserId });

  const allItems: LedgerItem[] = [
    ...transactions.map((t): LedgerItem => ({ kind: "transaction", date: t.date, data: t })),
    ...transfers.map((t): LedgerItem => ({ kind: "transfer", date: t.date, data: t })),
    ...cardPayments.map((p): LedgerItem => ({ kind: "cardPayment", date: p.date, data: p })),
    ...installments.map((i): LedgerItem => ({ kind: "installment", date: i.date ?? `${i.startMonth}-01`, data: i })),
    ...contactEntries.map((e): LedgerItem => ({ kind: "contactEntry", date: e.date, data: e })),
  ].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate !== 0) return byDate;
    // Empate en fecha asignada: más reciente creado/editado arriba.
    const aStamp = a.data.updatedAt ?? a.data.createdAt ?? "";
    const bStamp = b.data.updatedAt ?? b.data.createdAt ?? "";
    return bStamp.localeCompare(aStamp);
  });

  // "Pendiente de asignar": un gasto/ingreso o compra en cuotas cargado
  // rápido, sin categoría y/o sin medio de pago (cuenta o tarjeta), para
  // completarlo con calma más adelante. Transferencias y pagos de tarjeta no
  // aplican (no tienen categoría ni "medio de pago" en ese sentido).
  const isPending = (item: LedgerItem): boolean => {
    if (item.kind === "transaction") return !item.data.category || (!item.data.accountId && !item.data.cardId);
    if (item.kind === "installment") return !item.data.category;
    return false;
  };
  const pendingCount = allItems.filter(isPending).length;

  const availableMonths = Array.from(new Set(allItems.map((item) => monthKeyOf(item.date)))).sort((a, b) => b.localeCompare(a));

  const byMonth = filterMonth === "all" ? allItems : allItems.filter((item) => monthKeyOf(item.date) === filterMonth);
  const byPending = pendingOnly ? byMonth.filter(isPending) : byMonth;

  const searchNorm = normalizeText(search.trim());
  const items =
    searchNorm === ""
      ? byPending
      : byPending.filter((item) => normalizeText(itemSearchText(item, accounts, banks, cards, contacts)).includes(searchNorm));

  // Los movimientos con fecha futura (a partir de mañana) no se muestran de
  // entrada: quedan atrás de un banner ("Ver") para no ensuciar la lista del
  // día a día, sin perder de vista los filtros/buscador de arriba. Si hay una
  // búsqueda activa, se muestran igual (el usuario ya está buscando algo puntual).
  const [showFuture, setShowFuture] = useState(false);
  const todayStr = todayISO();
  const futureCount = searchNorm === "" ? items.filter((item) => item.date > todayStr).length : 0;
  const visibleItems = searchNorm === "" && !showFuture ? items.filter((item) => item.date <= todayStr) : items;

  return (
    <div className="pb-24">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h1 className="text-2xl font-display" style={{ color: C.text }}>Movimientos</h1>
        <div className="flex items-center gap-2">
          <IconBtn
            label="Exportar todos los movimientos a Excel"
            onClick={() => exportMovementsToExcel(transactions, installments, transfers, cardPayments, contactEntries, accounts, banks, cards, contacts, familyMembers, users)}
          >
            <Download size={15} />
          </IconBtn>
          <div className="w-40">
            <Select aria-label="Filtrar por período" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
              <option value="all">Todos los períodos</option>
              {availableMonths.map((mk) => (
                <option key={mk} value={mk}>{capitalize(monthLabel(mk))}</option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {pendingCount > 0 && (
        <button
          onClick={() => setPendingOnly((v) => !v)}
          className="w-full text-left rounded-lg p-2.5 mb-3 text-xs flex items-center justify-between"
          style={{ background: pendingOnly ? C.uyu : "rgba(217,164,65,0.15)", color: pendingOnly ? "#0A1413" : C.uyu }}
        >
          <span>
            {pendingCount} movimiento{pendingCount === 1 ? "" : "s"} pendiente{pendingCount === 1 ? "" : "s"} de asignar categoría o medio de pago
          </span>
          <span className="font-semibold">{pendingOnly ? "Ver todos" : "Ver pendientes"}</span>
        </button>
      )}

      {futureCount > 0 && (
        <button
          onClick={() => setShowFuture((v) => !v)}
          className="w-full text-left rounded-lg p-2.5 mb-3 text-xs flex items-center justify-between"
          style={{ background: showFuture ? C.usd : "rgba(79,168,160,0.15)", color: showFuture ? "#0A1413" : C.usd }}
        >
          <span>
            {futureCount} movimiento{futureCount === 1 ? "" : "s"} con fecha futura
          </span>
          <span className="font-semibold">{showFuture ? "Ocultar" : "Ver"}</span>
        </button>
      )}

      <div className="relative mb-4">
        <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.textFaint }} />
        <TextInput
          aria-label="Buscar movimientos"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por categoría, importe, concepto, fecha..."
          style={{ paddingLeft: 32, paddingRight: search ? 32 : undefined }}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            aria-label="Limpiar búsqueda"
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: C.textFaint }}
          >
            <X size={15} />
          </button>
        )}
      </div>

      {items.length === 0 && (
        <div className="rounded-xl p-6 text-center text-sm" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textMuted }}>
          {search.trim()
            ? `Sin resultados para "${search.trim()}".`
            : pendingOnly
            ? "No hay movimientos pendientes de asignar."
            : filterMonth === "all"
            ? "Todavía no registraste movimientos."
            : "Sin movimientos en este período."}
        </div>
      )}

      <div className="space-y-2">
        {(() => {
          let lastMonth: string | null = null;
          return visibleItems.map((item) => {
            const mk = monthKeyOf(item.date);
            const separator =
              mk !== lastMonth ? (
                <div className="text-xs font-semibold uppercase tracking-widest pt-3 pb-1" style={{ color: C.textFaint }}>
                  {capitalize(monthLabel(mk))}
                </div>
              ) : null;
            lastMonth = mk;

          if (item.kind === "transaction") {
            const t = item.data;
            return (
              <Fragment key={t.id}>
                {separator}
                <div className="rounded-xl p-3 flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: t.type === "ingreso" ? "rgba(111,191,139,0.15)" : "rgba(217,119,106,0.15)" }}>
                    {t.type === "ingreso" ? <ArrowUpRight size={16} color={C.positive} /> : <ArrowDownRight size={16} color={C.negative} />}
                  </div>
                  <div>
                    <div className="text-sm flex items-center gap-1" style={{ color: C.text }}>
                      {t.recurringRuleId && <Repeat size={11} color={C.textFaint} aria-label="Movimiento recurrente" />}
                      <span>
                        {t.category ? categoryDisplayName(t.category, categories) : <span style={{ color: C.uyu }}>Sin categorizar</span>}
                        {t.note ? ` · ${t.note}` : ""}
                        {t.orderNumber ? ` · ${t.orderType === "sena" ? "Seña pedido" : t.orderType === "saldo" ? "Saldo pedido" : "Pedido"} #${t.orderNumber}` : ""}
                      </span>
                    </div>
                    <div className="text-xs flex items-center gap-1.5" style={{ color: C.textFaint }}>
                      <span>
                        {formatDateDMY(t.date)}
                        {t.accountId && ` · ${accountLabel(accounts.find((a) => a.id === t.accountId), banks)}`}
                        {t.cardId && ` · ${cardLabel(cards.find((c) => c.id === t.cardId), banks)}`}
                        {cardExtensionLabel(cards, t.cardId, t.cardExtensionId) && ` (${cardExtensionLabel(cards, t.cardId, t.cardExtensionId)})`}
                        {!t.accountId && !t.cardId && <span style={{ color: C.uyu }}> · Sin medio de pago</span>}
                      </span>
                      {familyMemberNames(t.familyMemberIds, t.familyMemberAmounts, t.currency) && (
                        <span className="flex items-center gap-0.5" style={{ color: C.usd }}>
                          <User size={10} />
                          {familyMemberNames(t.familyMemberIds, t.familyMemberAmounts, t.currency)}
                        </span>
                      )}
                      {showAuthor && <UserBadge users={users} userId={t.createdByUserId} />}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <div className="font-mono text-sm" style={{ color: t.type === "ingreso" ? C.positive : C.negative }}>
                      {t.type === "ingreso" ? "+" : "-"}{formatMoney(t.amountMinor, t.currency)}
                    </div>
                    <CurrencyPill currency={t.currency} />
                  </div>
                  <ReceiptButton paths={receiptPathsOf(t)} />
                  <IconBtn label="Auditoría del movimiento" onClick={() => openAudit(t.category ? categoryDisplayName(t.category, categories) : "Sin categorizar", "transaction", t)}>
                    <History size={15} />
                  </IconBtn>
                  {canEdit && canEditOwnRecord(activeUser, t) && (
                    <>
                      <IconBtn label="Editar movimiento" onClick={() => onEdit(t)}><Pencil size={15} /></IconBtn>
                      <IconBtn label="Eliminar movimiento" danger onClick={() => onDelete(t.id)}><Trash2 size={15} /></IconBtn>
                    </>
                  )}
                </div>
                </div>
              </Fragment>
            );
          }

          if (item.kind === "transfer") {
            const tr = item.data;
            const fromAcc = accounts.find((a) => a.id === tr.fromAccountId);
            const toAcc = accounts.find((a) => a.id === tr.toAccountId);
            const sameCurrency = fromAcc && toAcc && fromAcc.currency === toAcc.currency;
            return (
              <Fragment key={tr.id}>
                {separator}
                <div className="rounded-xl p-3 flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(79,168,160,0.15)" }}>
                    <ArrowRightLeft size={16} color={C.usd} />
                  </div>
                  <div>
                    <div className="text-sm" style={{ color: C.text }}>
                      {accountLabel(fromAcc, banks)} → {accountLabel(toAcc, banks)}
                      {tr.note ? ` · ${tr.note}` : ""}
                    </div>
                    <div className="text-xs flex items-center gap-1.5" style={{ color: C.textFaint }}>
                      <span>{formatDateDMY(tr.date)} · Transferencia</span>
                      {showAuthor && <UserBadge users={users} userId={tr.createdByUserId} />}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    {sameCurrency ? (
                      <div className="font-mono text-sm" style={{ color: C.text }}>{formatMoney(tr.fromAmountMinor, fromAcc!.currency)}</div>
                    ) : (
                      <div className="font-mono text-xs" style={{ color: C.text }}>
                        {fromAcc && formatMoney(tr.fromAmountMinor, fromAcc.currency)} → {toAcc && formatMoney(tr.toAmountMinor, toAcc.currency)}
                      </div>
                    )}
                  </div>
                  <ReceiptButton paths={receiptPathsOf(tr)} />
                  <IconBtn label="Auditoría de la transferencia" onClick={() => openAudit(`${accountLabel(fromAcc, banks)} → ${accountLabel(toAcc, banks)}`, "transfer", tr)}>
                    <History size={15} />
                  </IconBtn>
                  {canEdit && canEditOwnRecord(activeUser, tr) && (
                    <>
                      <IconBtn label="Editar transferencia" onClick={() => onEditTransfer(tr)}><Pencil size={15} /></IconBtn>
                      <IconBtn label="Eliminar transferencia" danger onClick={() => onDeleteTransfer(tr.id)}><Trash2 size={15} /></IconBtn>
                    </>
                  )}
                </div>
                </div>
              </Fragment>
            );
          }

          if (item.kind === "installment") {
            const inst = item.data;
            const card = cards.find((c) => c.id === inst.cardId);
            const instDate = inst.date ?? `${inst.startMonth}-01`;
            const title = inst.category ? `${categoryDisplayName(inst.category, categories)} · ${inst.description}` : inst.description;
            return (
              <Fragment key={inst.id}>
                {separator}
                <div className="rounded-xl p-3 flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(217,119,106,0.15)" }}>
                    <CreditCardIcon size={16} color={C.negative} />
                  </div>
                  <div>
                    <div className="text-sm" style={{ color: C.text }}>{title}{inst.note ? ` · ${inst.note}` : ""}</div>
                    <div className="text-xs flex items-center gap-1.5" style={{ color: C.textFaint }}>
                      <span>
                        {formatDateDMY(instDate)}
                        {card && ` · ${cardLabel(card, banks)}`}
                        {cardExtensionLabel(cards, inst.cardId, inst.cardExtensionId) && ` (${cardExtensionLabel(cards, inst.cardId, inst.cardExtensionId)})`}
                        {` · ${inst.numInstallments} cuota${inst.numInstallments > 1 ? "s" : ""}`}
                      </span>
                      {familyMemberNames(inst.familyMemberIds, inst.familyMemberAmounts, inst.currency) && (
                        <span className="flex items-center gap-0.5" style={{ color: C.usd }}>
                          <User size={10} />
                          {familyMemberNames(inst.familyMemberIds, inst.familyMemberAmounts, inst.currency)}
                        </span>
                      )}
                      {showAuthor && <UserBadge users={users} userId={inst.createdByUserId} />}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <div className="font-mono text-sm" style={{ color: C.negative }}>-{formatMoney(inst.totalAmountMinor, inst.currency)}</div>
                    <CurrencyPill currency={inst.currency} />
                  </div>
                  <ReceiptButton paths={receiptPathsOf(inst)} />
                  <IconBtn label="Auditoría de la compra en cuotas" onClick={() => openAudit(inst.description, "installment", inst)}>
                    <History size={15} />
                  </IconBtn>
                  {canEdit && canEditOwnRecord(activeUser, inst) && (
                    <>
                      <IconBtn label="Editar compra en cuotas" onClick={() => onEditInstallment(inst)}><Pencil size={15} /></IconBtn>
                      <IconBtn label="Eliminar compra en cuotas" danger onClick={() => onDeleteInstallment(inst.id)}><Trash2 size={15} /></IconBtn>
                    </>
                  )}
                </div>
                </div>
              </Fragment>
            );
          }

          if (item.kind === "contactEntry") {
            const e = item.data;
            const contact = contacts.find((c) => c.id === e.contactId);
            const account = accounts.find((a) => a.id === e.accountId);
            const card = cards.find((c) => c.id === e.cardId);
            const favorMio = e.amountMinor >= 0;
            const isConcepto = !!contact && contactKind(contact) === "concepto";
            return (
              <Fragment key={e.id}>
                {separator}
                <div className="rounded-xl p-3 flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(79,168,160,0.15)" }}>
                    {isConcepto ? <Tag size={16} color={C.usd} /> : <User size={16} color={C.usd} />}
                  </div>
                  <div>
                    <div className="text-sm" style={{ color: C.text }}>
                      {contact?.name ?? "Persona eliminada"} · {e.description}
                    </div>
                    <div className="text-xs flex items-center gap-1.5" style={{ color: C.textFaint }}>
                      <span>
                        {formatDateDMY(e.date)} · {favorMio ? "Te debe" : "Le debés"}
                        {account && ` · ${accountLabel(account, banks)}`}
                        {card && ` · ${cardLabel(card, banks)}`}
                      </span>
                      {showAuthor && <UserBadge users={users} userId={e.createdByUserId} />}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <div className="font-mono text-sm" style={{ color: favorMio ? C.positive : C.negative }}>
                      {favorMio ? "+" : "-"}{formatMoney(Math.abs(e.amountMinor), e.currency)}
                    </div>
                    <CurrencyPill currency={e.currency} />
                  </div>
                  <ReceiptButton paths={receiptPathsOf(e)} />
                  <IconBtn label="Auditoría del movimiento con persona" onClick={() => openAudit(`${contact?.name ?? "Persona eliminada"} · ${e.description}`, "contactEntry", e)}>
                    <History size={15} />
                  </IconBtn>
                  {canEditContacts && canEditOwnRecord(activeUser, e) && (
                    <>
                      <IconBtn label="Editar movimiento con persona" onClick={() => onEditContactEntry(e)}><Pencil size={15} /></IconBtn>
                      <IconBtn label="Eliminar movimiento con persona" danger onClick={() => onDeleteContactEntry(e.id)}><Trash2 size={15} /></IconBtn>
                    </>
                  )}
                </div>
                </div>
              </Fragment>
            );
          }

          const p = item.data;
          const account = accounts.find((a) => a.id === p.accountId);
          const card = cards.find((c) => c.id === p.cardId);
          return (
            <Fragment key={p.id}>
              {separator}
              <div className="rounded-xl p-3 flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(217,119,106,0.15)" }}>
                  <CreditCardIcon size={16} color={C.negative} />
                </div>
                <div>
                  <div className="text-sm" style={{ color: C.text }}>
                    Pago tarjeta {card ? cardLabel(card, banks) : "eliminada"} · {accountLabel(account, banks)}
                    {p.note ? ` · ${p.note}` : ""}
                  </div>
                  <div className="text-xs flex items-center gap-1.5" style={{ color: C.textFaint }}>
                  <span>{formatDateDMY(p.date)}</span>
                  {showAuthor && <UserBadge users={users} userId={p.createdByUserId} />}
                </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="font-mono text-sm" style={{ color: C.negative }}>-{formatMoney(p.amountMinor, p.currency)}</div>
                  <CurrencyPill currency={p.currency} />
                </div>
                <ReceiptButton paths={receiptPathsOf(p)} />
                <IconBtn label="Auditoría del pago" onClick={() => openAudit(`Pago ${card ? cardLabel(card, banks) : "eliminada"}`, "cardPayment", p)}>
                  <History size={15} />
                </IconBtn>
                {canEdit && canEditOwnRecord(activeUser, p) && (
                  <>
                    <IconBtn label="Editar pago" onClick={() => onEditCardPayment(p)}><Pencil size={15} /></IconBtn>
                    <IconBtn label="Eliminar pago" danger onClick={() => onDeleteCardPayment(p.id)}><Trash2 size={15} /></IconBtn>
                  </>
                )}
              </div>
              </div>
            </Fragment>
          );
          });
        })()}
      </div>
      {auditView && (
        <AuditTrailModal
          title={auditView.title}
          entries={auditLog.filter((a) => a.entityType === auditView.entityType && a.entityId === auditView.entityId)}
          users={users}
          fallbackCreatedAt={auditView.fallbackCreatedAt}
          fallbackCreatedByUserId={auditView.fallbackCreatedByUserId}
          onClose={() => setAuditView(null)}
        />
      )}
    </div>
  );
}

type PaymentMethod = "ninguno" | "cuenta" | "tarjeta" | "persona";
type MovementKind = "gasto" | "ingreso" | "transferencia";
type TransferKind = "cuentas" | "tarjeta" | "personas";


interface FormState {
  kind: MovementKind;
  /** Sub-tipo, solo cuando `kind === "transferencia"`. */
  transferKind: TransferKind;
  /**
   * De quién es el movimiento (ver Configuración → Categorías: MINUCHI es el
   * emprendimiento aparte de mi esposa). Solo importa para Gasto/Ingreso:
   * acota qué categorías se pueden elegir y, si es "minuchi", saca
   * "Transferencia" de las opciones de Tipo (MINUCHI no tiene cuentas
   * propias para transferir).
   */
  scope: MovementScope;
  // campos de gasto/ingreso
  amount: string;
  currency: Currency;
  category: string;
  date: string;
  note: string;
  /** A qué integrante(s) de familia corresponde, solo cuando la categoría elegida lo permite (ver `Category.allowFamilyMembers`). */
  familyMemberIds: string[];
  /** Si se eligió más de un integrante, permite indicar qué parte del monto corresponde a cada uno (ver `Transaction.familyMemberAmounts`). */
  splitFamilyAmounts: boolean;
  /** Monto (en texto, moneda del movimiento) por integrante, cuando `splitFamilyAmounts` está activo. */
  familyMemberAmounts: Record<string, string>;
  /** Qué es el cobro, solo cuando la categoría elegida lo pide (ver `Category.trackOrders`). */
  orderType: "pedido" | "sena" | "saldo";
  /** Número de pedido asignado a mano, junto con `orderType`. */
  orderNumber: string;
  accountId: string; // "" significa sin cuenta asignada
  paymentMethod: PaymentMethod;
  cardId: string; // "" significa sin tarjeta elegida
  cardExtensionId: string; // "" significa el titular (solo aplica si la tarjeta elegida tiene extensiones)
  /** Préstamo hipotecario al que corresponde este gasto (pago de cuota), si aplica. "" = no vinculado. */
  mortgageLoanId: string;
  /**
   * "¿IVA Compras?" (Gasto) o "¿IVA Ventas?" (Ingreso): el movimiento que
   * queda categorizado es por la diferencia (neto de IVA); el IVA se
   * acredita aparte en Personas contra Gustavo Brignoni (ver
   * `IVA_CONTACT_NAME` y `maybeCreateIvaCredit`), con la misma cuenta/tarjeta
   * del movimiento, para que el total real coincida con lo que efectivamente
   * pagaste o cobraste. En Compras él te queda debiendo el IVA (crédito
   * recuperable); en Ventas le quedás debiendo vos (débito a remitir).
   */
  ivaChecked: boolean;
  /** Monto de IVA a acreditar contra Gustavo Brignoni. Sugerido con tasa básica (22%) al tildar "Sí"; editable. */
  ivaAmount: string;
  /**
   * Monto (en la moneda del gasto/ingreso) que puso la persona elegida como
   * medio de pago. Vacío = se asume el 100% del monto. Solo aplica a un
   * Gasto/Ingreso NUEVO con medio de pago "persona".
   */
  personaAmount: string;
  // campos de transferencia entre cuentas
  fromAccountId: string;
  toAccountId: string;
  fromAmount: string;
  toAmount: string;
  exchangeRate: string;
  // cuotas (solo gasto con tarjeta)
  numInstallments: string;
  // campos de Transferencia > Personas (y del medio de pago "persona" de Gasto/Ingreso)
  contactId: string;
  /** true = vos pusiste la plata (aumenta lo que te debe); false = ella puso la plata (disminuye lo que te debe). Solo aplica a Transferencia > Personas. */
  contactFavorMio: boolean;
  contactDescription: string;
  // comprobantes
  receiptPaths: string[];
}

/**
 * Extensión (titular adicional) de `card` vinculada a `activeUser`, si hay
 * alguna (ver `CardExtension.linkedUserId`), para preseleccionarla al elegir
 * esa tarjeta en vez de dejar "Titular" por defecto. Devuelve "" (Titular)
 * si no hay tarjeta, no hay usuario activo, o ninguna extensión coincide.
 */
function defaultCardExtensionId(card: Card | undefined, activeUser: AppUser | null): string {
  if (!card || !activeUser) return "";
  return card.extensions?.find((e) => e.linkedUserId === activeUser.id)?.id ?? "";
}

/**
 * Modal único para cargar cualquier movimiento. Tipo (Gasto / Ingreso /
 * Transferencia) y, dentro de Transferencia, sub-tipo (Entre cuentas /
 * Tarjeta / Personas). Unifica lo que antes eran varios modales separados,
 * como una entrada más del libro diario.
 */
export function MovementModal({
  initial,
  initialTransfer,
  initialInstallment,
  initialContactEntry,
  presetCardId,
  activeUser,
  accounts,
  banks,
  cards,
  installments,
  categories,
  contacts,
  familyMembers,
  canEditContacts,
  canEditCards,
  onSaveTransaction,
  onSaveTransfer,
  onSaveInstallment,
  onSaveContactEntry,
  onSaveCardPayment,
  onSaveContact,
  onSaveCategory,
  onClose,
}: {
  /** Editar un gasto/ingreso existente. */
  initial?: Transaction;
  /** Editar una transferencia entre cuentas existente. */
  initialTransfer?: Transfer;
  /** Editar una compra en cuotas existente. */
  initialInstallment?: Installment;
  /** Editar un movimiento con persona existente. */
  initialContactEntry?: ContactEntry;
  /** Si se abre el modal para cargar un gasto desde una tarjeta puntual (ej. desde Tarjetas), la precarga como medio de pago. */
  presetCardId?: string;
  /** Perfil activo: al elegir una tarjeta con extensiones, preselecciona la extensión vinculada a este perfil (ver `CardExtension.linkedUserId`), o "Titular" si ninguna coincide. */
  activeUser: AppUser | null;
  accounts: Account[];
  banks: Bank[];
  cards: Card[];
  /** Para sugerir la cuota que vence este mes al registrar un pago de tarjeta (Transferencia > Tarjeta). */
  installments: Installment[];
  categories: Category[];
  contacts: Contact[];
  /** Integrantes de familia asignables en las categorías que lo permitan (ver `Category.allowFamilyMembers`). */
  familyMembers: FamilyMember[];
  /** Permiso del módulo Personas: gobierna si se puede elegir "Persona" como medio de pago o como sub-tipo de transferencia. */
  canEditContacts: boolean;
  /** Permiso del módulo Tarjetas: gobierna si se puede registrar un pago de tarjeta desde acá (Transferencia > Tarjeta). */
  canEditCards: boolean;
  onSaveTransaction: (t: Transaction) => void;
  onSaveTransfer: (t: Transfer) => void;
  /** Crear una categoría nueva (en cualquier nivel) sin salir del modal de movimiento. */
  onSaveCategory: (c: Category) => void;
  onSaveInstallment: (i: Installment) => void;
  onSaveContactEntry: (e: ContactEntry) => void;
  onSaveCardPayment: (p: CardPayment) => void;
  /** Crear una persona o concepto nuevo (sin salir del modal de movimiento). */
  onSaveContact: (c: Contact) => void;
  onClose: () => void;
}) {
  const isEditingTransaction = !!initial;
  const isEditingTransfer = !!initialTransfer;
  const isEditingInstallment = !!initialInstallment;
  const isEditingContactEntry = !!initialContactEntry;
  // Estable durante toda la vida del modal, aunque el movimiento sea nuevo: sirve como prefijo
  // del archivo del comprobante en Storage y después se usa como id real al guardar.
  const [movementId] = useState(() => initial?.id ?? initialTransfer?.id ?? initialInstallment?.id ?? initialContactEntry?.id ?? crypto.randomUUID());

  const [form, setForm] = useState<FormState>(() => {
    // Nueva: arranca sin categoría a propósito, para poder cargar rápido y
    // categorizar después (ver el filtro de "pendientes" en la lista).
    const initialCategory = initialInstallment ? initialInstallment.category ?? initialInstallment.description : initial ? initial.category ?? "" : "";
    return {
    kind: initialContactEntry || initialTransfer ? "transferencia" : initial ? initial.type : "gasto",
    transferKind: initialContactEntry ? "personas" : "cuentas",
    // Si se está editando un gasto/ingreso/cuota que ya tenía una categoría
    // MINUCHI, arrancamos en ese scope para no dejar la categoría "huérfana"
    // (que el picker la filtre afuera al abrir el modal).
    scope: isMinuchiCategoryPath(initialCategory, categories) ? "minuchi" : "personal",
    amount: initialContactEntry
      ? String(fromMinor(Math.abs(initialContactEntry.amountMinor)))
      : initialInstallment
      ? String(fromMinor(initialInstallment.totalAmountMinor))
      : initial
      ? String(fromMinor(initial.amountMinor))
      : "",
    currency: initialContactEntry ? initialContactEntry.currency : initialInstallment ? initialInstallment.currency : initial ? initial.currency : "UYU",
    category: initialCategory,
    date: initialContactEntry
      ? initialContactEntry.date
      : initialTransfer
      ? initialTransfer.date
      : initial
      ? initial.date
      : initialInstallment
      ? initialInstallment.date ?? `${initialInstallment.startMonth}-01`
      : todayISO(),
    note: initialTransfer ? initialTransfer.note ?? "" : initial ? initial.note ?? "" : initialInstallment ? initialInstallment.note ?? "" : "",
    familyMemberIds: initialInstallment?.familyMemberIds ?? initial?.familyMemberIds ?? [],
    splitFamilyAmounts: !!(initialInstallment?.familyMemberAmounts ?? initial?.familyMemberAmounts),
    familyMemberAmounts: Object.fromEntries(
      Object.entries(initialInstallment?.familyMemberAmounts ?? initial?.familyMemberAmounts ?? {}).map(([memberId, minor]) => [memberId, String(fromMinor(minor))])
    ),
    orderType: initial?.orderType ?? "pedido",
    orderNumber: initial?.orderNumber ?? "",
    accountId: initialContactEntry?.accountId ?? initial?.accountId ?? "",
    paymentMethod: initialContactEntry
      ? initialContactEntry.cardId
        ? "tarjeta"
        : initialContactEntry.accountId
        ? "cuenta"
        : "ninguno"
      : initialInstallment
      ? "tarjeta"
      : initial?.cardId
      ? "tarjeta"
      : initial?.accountId
      ? "cuenta"
      : presetCardId
      ? "tarjeta"
      : "ninguno",
    cardId: initialContactEntry?.cardId ?? initialInstallment?.cardId ?? initial?.cardId ?? presetCardId ?? "",
    cardExtensionId:
      initialContactEntry?.cardExtensionId ??
      initialInstallment?.cardExtensionId ??
      initial?.cardExtensionId ??
      (presetCardId ? defaultCardExtensionId(cards.find((c) => c.id === presetCardId), activeUser) : ""),
    mortgageLoanId: initial?.mortgageLoanId ?? "",
    // Es un registro adicional que se dispara al guardar, no un dato propio
    // del movimiento: al editar uno ya cargado, arranca siempre en "No" (si
    // se quiere repetir el asiento de IVA, se vuelve a tildar a mano).
    ivaChecked: false,
    ivaAmount: "",
    personaAmount: "",
    fromAccountId: initialTransfer ? initialTransfer.fromAccountId : accounts[0]?.id ?? "",
    toAccountId: initialTransfer ? initialTransfer.toAccountId : accounts[1]?.id ?? accounts[0]?.id ?? "",
    fromAmount: initialTransfer ? String(fromMinor(initialTransfer.fromAmountMinor)) : "",
    toAmount: initialTransfer ? String(fromMinor(initialTransfer.toAmountMinor)) : "",
    exchangeRate: initialTransfer?.exchangeRate ? String(initialTransfer.exchangeRate) : "",
    numInstallments: initialInstallment ? String(initialInstallment.numInstallments) : "1",
    contactId: initialContactEntry?.contactId ?? contacts[0]?.id ?? "",
    contactFavorMio: initialContactEntry ? initialContactEntry.amountMinor >= 0 : true,
    contactDescription: initialContactEntry?.description ?? "",
    receiptPaths: receiptPathsOf(initialTransfer ?? initial ?? initialInstallment ?? initialContactEntry),
    };
  });
  const [error, setError] = useState<string | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  // Las cajas inactivas (Configuración → Bancos) no se ofrecen para movimientos nuevos, pero
  // si el movimiento ya tenía una asignada (edición), se mantiene disponible para no romperlo.
  const eligibleAccounts = accounts.filter((a) => a.currency === form.currency && (isAccountActive(a) || a.id === form.accountId));
  const transferAccountOptions = (selectedId: string) => accounts.filter((a) => isAccountActive(a) || a.id === selectedId);
  const selectedCard = cards.find((c) => c.id === form.cardId);
  const selectedContact = contacts.find((c) => c.id === form.contactId);
  const cardDueThisMonth = form.cardId ? dueForCardInMonth(form.cardId, installments, currentMonthKey()) : null;
  // Solo se ofrece elegir integrante de familia si la categoría elegida lo permite (ver Configuración → Categorías).
  const selectedCategoryForFamily = findCategoryByPath(form.category, categories);
  const showFamilyMembersField =
    (form.kind === "gasto" || form.kind === "ingreso") &&
    !!selectedCategoryForFamily &&
    categoryAllowsFamilyMembers(selectedCategoryForFamily, categories) &&
    familyMembers.length > 0;
  // Solo para Ingreso en una categoría con `trackOrders` (ej. MINUCHI > Ventas, ver Configuración → Categorías).
  const showOrderFields =
    form.kind === "ingreso" && !!selectedCategoryForFamily && categoryTracksOrders(selectedCategoryForFamily, categories);

  const fromAcc = accounts.find((a) => a.id === form.fromAccountId);
  const toAcc = accounts.find((a) => a.id === form.toAccountId);
  const needsRate = !!fromAcc && !!toAcc && fromAcc.currency !== toAcc.currency;

  // Recalcula el monto que entra en destino cuando cambia el monto que sale
  // o la cotización, si las monedas difieren. El usuario puede seguir
  // editando "toAmount" a mano después (ej. si el banco cobró comisión).
  const applyRate = (fromAmount: string, rate: string, from = fromAcc, to = toAcc) => {
    if (!from || !to || from.currency === to.currency) return fromAmount;
    const amountNum = parseFloat(fromAmount.replace(",", "."));
    const rateNum = parseFloat(rate.replace(",", "."));
    if (!Number.isFinite(amountNum) || !Number.isFinite(rateNum) || rateNum <= 0) return "";
    const result = from.currency === "USD" ? amountNum * rateNum : amountNum / rateNum;
    return String(Math.round(result * 100) / 100);
  };

  // Sugiere automáticamente la cotización del BCU (USD billete, venta, con el
  // desfasaje día+1 ya aplicado) para la fecha de la transferencia, mientras
  // el usuario no la haya tocado a mano. Si edita el campo, dejamos de
  // pisarla aunque cambie la cuenta o la fecha.
  const [rateAutoSuggested, setRateAutoSuggested] = useState(() => !initialTransfer);
  useEffect(() => {
    if (form.kind !== "transferencia" || form.transferKind !== "cuentas" || !needsRate || !rateAutoSuggested) return;
    let cancelado = false;
    fetchRateForDate("USD", form.date).then((row) => {
      if (cancelado || !row) return;
      setForm((f) => ({ ...f, exchangeRate: String(row.sell), toAmount: applyRate(f.fromAmount, String(row.sell)) }));
    });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.kind, form.transferKind, needsRate, form.date, rateAutoSuggested]);

  // Sugiere el IVA (tasa básica, 22%) contenido en el monto del gasto o
  // ingreso, mientras el usuario no haya tocado el campo a mano. Se
  // recalcula si cambia el monto; deja de pisarlo apenas lo edita directamente.
  const [ivaAutoSuggested, setIvaAutoSuggested] = useState(true);
  useEffect(() => {
    if ((form.kind !== "gasto" && form.kind !== "ingreso") || !form.ivaChecked || !ivaAutoSuggested) return;
    const amountNum = parseFloat(form.amount.replace(",", "."));
    if (!Number.isFinite(amountNum) || amountNum <= 0) return;
    setForm((f) => ({ ...f, ivaAmount: String(ivaIncluidoEn(amountNum)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.kind, form.ivaChecked, form.amount, ivaAutoSuggested]);

  // "¿IVA Compras?" / "¿IVA Ventas?": el movimiento que cuenta como tuyo
  // (categorizado, para Ingresos/Gastos, presupuestos, etc.) queda por la
  // diferencia (neto de IVA); el IVA se acredita aparte en Personas contra
  // Gustavo Brignoni, con la misma cuenta/tarjeta del movimiento. Así, entre
  // las dos entradas, la cuenta o el consumo de la tarjeta reflejan el monto
  // total real que salió o entró (igual que sin esto), pero el IVA no cuenta
  // como gasto/ingreso tuyo. En Compras es un crédito a tu favor (él te
  // queda debiendo, lo recupera); en Ventas es al revés (le quedás debiendo
  // vos el débito que hay que remitir).
  const maybeCreateIvaCredit = (ivaAmountMinor: number, numCuotas?: number) => {
    if (ivaAmountMinor <= 0) return;
    const isVentas = form.kind === "ingreso";
    const { id: contactId, contactToCreate } = resolveIvaContact(contacts);
    if (contactToCreate) onSaveContact(contactToCreate);
    onSaveContactEntry({
      id: crypto.randomUUID(),
      contactId,
      date: form.date,
      amountMinor: isVentas ? -ivaAmountMinor : ivaAmountMinor,
      currency: form.currency,
      accountId: form.paymentMethod === "cuenta" ? form.accountId || undefined : undefined,
      cardId: form.paymentMethod === "tarjeta" ? form.cardId || undefined : undefined,
      cardExtensionId: form.paymentMethod === "tarjeta" ? form.cardExtensionId || undefined : undefined,
      numInstallments: numCuotas && numCuotas > 1 ? numCuotas : undefined,
      description: `${isVentas ? "IVA Ventas" : "IVA Compras"}${form.category ? ` · ${form.category}` : ""}${form.note.trim() ? ` · ${form.note.trim()}` : ""}`,
    });
  };

  const handleSave = () => {
    if (form.kind === "transferencia" && form.transferKind === "cuentas") {
      if (!fromAcc || !toAcc) return setError("Elegí cuenta de origen y destino.");
      if (fromAcc.id === toAcc.id) return setError("La cuenta de origen y destino no pueden ser la misma.");
      const fromAmountMinor = parseAmountInput(form.fromAmount);
      if (fromAmountMinor === null || fromAmountMinor === 0) return setError("Ingresá el monto que sale, mayor a cero.");
      if (!form.date) return setError("Elegí una fecha.");

      let toAmountMinor: number;
      let exchangeRate: number | undefined;
      if (fromAcc.currency === toAcc.currency) {
        toAmountMinor = fromAmountMinor;
      } else {
        const parsedToAmount = parseAmountInput(form.toAmount);
        if (parsedToAmount === null || parsedToAmount === 0) {
          return setError("Ingresá la cotización o el monto que entra en la cuenta destino.");
        }
        toAmountMinor = parsedToAmount;
        const rateNum = parseFloat(form.exchangeRate.replace(",", "."));
        exchangeRate = Number.isFinite(rateNum) && rateNum > 0 ? rateNum : undefined;
      }

      onSaveTransfer({
        id: movementId,
        date: form.date,
        fromAccountId: fromAcc.id,
        toAccountId: toAcc.id,
        fromAmountMinor,
        toAmountMinor,
        exchangeRate,
        note: form.note.trim() || undefined,
        receiptPaths: form.receiptPaths,
        createdByUserId: initialTransfer?.createdByUserId,
      });
      return;
    }

    if (form.kind === "transferencia" && form.transferKind === "tarjeta") {
      if (!form.cardId) return setError("Elegí una tarjeta.");
      const amountMinor = parseAmountInput(form.amount);
      if (amountMinor === null || amountMinor === 0) return setError("Ingresá un monto válido, mayor a cero.");
      if (!form.accountId) return setError("Elegí desde qué cuenta se paga.");
      if (!form.date) return setError("Elegí una fecha.");

      onSaveCardPayment({
        id: movementId,
        cardId: form.cardId,
        accountId: form.accountId,
        date: form.date,
        amountMinor,
        currency: form.currency,
        note: form.note.trim() || undefined,
        receiptPaths: form.receiptPaths,
      });
      return;
    }

    if (form.kind === "transferencia" && form.transferKind === "personas") {
      if (!form.contactId) return setError("Elegí una persona o concepto.");
      const amountAbs = parseAmountInput(form.amount);
      if (amountAbs === null || amountAbs === 0) return setError("Ingresá un monto válido, mayor a cero.");
      if (!form.contactDescription.trim()) return setError("Ingresá una descripción.");
      if (!form.date) return setError("Elegí una fecha.");
      if (form.paymentMethod === "tarjeta" && !form.cardId) return setError("Elegí una tarjeta.");

      onSaveContactEntry({
        id: movementId,
        contactId: form.contactId,
        date: form.date,
        amountMinor: form.contactFavorMio ? amountAbs : -amountAbs,
        currency: form.currency,
        description: form.contactDescription.trim(),
        accountId: form.paymentMethod === "cuenta" ? form.accountId || undefined : undefined,
        cardId: form.paymentMethod === "tarjeta" ? form.cardId || undefined : undefined,
        cardExtensionId: form.paymentMethod === "tarjeta" ? form.cardExtensionId || undefined : undefined,
        receiptPaths: form.receiptPaths,
        createdByUserId: initialContactEntry?.createdByUserId,
      });
      return;
    }

    // Gasto / Ingreso (los otros tres casos, todos "transferencia", ya
    // devolvieron arriba). TS no puede inferir esto solo a partir de los
    // `return` condicionales de arriba, así que lo dejamos explícito.
    const movementType: "gasto" | "ingreso" = form.kind === "ingreso" ? "ingreso" : "gasto";
    const amountMinor = parseAmountInput(form.amount);
    if (amountMinor === null || amountMinor === 0) return setError("Ingresá un monto válido, mayor a cero.");
    if (!form.date) return setError("Elegí una fecha.");
    // La categoría es opcional a propósito: permite cargar rápido y
    // categorizar después (ver el filtro de "pendientes" en Movimientos).
    if (form.kind === "gasto" && form.paymentMethod === "tarjeta" && !form.cardId) return setError("Elegí una tarjeta.");
    if (showOrderFields && !form.orderNumber.trim()) return setError("Ingresá el número de pedido.");

    // "¿IVA Compras?" / "¿IVA Ventas?": el gasto o ingreso que queda
    // categorizado (y el que sale/entra por la cuenta/tarjeta vía este
    // movimiento) es por la diferencia; el IVA se acredita aparte contra
    // Gustavo Brignoni (ver `maybeCreateIvaCredit`), con la misma
    // cuenta/tarjeta, para que entre las dos el total real coincida con lo
    // que efectivamente pagaste o cobraste.
    let ivaAmountMinor = 0;
    if ((form.kind === "gasto" || form.kind === "ingreso") && form.ivaChecked) {
      const parsedIva = parseAmountInput(form.ivaAmount);
      if (parsedIva === null || parsedIva <= 0) return setError("Ingresá un IVA válido, mayor a cero.");
      if (parsedIva >= amountMinor) return setError(`El IVA no puede ser mayor o igual al monto del ${form.kind}.`);
      ivaAmountMinor = parsedIva;
    }
    const netAmountMinor = amountMinor - ivaAmountMinor;

    let personaAmountMinor: number | null = null;
    if (form.paymentMethod === "persona") {
      if (!form.contactId) return setError("Elegí una persona o concepto.");
      const raw = form.personaAmount.trim();
      personaAmountMinor = raw ? parseAmountInput(raw) : amountMinor;
      if (personaAmountMinor === null || personaAmountMinor <= 0) return setError("Ingresá un monto válido para la persona, mayor a cero.");
      if (personaAmountMinor > amountMinor) return setError("El monto a cargo de la persona no puede ser mayor al del gasto/ingreso.");
    }

    // Reparto opcional del monto entre los integrantes de familia elegidos
    // (ver `familyMemberAmounts`): lo que no se desglosa a mano queda
    // entendido como compartido entre todos, así que no exigimos que sume
    // exacto, solo que no se pase del total.
    let familyMemberAmountsMinor: Record<string, number> | undefined;
    if (showFamilyMembersField && form.familyMemberIds.length > 1 && form.splitFamilyAmounts) {
      const parsed: Record<string, number> = {};
      let sum = 0;
      for (const memberId of form.familyMemberIds) {
        const raw = form.familyMemberAmounts[memberId]?.trim();
        if (!raw) continue;
        const amt = parseAmountInput(raw);
        if (amt === null || amt < 0) return setError("Ingresá un monto válido para el reparto entre integrantes.");
        parsed[memberId] = amt;
        sum += amt;
      }
      if (sum > netAmountMinor) return setError("Lo repartido entre los integrantes no puede sumar más que el monto del gasto/ingreso.");
      if (Object.keys(parsed).length > 0) familyMemberAmountsMinor = parsed;
    }

    if (showInstallmentsField) {
      const numCuotas = Math.max(1, parseInt(form.numInstallments) || 1);
      if (isEditingInstallment || numCuotas > 1) {
        onSaveInstallment({
          id: movementId,
          cardId: form.cardId,
          description: form.category.trim() || "Sin categorizar",
          category: form.category || undefined,
          note: form.note.trim() || undefined,
          currency: form.currency,
          totalAmountMinor: netAmountMinor,
          numInstallments: numCuotas,
          startMonth: form.date.slice(0, 7),
          installmentAmountMinor: Math.round(netAmountMinor / numCuotas),
          date: form.date,
          receiptPaths: form.receiptPaths,
          createdByUserId: initialInstallment?.createdByUserId,
          cardExtensionId: form.cardExtensionId || undefined,
          familyMemberIds: showFamilyMembersField && form.familyMemberIds.length > 0 ? form.familyMemberIds : undefined,
          familyMemberAmounts: familyMemberAmountsMinor,
        });
        maybeCreateIvaCredit(ivaAmountMinor, numCuotas);
        return;
      }
    }

    onSaveTransaction({
      id: movementId,
      type: movementType,
      amountMinor: netAmountMinor,
      currency: form.currency,
      category: form.category || undefined,
      date: form.date,
      note: form.note.trim() || undefined,
      accountId: form.paymentMethod === "cuenta" ? form.accountId || undefined : undefined,
      cardId: form.kind === "gasto" && form.paymentMethod === "tarjeta" ? form.cardId || undefined : undefined,
      cardExtensionId: form.kind === "gasto" && form.paymentMethod === "tarjeta" ? form.cardExtensionId || undefined : undefined,
      mortgageLoanId: form.kind === "gasto" ? form.mortgageLoanId || undefined : undefined,
      familyMemberIds: showFamilyMembersField && form.familyMemberIds.length > 0 ? form.familyMemberIds : undefined,
      familyMemberAmounts: familyMemberAmountsMinor,
      orderType: showOrderFields ? form.orderType : undefined,
      orderNumber: showOrderFields ? form.orderNumber.trim() || undefined : undefined,
      receiptPaths: form.receiptPaths,
      createdByUserId: initial?.createdByUserId,
    });
    maybeCreateIvaCredit(ivaAmountMinor);

    // Medio de pago "persona": además del gasto/ingreso de arriba (con su
    // categoría de siempre), registra por separado en Personas cuánto falta
    // saldar con esa persona. En Gasto, alguien puso esa plata por vos —
    // le quedás debiendo (a favor suyo). En Ingreso, es al revés: reconocés
    // el ingreso ya (por su categoría) pero todavía no te lo pagaron — la
    // persona te queda debiendo (a favor tuyo), hasta que registres el cobro
    // real (ej. una Transferencia > Personas contra la cuenta del banco).
    if (personaAmountMinor !== null) {
      onSaveContactEntry({
        id: crypto.randomUUID(),
        contactId: form.contactId,
        date: form.date,
        amountMinor: form.kind === "ingreso" ? personaAmountMinor : -personaAmountMinor,
        currency: form.currency,
        description: form.category
          ? `${form.category}${form.note.trim() ? ` · ${form.note.trim()}` : ""}`
          : form.note.trim() || (form.kind === "gasto" ? "Gasto" : "Ingreso"),
      });
    }
  };

  // La cantidad de cuotas solo se puede elegir al pagar un gasto con tarjeta, y no al
  // editar un gasto de pago único ya cargado (para eso conviene cargar un movimiento nuevo).
  const showInstallmentsField = form.kind === "gasto" && form.paymentMethod === "tarjeta" && !isEditingTransaction;

  // Si existe la categoría madre MINUCHI (ver Configuración → Categorías),
  // se ofrece el scope Personal/MINUCHI arriba de Tipo; si no, ni se muestra
  // (nada cambia para quien no la usa).
  const hasMinuchi = categories.some(isMinuchiRootCategory);

  const kindOptions =
    presetCardId || isEditingTransaction || isEditingInstallment || form.scope === "minuchi"
      ? [{ value: "gasto" as const, label: "Gasto" }, { value: "ingreso" as const, label: "Ingreso" }]
      : [
          { value: "gasto" as const, label: "Gasto" },
          { value: "ingreso" as const, label: "Ingreso" },
          { value: "transferencia" as const, label: "Transferencia" },
        ];

  // Categorías que puede ofrecer el picker (y el alta rápida) según el scope
  // elegido: MINUCHI no tiene cuentas propias, así que su scope solo aplica
  // a Gasto/Ingreso, nunca a Transferencia.
  const scopedCategories = filterCategoriesByScope(categories, form.scope);

  const transferKindOptions = [
    { value: "cuentas" as const, label: "Entre cuentas" },
    ...(canEditCards ? [{ value: "tarjeta" as const, label: "Tarjeta" }] : []),
    ...(canEditContacts ? [{ value: "personas" as const, label: "Personas" }] : []),
  ];

  const paymentMethodOptions = [
    { value: "ninguno" as const, label: "Sin asignar" },
    { value: "cuenta" as const, label: "Cuenta" },
    ...(form.kind === "gasto" ? [{ value: "tarjeta" as const, label: "Tarjeta" }] : []),
    ...(!isEditingTransaction && canEditContacts && contacts.length > 0 ? [{ value: "persona" as const, label: "Persona" }] : []),
  ];

  const transferPersonaPaymentOptions = [
    { value: "ninguno" as const, label: "Sin vincular" },
    { value: "cuenta" as const, label: "Cuenta" },
    { value: "tarjeta" as const, label: "Tarjeta" },
  ];

  const title = isEditingTransfer
    ? "Editar transferencia"
    : isEditingTransaction || isEditingInstallment || isEditingContactEntry
    ? "Editar movimiento"
    : presetCardId
    ? "Nuevo gasto con tarjeta"
    : "Nuevo movimiento";

  return (
    <Modal title={title} onClose={onClose}>
      {!isEditingTransfer && !isEditingContactEntry && hasMinuchi && (
        <Field label="¿De quién es este movimiento?">
          {() => (
            <Segment
              value={form.scope}
              onChange={(v) =>
                setForm((f) => ({
                  ...f,
                  scope: v,
                  // MINUCHI no tiene cuentas propias: si venía en Transferencia, pasa a Gasto.
                  kind: v === "minuchi" && f.kind === "transferencia" ? "gasto" : f.kind,
                  // La categoría del otro scope ya no es válida acá, se limpia para elegir de nuevo.
                  category: "",
                }))
              }
              options={[
                { value: "personal", label: "Personal" },
                { value: "minuchi", label: "MINUCHI" },
              ]}
            />
          )}
        </Field>
      )}

      {!isEditingTransfer && !isEditingContactEntry && (
        <Field label="Tipo">
          {() => (
            <Segment
              value={form.kind}
              onChange={(v) => setForm((f) => ({ ...f, kind: v, transferKind: "cuentas", paymentMethod: "ninguno", accountId: "", cardId: "", category: v === "transferencia" ? f.category : "" }))}
              options={kindOptions}
            />
          )}
        </Field>
      )}

      {form.kind === "transferencia" ? (
        <>
          {!isEditingTransfer && !isEditingContactEntry && transferKindOptions.length > 1 && (
            <Field label="¿Qué tipo de transferencia?">
              {() => (
                <Segment
                  value={form.transferKind}
                  onChange={(v) => setForm((f) => ({ ...f, transferKind: v, paymentMethod: "ninguno", accountId: "", cardId: "" }))}
                  options={transferKindOptions}
                />
              )}
            </Field>
          )}

          {form.transferKind === "cuentas" &&
            (accounts.length < 2 ? (
              <p className="text-xs mb-3" style={{ color: C.textFaint }}>
                Necesitás al menos dos cajas creadas (en Cuentas) para poder transferir entre ellas.
              </p>
            ) : (
              <>
                <Field label="Desde">
                  {(id) => (
                    <Select
                      id={id}
                      value={form.fromAccountId}
                      onChange={(e) => setForm((f) => ({ ...f, fromAccountId: e.target.value, toAmount: applyRate(f.fromAmount, f.exchangeRate, accounts.find((a) => a.id === e.target.value), toAcc) }))}
                    >
                      {transferAccountOptions(form.fromAccountId).map((a) => <option key={a.id} value={a.id}>{accountSelectLabel(a, banks)}</option>)}
                    </Select>
                  )}
                </Field>
                <Field label="Hacia">
                  {(id) => (
                    <Select
                      id={id}
                      value={form.toAccountId}
                      onChange={(e) => setForm((f) => ({ ...f, toAccountId: e.target.value, toAmount: applyRate(f.fromAmount, f.exchangeRate, fromAcc, accounts.find((a) => a.id === e.target.value)) }))}
                    >
                      {transferAccountOptions(form.toAccountId).map((a) => <option key={a.id} value={a.id}>{accountSelectLabel(a, banks)}</option>)}
                    </Select>
                  )}
                </Field>
                <Field label="Fecha">
                  {(id) => <TextInput id={id} type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />}
                </Field>
                <Field label={`Monto que sale${fromAcc ? ` (${fromAcc.currency})` : ""}`}>
                  {(id) => (
                    <TextInput
                      id={id}
                      type="text"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={form.fromAmount}
                      onChange={(e) => setForm((f) => ({ ...f, fromAmount: e.target.value, toAmount: applyRate(e.target.value, f.exchangeRate) }))}
                      placeholder="0"
                    />
                  )}
                </Field>

                {needsRate && (
                  <>
                    <Field label={`Cotización (1 USD = ? UYU)${rateAutoSuggested ? " · sugerida" : ""}`}>
                      {(id) => (
                        <TextInput
                          id={id}
                          type="text"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={form.exchangeRate}
                          onChange={(e) => {
                            setRateAutoSuggested(false);
                            setForm((f) => ({ ...f, exchangeRate: e.target.value, toAmount: applyRate(f.fromAmount, e.target.value) }));
                          }}
                          placeholder="ej. 40.50"
                        />
                      )}
                    </Field>
                    <Field label={`Monto que entra${toAcc ? ` (${toAcc.currency})` : ""}`}>
                      {(id) => (
                        <TextInput
                          id={id}
                          type="text"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={form.toAmount}
                          onChange={(e) => setForm((f) => ({ ...f, toAmount: e.target.value }))}
                          placeholder="Se calcula solo con la cotización, o ingresalo a mano"
                        />
                      )}
                    </Field>
                  </>
                )}

                <Field label="Nota (opcional)">
                  {(id) => <TextInput id={id} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Detalle..." />}
                </Field>
              </>
            ))}

          {form.transferKind === "tarjeta" &&
            (cards.length === 0 ? (
              <p className="text-xs mb-3" style={{ color: C.textFaint }}>No tenés tarjetas creadas. Creá una en Tarjetas.</p>
            ) : (
              <>
                <Field label="Tarjeta">
                  {(id) => (
                    <Combobox
                      id={id}
                      value={form.cardId}
                      placeholder="Elegí una tarjeta"
                      onChange={(cardId) => setForm((f) => ({ ...f, cardId }))}
                      options={cards.map((c) => ({ value: c.id, label: cardLabel(c, banks) }))}
                    />
                  )}
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Monto">
                    {(id) => <TextInput id={id} type="text" inputMode="decimal" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0" />}
                  </Field>
                  <Field label="Moneda">
                    {() => <Segment value={form.currency} onChange={(v) => setForm((f) => ({ ...f, currency: v, accountId: "" }))} options={[{ value: "UYU", label: "UYU" }, { value: "USD", label: "USD" }]} />}
                  </Field>
                </div>
                {cardDueThisMonth && (cardDueThisMonth.UYU > 0 || cardDueThisMonth.USD > 0) && (
                  <p className="text-xs mb-3" style={{ color: C.textMuted }}>
                    Cuota que vence este mes: {cardDueThisMonth.UYU > 0 && <span className="font-mono">{formatMoney(cardDueThisMonth.UYU, "UYU")}</span>}
                    {cardDueThisMonth.UYU > 0 && cardDueThisMonth.USD > 0 && " · "}
                    {cardDueThisMonth.USD > 0 && <span className="font-mono">{formatMoney(cardDueThisMonth.USD, "USD")}</span>}
                  </p>
                )}
                <Field label="Cuenta de origen">
                  {(id) =>
                    eligibleAccounts.length === 0 ? (
                      <p className="text-xs" style={{ color: C.textFaint }}>No tenés cajas en {form.currency}. Creá una en Cuentas.</p>
                    ) : (
                      <Select id={id} value={form.accountId} onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}>
                        <option value="">Elegí una cuenta</option>
                        {eligibleAccounts.map((a) => <option key={a.id} value={a.id}>{accountSelectLabel(a, banks)}</option>)}
                      </Select>
                    )
                  }
                </Field>
                <Field label="Fecha">
                  {(id) => <TextInput id={id} type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />}
                </Field>
                <Field label="Nota (opcional)">
                  {(id) => <TextInput id={id} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Pago mínimo, pago total..." />}
                </Field>
              </>
            ))}

          {form.transferKind === "personas" && (
            <>
              {contacts.length === 0 ? (
                <p className="text-xs mb-3" style={{ color: C.textFaint }}>
                  Todavía no tenés personas ni conceptos cargados. Creá uno con el botón de abajo.
                </p>
              ) : (
                <Field label="Persona o concepto">
                  {(id) => (
                    <Combobox
                      id={id}
                      value={form.contactId}
                      placeholder="Elegí a quién o qué"
                      onChange={(contactId) => setForm((f) => ({ ...f, contactId }))}
                      options={[...contacts]
                        .sort((a, b) => (contactKind(a) === contactKind(b) ? 0 : contactKind(a) === "persona" ? -1 : 1))
                        .map((c) => ({ value: c.id, label: c.name, group: contactKind(c) === "concepto" ? "Conceptos" : "Personas" }))}
                    />
                  )}
                </Field>
              )}
              {!isEditingContactEntry && (
                <div className="flex justify-end -mt-1 mb-3">
                  <button type="button" onClick={() => setShowContactModal(true)} className="text-xs font-semibold" style={{ color: C.usd }}>
                    + Nueva persona o concepto
                  </button>
                </div>
              )}

              <Field label="Tipo de movimiento">
                {() => (
                  <Segment
                    value={form.contactFavorMio ? "favor" : "contra"}
                    onChange={(v) => setForm((f) => ({ ...f, contactFavorMio: v === "favor" }))}
                    options={[
                      { value: "favor", label: "A favor mío" },
                      { value: "contra", label: "A favor suyo" },
                    ]}
                  />
                )}
              </Field>
              <p className="text-xs -mt-2 mb-3" style={{ color: C.textFaint }}>
                {form.contactFavorMio
                  ? "Vos pusiste la plata (pagaste algo suyo, le prestaste, o le devolviste lo que le debías). Aumenta lo que te debe."
                  : "Ella puso la plata (te pagó, te devolvió algo, o pagó algo tuyo). Disminuye lo que te debe."}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Monto">
                  {(id) => <TextInput id={id} type="text" inputMode="decimal" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0" />}
                </Field>
                <Field label="Moneda">
                  {() => <Segment value={form.currency} onChange={(v) => setForm((f) => ({ ...f, currency: v, accountId: "" }))} options={[{ value: "UYU", label: "UYU" }, { value: "USD", label: "USD" }]} />}
                </Field>
              </div>
              <Field label="Descripción">
                {(id) => <TextInput id={id} value={form.contactDescription} onChange={(e) => setForm((f) => ({ ...f, contactDescription: e.target.value }))} placeholder="Cena, nafta, regalo..." />}
              </Field>
              <Field label="Fecha">
                {(id) => <TextInput id={id} type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />}
              </Field>

              <Field label="Medio de pago (opcional)">
                {() => (
                  <Segment
                    value={form.paymentMethod}
                    onChange={(v) => setForm((f) => ({ ...f, paymentMethod: v, accountId: "", cardId: "", cardExtensionId: "" }))}
                    options={transferPersonaPaymentOptions}
                  />
                )}
              </Field>
              {form.paymentMethod === "cuenta" && (
                <Field label="Cuenta">
                  {(id) =>
                    eligibleAccounts.length === 0 ? (
                      <p className="text-xs" style={{ color: C.textFaint }}>No tenés cajas en {form.currency}.</p>
                    ) : (
                      <Combobox
                        id={id}
                        value={form.accountId}
                        placeholder="Elegí una cuenta"
                        onChange={(accountId) => setForm((f) => ({ ...f, accountId }))}
                        options={eligibleAccounts.map((a) => ({ value: a.id, label: accountSelectLabel(a, banks) }))}
                      />
                    )
                  }
                </Field>
              )}
              {form.paymentMethod === "tarjeta" && (
                <Field label="Tarjeta">
                  {(id) =>
                    cards.length === 0 ? (
                      <p className="text-xs" style={{ color: C.textFaint }}>No tenés tarjetas creadas. Creá una en Tarjetas.</p>
                    ) : (
                      <Combobox
                        id={id}
                        value={form.cardId}
                        placeholder="Elegí una tarjeta"
                        onChange={(cardId) => setForm((f) => ({ ...f, cardId, cardExtensionId: defaultCardExtensionId(cards.find((c) => c.id === cardId), activeUser) }))}
                        options={cards.map((c) => ({ value: c.id, label: cardLabel(c, banks) }))}
                      />
                    )
                  }
                </Field>
              )}
              {form.paymentMethod === "tarjeta" && (selectedCard?.extensions?.length ?? 0) > 0 && (
                <Field label="¿Con qué tarjeta?">
                  {() => (
                    <Segment
                      value={form.cardExtensionId}
                      onChange={(v) => setForm((f) => ({ ...f, cardExtensionId: v }))}
                      options={[
                        { value: "", label: "Titular" },
                        ...(selectedCard?.extensions ?? []).map((e) => ({ value: e.id, label: e.name })),
                      ]}
                    />
                  )}
                </Field>
              )}
              <p className="text-xs -mt-2 mb-3" style={{ color: C.textFaint }}>
                {form.paymentMethod === "cuenta"
                  ? form.contactFavorMio
                    ? "Se va a descontar de esa cuenta (salió plata real)."
                    : "Se va a sumar a esa cuenta (entró plata real)."
                  : form.paymentMethod === "tarjeta"
                  ? "Se suma al consumo y a la deuda pendiente de esa tarjeta, igual que un gasto con tarjeta, pero sin contar como gasto tuyo."
                  : "Sin vincular cuenta ni tarjeta, queda solo como registro informativo (ej. pagó algo directamente, sin pasar por tu plata)."}
              </p>
            </>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monto">
              {(id) => <TextInput id={id} type="text" inputMode="decimal" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0" />}
            </Field>
            <Field label="Moneda">
              {() => <Segment value={form.currency} onChange={(v) => setForm((f) => ({ ...f, currency: v }))} options={[{ value: "UYU", label: "UYU" }, { value: "USD", label: "USD" }]} />}
            </Field>
          </div>
          <CategoryPicker
            categories={scopedCategories}
            type={form.kind === "ingreso" ? "ingreso" : "gasto"}
            value={form.category}
            onChange={(name) => setForm((f) => ({ ...f, category: name }))}
            allowEmpty
          />
          <div className="flex justify-end -mt-1 mb-3">
            <button type="button" onClick={() => setShowCategoryModal(true)} className="text-xs font-semibold" style={{ color: C.usd }}>
              + Nueva categoría
            </button>
          </div>
          {showFamilyMembersField && (
            <Field label="¿Para quién? (opcional)">
              {() => (
                <div className="flex flex-wrap gap-1.5">
                  {familyMembers.map((m) => {
                    const selected = form.familyMemberIds.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() =>
                          setForm((f) => {
                            if (selected) {
                              const restAmounts = { ...f.familyMemberAmounts };
                              delete restAmounts[m.id];
                              return { ...f, familyMemberIds: f.familyMemberIds.filter((id) => id !== m.id), familyMemberAmounts: restAmounts };
                            }
                            return { ...f, familyMemberIds: [...f.familyMemberIds, m.id] };
                          })
                        }
                        className="text-xs font-semibold px-3 py-1.5 rounded-full"
                        style={{
                          background: selected ? C.usd : C.surface2,
                          color: selected ? "#0A1413" : C.textMuted,
                          border: `1px solid ${selected ? C.usd : C.border}`,
                        }}
                      >
                        {m.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </Field>
          )}
          {showFamilyMembersField && form.familyMemberIds.length > 1 && (
            <>
              <Field label="¿Repartir el monto entre ellos? (opcional)">
                {() => (
                  <Segment
                    value={form.splitFamilyAmounts ? "si" : "no"}
                    onChange={(v) => setForm((f) => ({ ...f, splitFamilyAmounts: v === "si" }))}
                    options={[{ value: "no", label: "No, es compartido" }, { value: "si", label: "Sí, por monto" }]}
                  />
                )}
              </Field>
              {form.splitFamilyAmounts && (
                <>
                  {form.familyMemberIds.map((id) => {
                    const member = familyMembers.find((m) => m.id === id);
                    return (
                      <Field key={id} label={`Parte de ${member?.name ?? "?"} (${form.currency})`}>
                        {(fieldId) => (
                          <TextInput
                            id={fieldId}
                            type="text"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            value={form.familyMemberAmounts[id] ?? ""}
                            onChange={(e) => setForm((f) => ({ ...f, familyMemberAmounts: { ...f.familyMemberAmounts, [id]: e.target.value } }))}
                            placeholder="0"
                          />
                        )}
                      </Field>
                    );
                  })}
                  <p className="text-xs -mt-2 mb-3" style={{ color: C.textFaint }}>
                    Dejá en blanco lo que no quieras desglosar; se entiende que esa parte queda compartida entre todos.
                  </p>
                </>
              )}
            </>
          )}
          {showOrderFields && (
            <>
              <Field label="¿Qué es?">
                {() => (
                  <Segment
                    value={form.orderType}
                    onChange={(v) => setForm((f) => ({ ...f, orderType: v }))}
                    options={[
                      { value: "pedido", label: "Pedido" },
                      { value: "sena", label: "Seña pedido" },
                      { value: "saldo", label: "Saldo pedido" },
                    ]}
                  />
                )}
              </Field>
              <Field label="Número de pedido">
                {(id) => (
                  <TextInput
                    id={id}
                    value={form.orderNumber}
                    onChange={(e) => setForm((f) => ({ ...f, orderNumber: e.target.value }))}
                    placeholder="Ej. 123"
                  />
                )}
              </Field>
            </>
          )}
          <Field label="Fecha">
            {(id) => <TextInput id={id} type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />}
          </Field>
          <Field label="Nota (opcional)">
            {(id) => <TextInput id={id} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Detalle..." />}
          </Field>

          {(form.kind === "gasto" || form.kind === "ingreso") && (
            <>
              <Field label={form.kind === "ingreso" ? "¿IVA Ventas?" : "¿IVA Compras?"}>
                {() => (
                  <Segment
                    value={form.ivaChecked ? "si" : "no"}
                    onChange={(v) => {
                      setIvaAutoSuggested(true);
                      setForm((f) => ({ ...f, ivaChecked: v === "si", ivaAmount: v === "si" ? f.ivaAmount : "" }));
                    }}
                    options={[
                      { value: "no", label: "No" },
                      { value: "si", label: "Sí" },
                    ]}
                  />
                )}
              </Field>
              {form.ivaChecked && (
                <>
                  <Field label={`IVA de esta ${form.kind === "ingreso" ? "venta" : "compra"} (${form.currency})`}>
                    {(id) => (
                      <TextInput
                        id={id}
                        type="text"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={form.ivaAmount}
                        onChange={(e) => {
                          setIvaAutoSuggested(false);
                          setForm((f) => ({ ...f, ivaAmount: e.target.value }));
                        }}
                        placeholder="0"
                      />
                    )}
                  </Field>
                  <p className="text-xs -mt-2 mb-3" style={{ color: C.textFaint }}>
                    Sugerido con IVA tasa básica (22%) sobre el monto de arriba; editalo si corresponde otra tasa. El {form.kind} queda registrado por la diferencia (neto de IVA); el IVA se acredita aparte en Personas:{" "}
                    {form.kind === "ingreso"
                      ? `le quedás debiendo ese importe a ${IVA_CONTACT_NAME} (débito a remitir).`
                      : `${IVA_CONTACT_NAME} te queda debiendo ese importe (crédito recuperable).`}
                  </p>
                </>
              )}
            </>
          )}

          <Field label="Medio de pago">
            {() => (
              <Segment
                value={form.paymentMethod}
                onChange={(v) => setForm((f) => ({ ...f, paymentMethod: v, accountId: "", cardId: "", cardExtensionId: "" }))}
                options={paymentMethodOptions}
              />
            )}
          </Field>
          {form.paymentMethod === "cuenta" && (
            <Field label="Cuenta">
              {(id) =>
                eligibleAccounts.length === 0 ? (
                  <p className="text-xs" style={{ color: C.textFaint }}>No tenés cajas en {form.currency}. Creá una en Cuentas.</p>
                ) : (
                  <Combobox
                    id={id}
                    value={form.accountId}
                    placeholder="Elegí una cuenta"
                    onChange={(accountId) => setForm((f) => ({ ...f, accountId }))}
                    options={eligibleAccounts.map((a) => ({ value: a.id, label: accountSelectLabel(a, banks) }))}
                  />
                )
              }
            </Field>
          )}
          {form.kind === "gasto" && form.paymentMethod === "tarjeta" && (
            <Field label="Tarjeta">
              {(id) =>
                cards.length === 0 ? (
                  <p className="text-xs" style={{ color: C.textFaint }}>No tenés tarjetas creadas. Creá una en Tarjetas.</p>
                ) : (
                  <Combobox
                    id={id}
                    value={form.cardId}
                    placeholder="Elegí una tarjeta"
                    onChange={(cardId) => setForm((f) => ({ ...f, cardId, cardExtensionId: defaultCardExtensionId(cards.find((c) => c.id === cardId), activeUser) }))}
                    options={cards.map((c) => ({ value: c.id, label: cardLabel(c, banks) }))}
                  />
                )
              }
            </Field>
          )}
          {form.kind === "gasto" && form.paymentMethod === "tarjeta" && (selectedCard?.extensions?.length ?? 0) > 0 && (
            <Field label="¿Con qué tarjeta?">
              {() => (
                <Segment
                  value={form.cardExtensionId}
                  onChange={(v) => setForm((f) => ({ ...f, cardExtensionId: v }))}
                  options={[
                    { value: "", label: "Titular" },
                    ...(selectedCard?.extensions ?? []).map((e) => ({ value: e.id, label: e.name })),
                  ]}
                />
              )}
            </Field>
          )}
          {showInstallmentsField && (
            <>
              <Field label="Cantidad de cuotas">
                {(id) => (
                  <TextInput
                    id={id}
                    type="text"
                    inputMode="numeric"
                    min="1"
                    value={form.numInstallments}
                    onChange={(e) => setForm((f) => ({ ...f, numInstallments: e.target.value }))}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                )}
              </Field>
              {Math.max(1, parseInt(form.numInstallments) || 1) > 1 && (
                <div className="text-xs mb-2" style={{ color: C.textMuted }}>
                  {Math.max(1, parseInt(form.numInstallments) || 1)} cuotas de{" "}
                  <span className="font-mono" style={{ color: C.text }}>
                    {formatMoney(Math.round((parseAmountInput(form.amount) ?? 0) / Math.max(1, parseInt(form.numInstallments) || 1)), form.currency)}
                  </span>
                </div>
              )}
            </>
          )}

          {form.paymentMethod === "persona" && (
            <>
              {contacts.length === 0 ? (
                <p className="text-xs mb-3" style={{ color: C.textFaint }}>
                  Todavía no tenés personas ni conceptos cargados. Creá uno con el botón de abajo.
                </p>
              ) : (
                <Field label="Persona o concepto">
                  {(id) => (
                    <Combobox
                      id={id}
                      value={form.contactId}
                      placeholder="Elegí quién puso la plata"
                      onChange={(contactId) => setForm((f) => ({ ...f, contactId }))}
                      options={[...contacts]
                        .sort((a, b) => (contactKind(a) === contactKind(b) ? 0 : contactKind(a) === "persona" ? -1 : 1))
                        .map((c) => ({ value: c.id, label: c.name, group: contactKind(c) === "concepto" ? "Conceptos" : "Personas" }))}
                    />
                  )}
                </Field>
              )}
              <div className="flex justify-end -mt-1 mb-3">
                <button type="button" onClick={() => setShowContactModal(true)} className="text-xs font-semibold" style={{ color: C.usd }}>
                  + Nueva persona o concepto
                </button>
              </div>
              <Field
                label={
                  form.kind === "ingreso"
                    ? `¿Cuánto te debe todavía ${selectedContact?.name ?? "esta persona"}? (opcional)`
                    : `¿Cuánto puso ${selectedContact?.name ?? "esta persona"}? (opcional)`
                }
              >
                {(id) => (
                  <TextInput
                    id={id}
                    type="text"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={form.personaAmount}
                    onChange={(e) => setForm((f) => ({ ...f, personaAmount: e.target.value }))}
                    placeholder={`Todo (${form.amount || "0"})`}
                  />
                )}
              </Field>
              <p className="text-xs -mt-2 mb-3" style={{ color: C.textFaint }}>
                {form.kind === "ingreso"
                  ? `El ingreso completo queda categorizado como arriba, aunque todavía no lo hayas cobrado. Si dejás este campo vacío, se asume que ${selectedContact?.name ?? "esta persona"} te debe el 100%; si ponés un monto menor, el resto se considera ya cobrado. Se registra en Personas que te queda debiendo ese importe (a favor tuyo); cuando cobres de verdad, registralo como Transferencia > Personas contra la cuenta del banco.`
                  : `El gasto completo queda categorizado como arriba. Si dejás este campo vacío, se asume que ${selectedContact?.name ?? "esta persona"} puso el 100%; si ponés un monto menor, el resto se considera puesto por vos. Se registra además un movimiento en Personas por ese importe (le quedás debiendo).`}
              </p>
            </>
          )}
        </>
      )}

      <ReceiptField movementId={movementId} paths={form.receiptPaths} onChange={(paths) => setForm((f) => ({ ...f, receiptPaths: paths }))} />

      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>

      {showCategoryModal && (
        <CategoryModal
          categories={scopedCategories}
          defaultType={form.kind === "ingreso" ? "ingreso" : "gasto"}
          onSave={(c) => {
            onSaveCategory(c);
            setForm((f) => ({ ...f, category: categoryFullPath(c, [...categories, c]) }));
            setShowCategoryModal(false);
          }}
          onClose={() => setShowCategoryModal(false)}
        />
      )}
      {showContactModal && (
        <ContactModal
          contacts={contacts}
          onSave={(c) => {
            onSaveContact(c);
            setForm((f) => ({ ...f, contactId: c.id }));
            setShowContactModal(false);
          }}
          onClose={() => setShowContactModal(false)}
        />
      )}
    </Modal>
  );
}
