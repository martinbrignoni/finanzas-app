import { useRef, useState } from "react";
import { CreditCard, Pencil, Trash2, Plus, X, Landmark, ShoppingBag, AlertTriangle, ChevronRight, Download } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Modal, Field, TextInput, Select, Segment, PrimaryButton, IconBtn } from "../../components/ui";
import { ReceiptField, ReceiptButton } from "../../components/ReceiptField";
import { StatementFileRow } from "../../components/StatementFileRow";
import { receiptPathsOf, uploadReceipt, getReceiptUrl, deleteReceipt } from "../../lib/receipts";
import { formatMoney, parseAmountInput, fromMinor } from "../../lib/money";
import { currentMonthKey, monthsBetween, monthKeyOf, addMonths, monthLabel, capitalize, todayISO, formatDateDMY } from "../../lib/dates";
import { accountLabel, accountSelectLabel, isAccountActive } from "../../lib/accounts";
import { getCardStatement, pendingCardStatementMonths } from "../../lib/cardStatements";
import { canEditOwnRecord } from "../../lib/permissions";
import { cardLabel, dueForCardInMonth, cardConsumptionForMonth } from "../../lib/cards";
import { exportCardToExcel } from "../../lib/excelExport";
import type { Card, CardExtension, Installment, Currency, FinanceData, CardPayment, Account, Bank, Transaction, CardStatement, AppUser, ContactEntry, Contact, FamilyMember } from "../../types";

/** Nombre a mostrar para quién hizo un gasto con tarjeta: el titular (undefined) o una extensión puntual. */
function cardHolderLabel(card: Card | undefined, extensionId: string | undefined): string | null {
  if (!card || !extensionId) return null;
  return card.extensions?.find((e) => e.id === extensionId)?.name ?? "Extensión eliminada";
}

/**
 * Deuda real de la tarjeta: cuotas restantes (proyección) + gastos de pago
 * único cargados a la tarjeta + movimientos con personas pagados con esta
 * tarjeta (ver `ContactEntry.cardId`), menos los pagos ya registrados. A
 * diferencia de una proyección pura, esto sí se reduce cuando registrás un pago.
 */
function cardDebt(
  cardId: string,
  installments: Installment[],
  transactions: Transaction[],
  contactEntries: ContactEntry[],
  cardPayments: CardPayment[],
  mk: string
): Record<Currency, number> {
  const debt: Record<Currency, number> = { UYU: 0, USD: 0 };
  installments.filter((i) => i.cardId === cardId).forEach((inst) => {
    const passed = monthsBetween(inst.startMonth, mk);
    const remaining = Math.max(0, Math.min(inst.numInstallments, inst.numInstallments - Math.max(0, passed)));
    debt[inst.currency] += remaining * inst.installmentAmountMinor;
  });
  transactions.filter((t) => t.type === "gasto" && t.cardId === cardId).forEach((t) => {
    debt[t.currency] += t.amountMinor;
  });
  contactEntries.filter((e) => e.cardId === cardId).forEach((e) => {
    debt[e.currency] += Math.abs(e.amountMinor);
  });
  cardPayments.filter((p) => p.cardId === cardId).forEach((p) => {
    debt[p.currency] -= p.amountMinor;
  });
  return debt;
}

/**
 * Igual que `cardConsumptionForMonth`, pero desglosado por quién hizo cada
 * gasto: el titular y cada extensión. Solo tiene sentido si la tarjeta tiene
 * extensiones cargadas.
 */
function cardConsumptionByHolder(
  card: Card,
  installments: Installment[],
  transactions: Transaction[],
  mk: string
): { label: string; amounts: Record<Currency, number> }[] {
  const buckets = new Map<string, Record<Currency, number>>();
  const ensure = (key: string) => {
    if (!buckets.has(key)) buckets.set(key, { UYU: 0, USD: 0 });
    return buckets.get(key)!;
  };

  installments.filter((i) => i.cardId === card.id).forEach((inst) => {
    const idx = monthsBetween(inst.startMonth, mk);
    if (idx >= 0 && idx < inst.numInstallments) {
      ensure(inst.cardExtensionId ?? "")[inst.currency] += inst.installmentAmountMinor;
    }
  });
  transactions
    .filter((t) => t.type === "gasto" && t.cardId === card.id && monthKeyOf(t.date) === mk)
    .forEach((t) => {
      ensure(t.cardExtensionId ?? "")[t.currency] += t.amountMinor;
    });

  // Titular primero, después cada extensión en el orden en que están cargadas.
  const order = ["", ...(card.extensions ?? []).map((e) => e.id)];
  return order
    .filter((key) => buckets.has(key))
    .map((key) => ({
      label: key === "" ? "Titular" : card.extensions?.find((e) => e.id === key)?.name ?? "Extensión eliminada",
      amounts: buckets.get(key)!,
    }));
}

