import { useState, useEffect, Fragment } from "react";
import { ArrowUpRight, ArrowDownRight, ArrowRightLeft, Pencil, Trash2, CreditCard as CreditCardIcon, Search, X } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Modal, Field, TextInput, Select, Combobox, Segment, PrimaryButton, IconBtn, CurrencyPill } from "../../components/ui";
import { ReceiptField, ReceiptButton } from "../../components/ReceiptField";
import { receiptPathsOf } from "../../lib/receipts";
import { CategoryPicker, defaultLeafCategoryValue } from "../../components/CategoryPicker";
import { categoryFullPath } from "../../lib/categories";
import { CategoryModal } from "../settings/Categories";
import { formatMoney, parseAmountInput, fromMinor } from "../../lib/money";
import { monthKeyOf, todayISO, monthLabel, capitalize, formatDateDMY } from "../../lib/dates";
import { accountLabel, accountSelectLabel, isAccountActive } from "../../lib/accounts";
import { fetchRateForDate } from "../../lib/exchangeRates";
import { UserBadge } from "../../components/UserBadge";
import type { Transaction, Currency, Account, Bank, Category, Transfer, CardPayment, Card, Installment, AppUser } from "../../types";

type LedgerItem =
  | { kind: "transaction"; date: string; data: Transaction }
  | { kind: "transfer"; date: string; data: Transfer }
  | { kind: "cardPayment"; date: string; data: CardPayment }
  | { kind: "installment"; date: string; data: Installment };

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
function itemSearchText(item: LedgerItem, accounts: Account[], banks: Bank[], cards: Card[]): string {
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
    ].filter((x): x is string => !!x).join(" ");
  }
  if (item.kind === "transaction") {
    const t = item.data;
    const acc = accounts.find((a) => a.id === t.accountId);
    const card = cards.find((c) => c.id === t.cardId);
    return [
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
  cards,
  accounts,
  banks,
  users,
  canEdit,
  onEdit,
  onDelete,
  onEditTransfer,
  onDeleteTransfer,
  onEditCardPayment,
  onDeleteCardPayment,
  onEditInstallment,
  onDeleteInstallment,
}: {
  transactions: Transaction[];
  transfers: Transfer[];
  cardPayments: CardPayment[];
  installments: Installment[];
  cards: Card[];
  accounts: Account[];
  banks: Bank[];
  /** Para mostrar de quién es cada movimiento (solo tiene sentido mostrarlo si hay más de un perfil). */
  users: AppUser[];
  canEdit: boolean;
  onEdit: (t: Transaction) => void;
  onDelete: (id: string) => void;
  onEditTransfer: (t: Transfer) => void;
  onDeleteTransfer: (id: string) => void;
  onEditCardPayment: (p: CardPayment) => void;
  onDeleteCardPayment: (id: string) => void;
  onEditInstallment: (i: Installment) => void;
  onDeleteInstallment: (id: string) => void;
}) {
  const [filterMonth, setFilterMonth] = useState<string>("all");
  const [search, setSearch] = useState("");
  // Solo tiene sentido marcar de quién es cada movimiento si hay más de un perfil cargando datos.
  const showAuthor = users.length > 1;

  const allItems: LedgerItem[] = [
    ...transactions.map((t): LedgerItem => ({ kind: "transaction", date: t.date, data: t })),
    ...transfers.map((t): LedgerItem => ({ kind: "transfer", date: t.date, data: t })),
    ...cardPayments.map((p): LedgerItem => ({ kind: "cardPayment", date: p.date, data: p })),
    ...installments.map((i): LedgerItem => ({ kind: "installment", date: i.date ?? `${i.startMonth}-01`, data: i })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const availableMonths = Array.from(new Set(allItems.map((item) => monthKeyOf(item.date)))).sort((a, b) => b.localeCompare(a));

  const byMonth = filterMonth === "all" ? allItems : allItems.filter((item) => monthKeyOf(item.date) === filterMonth);

  const searchNorm = normalizeText(search.trim());
  const items =
    searchNorm === ""
      ? byMonth
      : byMonth.filter((item) => normalizeText(itemSearchText(item, accounts, banks, cards)).includes(searchNorm));

  return (
    <div className="pb-24">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h1 className="text-2xl font-display" style={{ color: C.text }}>Movimientos</h1>
        <div className="w-40">
          <Select aria-label="Filtrar por período" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
            <option value="all">Todos los períodos</option>
            {availableMonths.map((mk) => (
              <option key={mk} value={mk}>{capitalize(monthLabel(mk))}</option>
            ))}
          </Select>
        </div>
      </div>

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
          {search.trim() ? `Sin resultados para "${search.trim()}".` : filterMonth === "all" ? "Todavía no registraste movimientos." : "Sin movimientos en este período."}
        </div>
      )}

      <div className="space-y-2">
        {(() => {
          let lastMonth: string | null = null;
          return items.map((item) => {
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
                    <div className="text-sm" style={{ color: C.text }}>{t.category}{t.note ? ` · ${t.note}` : ""}</div>
                    <div className="text-xs flex items-center gap-1.5" style={{ color: C.textFaint }}>
                      <span>
                        {formatDateDMY(t.date)}
                        {t.accountId && ` · ${accountLabel(accounts.find((a) => a.id === t.accountId), banks)}`}
                        {t.cardId && ` · ${cards.find((c) => c.id === t.cardId)?.name ?? "tarjeta eliminada"}`}
                      </span>
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
                  {canEdit && (
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
                  {canEdit && (
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
            const title = inst.category ? `${inst.category} · ${inst.description}` : inst.description;
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
                        {card && ` · ${card.name}`}
                        {` · ${inst.numInstallments} cuota${inst.numInstallments > 1 ? "s" : ""}`}
                      </span>
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
                  {canEdit && (
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
                    Pago tarjeta {card?.name ?? "eliminada"} · {accountLabel(account, banks)}
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
                {canEdit && (
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
    </div>
  );
}

type PaymentMethod = "ninguno" | "cuenta" | "tarjeta";
type MovementKind = "gasto" | "ingreso" | "transferencia";

interface FormState {
  kind: MovementKind;
  // campos de gasto/ingreso
  amount: string;
  currency: Currency;
  category: string;
  date: string;
  note: string;
  accountId: string; // "" significa sin cuenta asignada
  paymentMethod: PaymentMethod; // solo aplica a gastos
  cardId: string; // "" significa sin tarjeta elegida
  // campos de transferencia
  fromAccountId: string;
  toAccountId: string;
  fromAmount: string;
  toAmount: string;
  exchangeRate: string;
  // cuotas (solo gasto con tarjeta)
  numInstallments: string;
  // comprobantes
  receiptPaths: string[];
}

/**
 * Modal único para cargar cualquier movimiento: gasto, ingreso o
 * transferencia entre cuentas propias. Unifica lo que antes eran dos modales
 * separados (TransactionModal + TransferModal) para que el usuario elija el
 * tipo desde un mismo lugar, como una entrada más del libro diario.
 */
export function MovementModal({
  initial,
  initialTransfer,
  initialInstallment,
  presetCardId,
  accounts,
  banks,
  cards,
  categories,
  onSaveTransaction,
  onSaveTransfer,
  onSaveInstallment,
  onSaveCategory,
  onClose,
}: {
  /** Editar un gasto/ingreso existente. */
  initial?: Transaction;
  /** Editar una transferencia existente. */
  initialTransfer?: Transfer;
  /** Editar una compra en cuotas existente. */
  initialInstallment?: Installment;
  /** Si se abre el modal para cargar un gasto desde una tarjeta puntual (ej. desde Tarjetas), la precarga como medio de pago. */
  presetCardId?: string;
  accounts: Account[];
  banks: Bank[];
  cards: Card[];
  categories: Category[];
  onSaveTransaction: (t: Transaction) => void;
  onSaveTransfer: (t: Transfer) => void;
  /** Crear una categoría nueva (en cualquier nivel) sin salir del modal de movimiento. */
  onSaveCategory: (c: Category) => void;
  onSaveInstallment: (i: Installment) => void;
  onClose: () => void;
}) {
  const isEditingTransaction = !!initial;
  const isEditingTransfer = !!initialTransfer;
  const isEditingInstallment = !!initialInstallment;
  // Estable durante toda la vida del modal, aunque el movimiento sea nuevo: sirve como prefijo
  // del archivo del comprobante en Storage y después se usa como id real al guardar.
  const [movementId] = useState(() => initial?.id ?? initialTransfer?.id ?? initialInstallment?.id ?? crypto.randomUUID());

  const [form, setForm] = useState<FormState>(() => ({
    kind: initialTransfer ? "transferencia" : initial ? initial.type : "gasto",
    amount: initialInstallment ? String(fromMinor(initialInstallment.totalAmountMinor)) : initial ? String(fromMinor(initial.amountMinor)) : "",
    currency: initialInstallment ? initialInstallment.currency : initial ? initial.currency : "UYU",
    category: initialInstallment ? initialInstallment.category ?? initialInstallment.description : initial ? initial.category : defaultLeafCategoryValue(categories, "gasto"),
    date: initialTransfer ? initialTransfer.date : initial ? initial.date : initialInstallment ? initialInstallment.date ?? `${initialInstallment.startMonth}-01` : todayISO(),
    note: initialTransfer ? initialTransfer.note ?? "" : initial ? initial.note ?? "" : initialInstallment ? initialInstallment.note ?? "" : "",
    accountId: initial?.accountId ?? "",
    paymentMethod: initialInstallment ? "tarjeta" : initial?.cardId ? "tarjeta" : initial?.accountId ? "cuenta" : presetCardId ? "tarjeta" : "ninguno",
    cardId: initialInstallment?.cardId ?? initial?.cardId ?? presetCardId ?? "",
    fromAccountId: initialTransfer ? initialTransfer.fromAccountId : accounts[0]?.id ?? "",
    toAccountId: initialTransfer ? initialTransfer.toAccountId : accounts[1]?.id ?? accounts[0]?.id ?? "",
    fromAmount: initialTransfer ? String(fromMinor(initialTransfer.fromAmountMinor)) : "",
    toAmount: initialTransfer ? String(fromMinor(initialTransfer.toAmountMinor)) : "",
    exchangeRate: initialTransfer?.exchangeRate ? String(initialTransfer.exchangeRate) : "",
    numInstallments: initialInstallment ? String(initialInstallment.numInstallments) : "1",
    receiptPaths: receiptPathsOf(initialTransfer ?? initial ?? initialInstallment),
  }));
  const [error, setError] = useState<string | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  // Las cajas inactivas (Configuración → Bancos) no se ofrecen para movimientos nuevos, pero
  // si el movimiento ya tenía una asignada (edición), se mantiene disponible para no romperlo.
  const eligibleAccounts = accounts.filter((a) => a.currency === form.currency && (isAccountActive(a) || a.id === form.accountId));
  const transferAccountOptions = (selectedId: string) => accounts.filter((a) => isAccountActive(a) || a.id === selectedId);

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
    if (form.kind !== "transferencia" || !needsRate || !rateAutoSuggested) return;
    let cancelado = false;
    fetchRateForDate("USD", form.date).then((row) => {
      if (cancelado || !row) return;
      setForm((f) => ({ ...f, exchangeRate: String(row.sell), toAmount: applyRate(f.fromAmount, String(row.sell)) }));
    });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.kind, needsRate, form.date, rateAutoSuggested]);

  const handleSave = () => {
    if (form.kind === "transferencia") {
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

    const amountMinor = parseAmountInput(form.amount);
    if (amountMinor === null || amountMinor === 0) return setError("Ingresá un monto válido, mayor a cero.");
    if (!form.date) return setError("Elegí una fecha.");
    if (!form.category) return setError("Elegí una categoría (o creá una nueva en Configuración).");
    if (form.kind === "gasto" && form.paymentMethod === "tarjeta" && !form.cardId) return setError("Elegí una tarjeta.");

    if (showInstallmentsField) {
      const numCuotas = Math.max(1, parseInt(form.numInstallments) || 1);
      if (isEditingInstallment || numCuotas > 1) {
        onSaveInstallment({
          id: movementId,
          cardId: form.cardId,
          description: form.category,
          category: form.category,
          note: form.note.trim() || undefined,
          currency: form.currency,
          totalAmountMinor: amountMinor,
          numInstallments: numCuotas,
          startMonth: form.date.slice(0, 7),
          installmentAmountMinor: Math.round(amountMinor / numCuotas),
          date: form.date,
          receiptPaths: form.receiptPaths,
          createdByUserId: initialInstallment?.createdByUserId,
        });
        return;
      }
    }

    onSaveTransaction({
      id: movementId,
      type: form.kind,
      amountMinor,
      currency: form.currency,
      category: form.category,
      date: form.date,
      note: form.note.trim() || undefined,
      accountId: form.kind === "ingreso" ? form.accountId || undefined : form.paymentMethod === "cuenta" ? form.accountId || undefined : undefined,
      cardId: form.kind === "gasto" && form.paymentMethod === "tarjeta" ? form.cardId || undefined : undefined,
      receiptPaths: form.receiptPaths,
      createdByUserId: initial?.createdByUserId,
    });
  };

  // La cantidad de cuotas solo se puede elegir al pagar un gasto con tarjeta, y no al
  // editar un gasto de pago único ya cargado (para eso conviene cargar un movimiento nuevo).
  const showInstallmentsField = form.kind === "gasto" && form.paymentMethod === "tarjeta" && !isEditingTransaction;

  const kindOptions =
    presetCardId || isEditingTransaction || isEditingInstallment
      ? [{ value: "gasto" as const, label: "Gasto" }, { value: "ingreso" as const, label: "Ingreso" }]
      : [{ value: "gasto" as const, label: "Gasto" }, { value: "ingreso" as const, label: "Ingreso" }, { value: "transferencia" as const, label: "Transferencia" }];

  const title = isEditingTransfer
    ? "Editar transferencia"
    : isEditingTransaction || isEditingInstallment
    ? "Editar movimiento"
    : presetCardId
    ? "Nuevo gasto con tarjeta"
    : "Nuevo movimiento";

  return (
    <Modal title={title} onClose={onClose}>
      {!isEditingTransfer && (
        <Field label="Tipo">
          {() => (
            <Segment
              value={form.kind}
              onChange={(v) => setForm((f) => ({ ...f, kind: v, category: v === "transferencia" ? f.category : defaultLeafCategoryValue(categories, v) }))}
              options={kindOptions}
            />
          )}
        </Field>
      )}

      {form.kind === "transferencia" ? (
        accounts.length < 2 ? (
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
                  type="number"
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
                      type="number"
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
                      type="number"
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
        )
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monto">
              {(id) => <TextInput id={id} type="number" inputMode="decimal" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0" />}
            </Field>
            <Field label="Moneda">
              {() => <Segment value={form.currency} onChange={(v) => setForm((f) => ({ ...f, currency: v }))} options={[{ value: "UYU", label: "UYU" }, { value: "USD", label: "USD" }]} />}
            </Field>
          </div>
          <CategoryPicker
            categories={categories}
            type={form.kind === "ingreso" ? "ingreso" : "gasto"}
            value={form.category}
            onChange={(name) => setForm((f) => ({ ...f, category: name }))}
          />
          <div className="flex justify-end -mt-1 mb-3">
            <button type="button" onClick={() => setShowCategoryModal(true)} className="text-xs font-semibold" style={{ color: C.usd }}>
              + Nueva categoría
            </button>
          </div>
          <Field label="Fecha">
            {(id) => <TextInput id={id} type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />}
          </Field>
          <Field label="Nota (opcional)">
            {(id) => <TextInput id={id} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Detalle..." />}
          </Field>

          {form.kind === "ingreso" ? (
            <Field label="Cuenta (opcional)">
              {(id) => (
                <Combobox
                  id={id}
                  value={form.accountId}
                  placeholder={form.accountId ? undefined : "Sin cuenta asignada"}
                  onChange={(accountId) => setForm((f) => ({ ...f, accountId }))}
                  options={eligibleAccounts.map((a) => ({ value: a.id, label: accountSelectLabel(a, banks) }))}
                />
              )}
            </Field>
          ) : (
            <>
              <Field label="Medio de pago">
                {() => (
                  <Segment
                    value={form.paymentMethod}
                    onChange={(v) => setForm((f) => ({ ...f, paymentMethod: v, accountId: "", cardId: "" }))}
                    options={[
                      { value: "ninguno", label: "Sin asignar" },
                      { value: "cuenta", label: "Cuenta" },
                      { value: "tarjeta", label: "Tarjeta" },
                    ]}
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
                        onChange={(cardId) => setForm((f) => ({ ...f, cardId }))}
                        options={cards.map((c) => ({ value: c.id, label: c.name }))}
                      />
                    )
                  }
                </Field>
              )}
              {showInstallmentsField && (
                <>
                  <Field label="Cantidad de cuotas">
                    {(id) => (
                      <TextInput
                        id={id}
                        type="number"
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
            </>
          )}
        </>
      )}

      <ReceiptField movementId={movementId} paths={form.receiptPaths} onChange={(paths) => setForm((f) => ({ ...f, receiptPaths: paths }))} />

      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>

      {showCategoryModal && (
        <CategoryModal
          categories={categories}
          defaultType={form.kind === "ingreso" ? "ingreso" : "gasto"}
          onSave={(c) => {
            onSaveCategory(c);
            setForm((f) => ({ ...f, category: categoryFullPath(c, [...categories, c]) }));
            setShowCategoryModal(false);
          }}
          onClose={() => setShowCategoryModal(false)}
        />
      )}
    </Modal>
  );
}