export function Cards({
  data,
  canEdit,
  canEditMovements,
  onEditInstallment,
  onDeleteInstallment,
  onEditCardPayment,
  onDeleteCardPayment,
  onEditTransaction,
  onDeleteTransaction,
  onSaveCardStatement,
}: {
  data: FinanceData;
  canEdit: boolean;
  /** Permiso para editar/eliminar los gastos con tarjeta y compras en cuotas (viven en Movimientos). */
  canEditMovements: boolean;
  onEditInstallment: (i: Installment) => void;
  onDeleteInstallment: (id: string) => void;
  onEditCardPayment: (p: CardPayment) => void;
  onDeleteCardPayment: (id: string) => void;
  onEditTransaction: (t: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  onSaveCardStatement: (s: CardStatement) => void;
}) {
  const mk = currentMonthKey();
  const [viewCardId, setViewCardId] = useState<string | null>(null);
  const viewCard = data.cards.find((c) => c.id === viewCardId) ?? null;
  const activeUser = data.users.find((u) => u.id === data.activeUserId) ?? null;

  const cardSummaryProps = { data, mk, onView: setViewCardId };
  const unassignedCards = data.cards.filter((c) => !c.bankId || !data.banks.some((b) => b.id === c.bankId));

  return (
    <div className="pb-24">
      <h1 className="text-2xl mb-4 font-display" style={{ color: C.text }}>Tarjetas y cuotas</h1>

      {data.cards.length === 0 && (
        <div className="rounded-xl p-6 text-center text-sm mb-4" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textMuted }}>
          Todavía no agregaste tarjetas. Podés crear una desde Configuración → Tarjetas.
        </div>
      )}

      <div className="space-y-4 mb-4">
        {data.banks.map((bank) => {
          const bankCards = data.cards.filter((c) => c.bankId === bank.id);
          if (bankCards.length === 0) return null;
          return (
            <div key={bank.id}>
              <div className="flex items-center gap-1.5 mb-2 px-1">
                <Landmark size={13} color={C.textFaint} />
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.textFaint }}>{bank.name}</span>
              </div>
              <div className="space-y-3">
                {bankCards.map((card) => <CardSummaryCard key={card.id} card={card} {...cardSummaryProps} />)}
              </div>
            </div>
          );
        })}

        {unassignedCards.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <CreditCard size={13} color={C.textFaint} />
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.textFaint }}>Sin banco asignado</span>
            </div>
            <div className="space-y-3">
              {unassignedCards.map((card) => <CardSummaryCard key={card.id} card={card} {...cardSummaryProps} />)}
            </div>
          </div>
        )}
      </div>

      {viewCard && (
        <CardDetailModal
          card={viewCard}
          activeUser={activeUser}
          installments={data.installments.filter((i) => i.cardId === viewCard.id)}
          expenses={data.transactions.filter((t) => t.type === "gasto" && t.cardId === viewCard.id)}
          contactEntries={data.contactEntries.filter((e) => e.cardId === viewCard.id)}
          payments={data.cardPayments.filter((p) => p.cardId === viewCard.id)}
          accounts={data.accounts}
          banks={data.banks}
          contacts={data.contacts}
          familyMembers={data.familyMembers}
          users={data.users}
          cardStatements={data.cardStatements}
          canEdit={canEdit}
          canEditMovements={canEditMovements}
          onSaveCardStatement={onSaveCardStatement}
          onEditInstallment={onEditInstallment}
          onDeleteInstallment={onDeleteInstallment}
          onEditTransaction={onEditTransaction}
          onDeleteTransaction={onDeleteTransaction}
          onEditCardPayment={onEditCardPayment}
          onDeleteCardPayment={onDeleteCardPayment}
          onClose={() => setViewCardId(null)}
        />
      )}
    </div>
  );
}

/** Card resumida dentro de un grupo (banco o "sin banco asignado") en la lista de Tarjetas. */
function CardSummaryCard({
  card,
  data,
  mk,
  onView,
}: {
  card: Card;
  data: FinanceData;
  mk: string;
  onView: (id: string) => void;
}) {
  const debt = cardDebt(card.id, data.installments, data.transactions, data.contactEntries, data.cardPayments, mk);
  const consumption = cardConsumptionForMonth(card.id, data.installments, data.transactions, data.contactEntries, mk);
  const pendingMonths = pendingCardStatementMonths(card, data.cardStatements);
  const currentStatement = getCardStatement(data.cardStatements, card.id, mk);

  return (
    <div className="rounded-2xl p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: C.surface3 }}>
            <CreditCard size={16} color={C.usd} />
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: C.text }}>{cardLabel(card, data.banks)}</div>
            <div className="text-xs" style={{ color: C.textFaint }}>
              Cierre día {card.closingDay} · Vence {currentStatement?.dueDate ? formatDateDMY(currentStatement.dueDate) : `día ${card.dueDay}`}
              {card.creditLimitMinor != null && ` · Límite ${formatMoney(card.creditLimitMinor, card.creditLimitCurrency ?? "UYU")}`}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg p-2.5 mb-2" style={{ background: C.surface2 }}>
        <div className="text-[11px] font-semibold mb-1" style={{ color: C.textMuted }}>Consumo de este mes</div>
        <div className="flex gap-4 text-xs font-mono">
          {consumption.UYU === 0 && consumption.USD === 0 ? (
            <span style={{ color: C.textFaint }}>Sin consumo cargado todavía</span>
          ) : (
            <>
              {consumption.UYU !== 0 && <span style={{ color: C.uyu }}>{formatMoney(consumption.UYU, "UYU")}</span>}
              {consumption.USD !== 0 && <span style={{ color: C.usd }}>{formatMoney(consumption.USD, "USD")}</span>}
            </>
          )}
        </div>
      </div>

      <div className="flex gap-4 mb-2 text-xs font-mono" style={{ color: C.textMuted }}>
        <span>Deuda pendiente:</span>
        <span style={{ color: C.uyu }}>{formatMoney(Math.max(0, debt.UYU), "UYU")}</span>
        <span style={{ color: C.usd }}>{formatMoney(Math.max(0, debt.USD), "USD")}</span>
      </div>

      {pendingMonths.length > 0 && (
        <div className="rounded-lg p-2.5 mb-3 text-xs flex items-start gap-1.5" style={{ background: "rgba(217,119,106,0.15)", color: C.negative }}>
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>Falta el estado de cuenta de: {pendingMonths.map((m) => capitalize(monthLabel(m))).join(", ")}.</span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onView(card.id)}
          className="flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1"
          style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text }}
        >
          Ver detalle <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}

function CardDetailModal({
  card,
  installments,
  expenses,
  contactEntries,
  payments,
  accounts,
  banks,
  contacts,
  familyMembers,
  users,
  cardStatements,
  canEdit,
  canEditMovements,
  activeUser,
  onSaveCardStatement,
  onEditInstallment,
  onDeleteInstallment,
  onEditTransaction,
  onDeleteTransaction,
  onEditCardPayment,
  onDeleteCardPayment,
  onClose,
}: {
  card: Card;
  installments: Installment[];
  expenses: Transaction[];
  /** Movimientos con personas pagados con esta tarjeta (ver `ContactEntry.cardId`); solo se usan para el total de consumo del período, no aparecen desglosados en las listas de abajo. */
  contactEntries: ContactEntry[];
  payments: CardPayment[];
  accounts: Account[];
  banks: Bank[];
  contacts: Contact[];
  familyMembers: FamilyMember[];
  users: AppUser[];
  cardStatements: CardStatement[];
  canEdit: boolean;
  canEditMovements: boolean;
  /** Perfil activo: decide, junto con canEdit/canEditMovements, si puede editar/eliminar cada registro puntual (ver `canEditOwnRecord`). */
  activeUser: AppUser | null;
  onSaveCardStatement: (s: CardStatement) => void;
  onEditInstallment: (i: Installment) => void;
  onDeleteInstallment: (id: string) => void;
  onEditTransaction: (t: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  onEditCardPayment: (p: CardPayment) => void;
  onDeleteCardPayment: (id: string) => void;
  onClose: () => void;
}) {
  const mk = currentMonthKey();
  const pendingMonths = pendingCardStatementMonths(card, cardStatements);
  const [statementMonth, setStatementMonth] = useState<string>(() => pendingMonths[0] ?? mk);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [statementError, setStatementError] = useState<string | null>(null);
  const currentStatement = getCardStatement(cardStatements, card.id, statementMonth);
  const [dueDate, setDueDate] = useState(currentStatement?.dueDate ?? "");
  const statementMonthOptions = Array.from({ length: 25 }, (_, i) => addMonths(mk, -i));
  const consumption = cardConsumptionForMonth(card.id, installments, expenses, contactEntries, statementMonth);
  const byHolder = (card.extensions?.length ?? 0) > 0 ? cardConsumptionByHolder(card, installments, expenses, statementMonth) : [];
  const hasAnyFile = !!(currentStatement?.pdfPath || currentStatement?.excelPath);

  const handleMonthChange = (m: string) => {
    setStatementMonth(m);
    setDueDate(getCardStatement(cardStatements, card.id, m)?.dueDate ?? "");
    setStatementError(null);
  };

  const handleDueDateBlur = () => {
    const base = currentStatement ?? { id: crypto.randomUUID(), cardId: card.id, month: statementMonth };
    if ((base.dueDate ?? "") === dueDate) return;
    onSaveCardStatement({ ...base, dueDate: dueDate || undefined });
  };

  const handleStatementUpload = async (file: File, kind: "pdf" | "excel") => {
    const setBusy = kind === "pdf" ? setUploadingPdf : setUploadingExcel;
    setBusy(true);
    setStatementError(null);
    try {
      const path = await uploadReceipt(file, `stmt-card-${card.id}-${statementMonth}-${kind}`);
      const base = currentStatement ?? { id: crypto.randomUUID(), cardId: card.id, month: statementMonth, dueDate: dueDate || undefined };
      onSaveCardStatement({ ...base, [kind === "pdf" ? "pdfPath" : "excelPath"]: path });
    } catch (err) {
      console.error(err);
      setStatementError("No se pudo subir el archivo. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  const handleStatementView = async (path: string) => {
    setStatementError(null);
    try {
      const url = await getReceiptUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error(err);
      setStatementError("No se pudo abrir el archivo.");
    }
  };

  const handleStatementRemove = (kind: "pdf" | "excel") => {
    if (!currentStatement) return;
    const path = kind === "pdf" ? currentStatement.pdfPath : currentStatement.excelPath;
    if (path) deleteReceipt(path);
    onSaveCardStatement({ ...currentStatement, [kind === "pdf" ? "pdfPath" : "excelPath"]: undefined });
  };

  const purchases = [...installments].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const sortedExpenses = [...expenses].sort((a, b) => b.date.localeCompare(a.date));
  const sortedPayments = [...payments].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Modal title={cardLabel(card, banks)} onClose={onClose}>
      <div className="flex justify-end -mt-2 mb-2">
        <button
          type="button"
          onClick={() => exportCardToExcel(card, banks, installments, expenses, contactEntries, payments, accounts, contacts, familyMembers, users)}
          className="text-xs font-semibold flex items-center gap-1"
          style={{ color: C.usd }}
        >
          <Download size={13} /> Exportar a Excel
        </button>
      </div>
      <div className="rounded-xl p-3 mb-4" style={{ background: C.surface2, border: `1px solid ${C.border}` }}>
        <div className="mb-2">
          <Select aria-label="Período" value={statementMonth} onChange={(e) => handleMonthChange(e.target.value)}>
            {statementMonthOptions.map((m) => (
              <option key={m} value={m}>
                {capitalize(monthLabel(m))}{pendingMonths.includes(m) ? " · pendiente" : ""}
              </option>
            ))}
          </Select>
        </div>
        {card.creditLimitMinor != null && (
          <div className="text-xs font-mono mb-1.5" style={{ color: C.textMuted }}>
            Límite de crédito: <span style={{ color: C.text }}>{formatMoney(card.creditLimitMinor, card.creditLimitCurrency ?? "UYU")}</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono" style={{ color: C.textMuted }}>
          <span>Consumo del período:</span>
          {consumption.UYU === 0 && consumption.USD === 0 ? (
            <span style={{ color: C.textFaint }}>Sin consumo</span>
          ) : (
            <>
              {consumption.UYU !== 0 && <span style={{ color: C.uyu }}>{formatMoney(consumption.UYU, "UYU")}</span>}
              {consumption.USD !== 0 && <span style={{ color: C.usd }}>{formatMoney(consumption.USD, "USD")}</span>}
            </>
          )}
        </div>
        {byHolder.length > 0 && (
          <div className="mt-1.5 pt-1.5 space-y-0.5" style={{ borderTop: `1px solid ${C.border}` }}>
            {byHolder.map(({ label, amounts }) => (
              <div key={label} className="flex items-center gap-x-3 text-[11px] font-mono" style={{ color: C.textFaint }}>
                <span className="min-w-[70px]" style={{ color: C.textMuted }}>{label}:</span>
                {amounts.UYU === 0 && amounts.USD === 0 ? (
                  <span>—</span>
                ) : (
                  <>
                    {amounts.UYU !== 0 && <span style={{ color: C.uyu }}>{formatMoney(amounts.UYU, "UYU")}</span>}
                    {amounts.USD !== 0 && <span style={{ color: C.usd }}>{formatMoney(amounts.USD, "USD")}</span>}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl p-3 mb-4" style={{ background: C.surface2, border: `1px solid ${C.border}` }}>
        <h3 className="text-sm font-semibold mb-2" style={{ color: C.text }}>Estado de cuenta</h3>

        <StatementFileRow
          label="PDF"
          accept=".pdf,application/pdf"
          path={currentStatement?.pdfPath}
          uploading={uploadingPdf}
          onUpload={(f) => handleStatementUpload(f, "pdf")}
          onView={handleStatementView}
          onRemove={() => handleStatementRemove("pdf")}
        />
        <StatementFileRow
          label="Excel"
          accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          path={currentStatement?.excelPath}
          uploading={uploadingExcel}
          onUpload={(f) => handleStatementUpload(f, "excel")}
          onView={handleStatementView}
          onRemove={() => handleStatementRemove("excel")}
        />

        <Field label="Fecha de vencimiento de este período">
          {(id) => (
            <TextInput id={id} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} onBlur={handleDueDateBlur} disabled={!canEdit} />
          )}
        </Field>
        {hasAnyFile && !dueDate && (
          <p className="text-[11px] -mt-2 mb-2" style={{ color: C.negative }}>
            Con el estado de cuenta cargado, no te olvides de completar la fecha de vencimiento.
          </p>
        )}

        {statementError && <p className="text-xs" style={{ color: C.negative }}>{statementError}</p>}
      </div>

      <div className="text-xs font-semibold mb-1.5" style={{ color: C.textMuted }}>Compras en cuotas</div>
      {purchases.length === 0 ? (
        <p className="text-xs mb-2" style={{ color: C.textFaint }}>
          Todavía no tenés compras en cuotas. Para agregar una, usá "Agregar gasto con tarjeta" más abajo y elegí más de 1 cuota.
        </p>
      ) : (
        <div className="space-y-1.5 mb-3">
          {purchases.map((p) => {
            const passed = monthsBetween(p.startMonth, mk);
            const cuotaActual = Math.min(Math.max(passed + 1, 1), p.numInstallments);
            const finished = passed >= p.numInstallments;
            return (
              <div key={p.id} className="flex items-center justify-between text-xs rounded-lg px-2.5 py-2" style={{ background: C.surface2 }}>
                <div>
                  <div style={{ color: C.text }}>{p.category ? `${p.category} · ${p.description}` : p.description}</div>
                  <div style={{ color: C.textFaint }}>
                    {finished ? "Pagada" : `Cuota ${cuotaActual}/${p.numInstallments}`}
                    {cardHolderLabel(card, p.cardExtensionId) && ` · ${cardHolderLabel(card, p.cardExtensionId)}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono" style={{ color: C.textMuted }}>{formatMoney(p.installmentAmountMinor, p.currency)}</span>
                  {canEditMovements && canEditOwnRecord(activeUser, p) && (
                    <>
                      <IconBtn label="Editar cuota" onClick={() => onEditInstallment(p)}><Pencil size={13} /></IconBtn>
                      <IconBtn label="Eliminar cuota" danger onClick={() => onDeleteInstallment(p.id)}><Trash2 size={13} /></IconBtn>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="text-xs font-semibold mb-1.5" style={{ color: C.textMuted }}>Gastos con tarjeta</div>
      {sortedExpenses.length === 0 ? (
        <p className="text-xs mb-2" style={{ color: C.textFaint }}>Todavía no cargaste gastos de pago único con esta tarjeta.</p>
      ) : (
        <div className="space-y-1.5 mb-2">
          {sortedExpenses.map((t) => (
            <div key={t.id} className="flex items-center justify-between text-xs rounded-lg px-2.5 py-2" style={{ background: C.surface2 }}>
              <div className="flex items-center gap-2">
                <ShoppingBag size={13} color={C.textFaint} />
                <div>
                  <div style={{ color: C.text }}>{t.category ?? "Sin categorizar"}{t.note ? ` · ${t.note}` : ""}</div>
                  <div style={{ color: C.textFaint }}>
                    {formatDateDMY(t.date)}
                    {cardHolderLabel(card, t.cardExtensionId) && ` · ${cardHolderLabel(card, t.cardExtensionId)}`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono" style={{ color: C.negative }}>-{formatMoney(t.amountMinor, t.currency)}</span>
                <ReceiptButton paths={receiptPathsOf(t)} />
                {canEditMovements && canEditOwnRecord(activeUser, t) && (
                  <>
                    <IconBtn label="Editar gasto" onClick={() => onEditTransaction(t)}><Pencil size={13} /></IconBtn>
                    <IconBtn label="Eliminar gasto" danger onClick={() => onDeleteTransaction(t.id)}><Trash2 size={13} /></IconBtn>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs font-semibold mb-1.5" style={{ color: C.textMuted }}>Pagos registrados</div>
      {sortedPayments.length === 0 ? (
        <p className="text-xs mb-2" style={{ color: C.textFaint }}>Todavía no registraste pagos de esta tarjeta.</p>
      ) : (
        <div className="space-y-1.5 mb-2">
          {sortedPayments.map((p) => {
            const account = accounts.find((a) => a.id === p.accountId);
            return (
              <div key={p.id} className="flex items-center justify-between text-xs rounded-lg px-2.5 py-2" style={{ background: C.surface2 }}>
                <div className="flex items-center gap-2">
                  <Landmark size={13} color={C.textFaint} />
                  <div>
                    <div style={{ color: C.text }}>{accountLabel(account, banks)}{p.note ? ` · ${p.note}` : ""}</div>
                    <div style={{ color: C.textFaint }}>{formatDateDMY(p.date)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono" style={{ color: C.negative }}>-{formatMoney(p.amountMinor, p.currency)}</span>
                  <ReceiptButton paths={receiptPathsOf(p)} />
                  {canEdit && canEditOwnRecord(activeUser, p) && (
                    <>
                      <IconBtn label="Editar pago" onClick={() => onEditCardPayment(p)}><Pencil size={13} /></IconBtn>
                      <IconBtn label="Eliminar pago" danger onClick={() => onDeleteCardPayment(p.id)}><Trash2 size={13} /></IconBtn>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </Modal>
  );
}

export function CardModal({ initial, banks, users, onSave, onClose }: { initial?: Card; banks: Bank[]; users: AppUser[]; onSave: (c: Card) => void; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [bankId, setBankId] = useState(initial?.bankId ?? banks[0]?.id ?? "");
  const [closingDay, setClosingDay] = useState(String(initial?.closingDay ?? 20));
  const [dueDay, setDueDay] = useState(String(initial?.dueDay ?? 5));
  const [statementReminders, setStatementReminders] = useState(initial?.statementReminders ?? false);
  const [hasExtensions, setHasExtensions] = useState((initial?.extensions?.length ?? 0) > 0);
  const [extensions, setExtensions] = useState<CardExtension[]>(initial?.extensions ?? []);
  const [creditLimit, setCreditLimit] = useState(initial?.creditLimitMinor != null ? String(fromMinor(initial.creditLimitMinor)) : "");
  const [creditLimitCurrency, setCreditLimitCurrency] = useState<Currency>(initial?.creditLimitCurrency ?? "UYU");
  const [error, setError] = useState<string | null>(null);

  const addExtension = () => setExtensions((list) => [...list, { id: crypto.randomUUID(), name: "" }]);
  const updateExtension = (id: string, name: string) => setExtensions((list) => list.map((e) => (e.id === id ? { ...e, name } : e)));
  const updateExtensionUser = (id: string, linkedUserId: string) =>
    setExtensions((list) => list.map((e) => (e.id === id ? { ...e, linkedUserId: linkedUserId || undefined } : e)));
  const removeExtension = (id: string) => setExtensions((list) => list.filter((e) => e.id !== id));

  const handleSave = () => {
    const cd = parseInt(closingDay), dd = parseInt(dueDay);
    if (!name.trim()) return setError("Ingresá un nombre para la tarjeta.");
    if (!bankId) return setError("Elegí el banco emisor de la tarjeta.");
    if (!Number.isInteger(cd) || cd < 1 || cd > 31 || !Number.isInteger(dd) || dd < 1 || dd > 31) {
      return setError("Los días deben estar entre 1 y 31.");
    }
    if (hasExtensions && extensions.some((e) => !e.name.trim())) {
      return setError("Completá el nombre de cada extensión, o quitá la que quedó vacía.");
    }
    // El límite de crédito es opcional: vacío = no cargado. Si se completa, tiene que ser un número válido.
    let creditLimitMinor: number | undefined;
    if (creditLimit.trim()) {
      const parsed = parseAmountInput(creditLimit);
      if (parsed === null || parsed <= 0) return setError("El límite de crédito tiene que ser un número mayor a cero (o dejalo vacío).");
      creditLimitMinor = parsed;
    }
    // Si se prende el recordatorio (y antes estaba apagado), empieza a contar desde el mes
    // actual: no reclama retroactivamente estados de cuenta de antes de haberlo activado.
    const wasOn = initial?.statementReminders ?? false;
    const statementRemindersSince = statementReminders
      ? initial?.statementRemindersSince && wasOn
        ? initial.statementRemindersSince
        : currentMonthKey()
      : initial?.statementRemindersSince;
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      bankId,
      closingDay: cd,
      dueDay: dd,
      statementReminders,
      statementRemindersSince,
      extensions: hasExtensions ? extensions.map((e) => ({ ...e, name: e.name.trim() })) : [],
      creditLimitMinor,
      creditLimitCurrency: creditLimitMinor != null ? creditLimitCurrency : undefined,
    });
  };

  return (
    <Modal title={initial ? "Editar tarjeta" : "Nueva tarjeta"} onClose={onClose}>
      <Field label="Nombre">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Visa, Santander..." />}</Field>
      <Field label="Banco">
        {(id) => (
          <Select id={id} value={bankId} onChange={(e) => setBankId(e.target.value)}>
            {banks.length === 0 && <option value="">Agregá un banco primero</option>}
            {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Día de cierre">{(id) => <TextInput id={id} type="text" inputMode="numeric" min={1} max={31} value={closingDay} onChange={(e) => setClosingDay(e.target.value)} />}</Field>
        <Field label="Día de vencimiento">{(id) => <TextInput id={id} type="text" inputMode="numeric" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} />}</Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Límite de crédito (opcional)">
          {(id) => <TextInput id={id} type="text" inputMode="decimal" min="0" step="0.01" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="Sin cargar" />}
        </Field>
        <Field label="Moneda del límite">
          {() => <Segment value={creditLimitCurrency} onChange={setCreditLimitCurrency} options={[{ value: "UYU", label: "UYU" }, { value: "USD", label: "USD" }]} />}
        </Field>
      </div>
      <p className="text-xs -mt-2 mb-3" style={{ color: C.textFaint }}>
        Es solo un dato informativo: no bloquea gastos ni se usa para ningún cálculo.
      </p>
      <Field label="Recordatorio de estado de cuenta">
        {() => (
          <Segment
            value={statementReminders ? "on" : "off"}
            onChange={(v) => setStatementReminders(v === "on")}
            options={[{ value: "off", label: "No" }, { value: "on", label: "Sí, avisame" }]}
          />
        )}
      </Field>
      <p className="text-xs -mt-2 mb-3" style={{ color: C.textFaint }}>
        Con esto activado, cada mes que cierre te avisamos en Tarjetas hasta que subas el PDF y el Excel del estado de cuenta de esta tarjeta.
      </p>

      <Field label="¿Tiene extensiones?">
        {() => (
          <Segment
            value={hasExtensions ? "on" : "off"}
            onChange={(v) => setHasExtensions(v === "on")}
            options={[{ value: "off", label: "No" }, { value: "on", label: "Sí" }]}
          />
        )}
      </Field>
      {hasExtensions && (
        <div className="mb-3">
          {extensions.map((ext) => (
            <div key={ext.id} className="mb-2">
              <div className="flex items-center gap-2 mb-1">
                <TextInput
                  value={ext.name}
                  onChange={(e) => updateExtension(ext.id, e.target.value)}
                  placeholder="Nombre (ej. Luli)"
                  autoFocus
                />
                <button type="button" onClick={() => removeExtension(ext.id)} aria-label="Quitar extensión" className="shrink-0" style={{ color: C.negative }}>
                  <X size={16} />
                </button>
              </div>
              {users.length > 0 && (
                <Select
                  aria-label={`Perfil vinculado a la extensión ${ext.name || ""}`.trim()}
                  value={ext.linkedUserId ?? ""}
                  onChange={(e) => updateExtensionUser(ext.id, e.target.value)}
                >
                  <option value="">Sin vincular a un perfil</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addExtension}
            className="text-xs font-semibold flex items-center gap-1"
            style={{ color: C.usd }}
          >
            <Plus size={13} /> Agregar titular adicional
          </button>
          <p className="text-xs mt-1.5" style={{ color: C.textFaint }}>
            Al cargar un gasto con esta tarjeta vas a poder elegir si lo pagaste vos o esta persona. Si vinculás la extensión a un perfil, cuando ese perfil esté activo y elija esta tarjeta en Nuevo Movimiento va a quedar preseleccionada en vez de "Titular".
          </p>
        </div>
      )}

      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>
    </Modal>
  );
}

export function CardPaymentModal({
  cardId,
  initial,
  cards,
  accounts,
  banks,
  installments,
  onSave,
  onRecordTiming,
  onClose,
}: {
  cardId: string;
  initial?: CardPayment;
  cards: Card[];
  accounts: Account[];
  banks: Bank[];
  installments: Installment[];
  onSave: (p: CardPayment) => void;
  /** Ver `MovementTimingEntry` y Configuración → Estadísticas: cuánto tardó desde que se abrió este modal hasta guardar. */
  onRecordTiming?: (entry: { action: "create" | "edit"; kind: "pagoTarjeta"; entityId: string; seconds: number }) => void;
  onClose: () => void;
}) {
  const [movementId] = useState(() => initial?.id ?? crypto.randomUUID());
  // Momento en que se abrió este modal (nuevo o "Editar"), para medir cuánto
  // tardó hasta guardar (ver `onRecordTiming` y Configuración → Estadísticas).
  const openedAtRef = useRef(Date.now());
  const [selectedCardId, setSelectedCardId] = useState(initial?.cardId ?? cardId);
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? "UYU");
  const [accountId, setAccountId] = useState(initial?.accountId ?? "");
  const [amount, setAmount] = useState(initial ? String(fromMinor(initial.amountMinor)) : "");
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [note, setNote] = useState(initial?.note ?? "");
  const [receiptPaths, setReceiptPaths] = useState<string[]>(receiptPathsOf(initial));
  const [error, setError] = useState<string | null>(null);

  const eligibleAccounts = accounts.filter((a) => a.currency === currency && (isAccountActive(a) || a.id === accountId));
  const dueThisMonth = dueForCardInMonth(selectedCardId, installments, currentMonthKey());
  const card = cards.find((c) => c.id === selectedCardId);

  const handleSave = () => {
    if (!card) return setError("Elegí una tarjeta.");
    const amountMinor = parseAmountInput(amount);
    if (amountMinor === null || amountMinor === 0) return setError("Ingresá un monto válido, mayor a cero.");
    if (!accountId) return setError("Elegí desde qué cuenta se paga.");
    if (!date) return setError("Elegí una fecha.");

    onSave({
      id: movementId,
      cardId: selectedCardId,
      accountId,
      date,
      amountMinor,
      currency,
      note: note.trim() || undefined,
      receiptPaths,
      createdByUserId: initial?.createdByUserId,
    });
    onRecordTiming?.({
      action: initial ? "edit" : "create",
      kind: "pagoTarjeta",
      entityId: movementId,
      seconds: Math.max(0, Math.round((Date.now() - openedAtRef.current) / 1000)),
    });
  };

  return (
    <Modal title={initial ? "Editar pago de tarjeta" : "Registrar pago de tarjeta"} onClose={onClose}>
      <Field label="Tarjeta">
        {(id) => (
          <Select id={id} value={selectedCardId} onChange={(e) => setSelectedCardId(e.target.value)}>
            {cards.map((c) => <option key={c.id} value={c.id}>{cardLabel(c, banks)}</option>)}
          </Select>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monto">
          {(id) => <TextInput id={id} type="text" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />}
        </Field>
        <Field label="Moneda">
          {() => <Segment value={currency} onChange={(v) => { setCurrency(v); setAccountId(""); }} options={[{ value: "UYU", label: "UYU" }, { value: "USD", label: "USD" }]} />}
        </Field>
      </div>

      {(dueThisMonth.UYU > 0 || dueThisMonth.USD > 0) && (
        <p className="text-xs mb-3" style={{ color: C.textMuted }}>
          Vencimiento de {card ? cardLabel(card, banks) : "esta tarjeta"} este mes: {dueThisMonth.UYU > 0 && <span className="font-mono">{formatMoney(dueThisMonth.UYU, "UYU")}</span>}
          {dueThisMonth.UYU > 0 && dueThisMonth.USD > 0 && " · "}
          {dueThisMonth.USD > 0 && <span className="font-mono">{formatMoney(dueThisMonth.USD, "USD")}</span>}
        </p>
      )}

      <Field label="Cuenta de origen">
        {(id) =>
          eligibleAccounts.length === 0 ? (
            <p className="text-xs" style={{ color: C.textFaint }}>No tenés cajas en {currency}. Creá una en Cuentas.</p>
          ) : (
            <Select id={id} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Elegí una cuenta</option>
              {eligibleAccounts.map((a) => <option key={a.id} value={a.id}>{accountSelectLabel(a, banks)}</option>)}
            </Select>
          )
        }
      </Field>
      <Field label="Fecha">
        {(id) => <TextInput id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
      </Field>
      <Field label="Nota (opcional)">
        {(id) => <TextInput id={id} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Pago mínimo, pago total..." />}
      </Field>
      <ReceiptField movementId={movementId} paths={receiptPaths} onChange={setReceiptPaths} />
      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>
    </Modal>
  );
}
