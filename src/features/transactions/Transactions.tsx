import { useState, Fragment } from "react";
import { ArrowUpRight, ArrowDownRight, ArrowRightLeft, Pencil, Trash2, CreditCard as CreditCardIcon, Search, X } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Modal, Field, TextInput, Select, Segment, PrimaryButton, IconBtn, CurrencyPill } from "../../components/ui";
import { ReceiptField, ReceiptButton } from "../../components/ReceiptField";
import { formatMoney, parseAmountInput, fromMinor } from "../../lib/money";
import { monthKeyOf, todayISO, monthLabel, capitalize, formatDateDMY } from "../../lib/dates";
import { accountLabel } from "../../lib/accounts";
import type { Transaction, Currency, TransactionType, Account, Bank, Category, Transfer, CardPayment, Card } from "../../types";

type LedgerItem =
  | { kind: "transaction"; date: string; data: Transaction }
  | { kind: "transfer"; date: string; data: Transfer }
  | { kind: "cardPayment"; date: string; data: CardPayment };

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
  cards,
  accounts,
  banks,
  canEdit,
  onEdit,
  onDelete,
  onEditTransfer,
  onDeleteTransfer,
  onEditCardPayment,
  onDeleteCardPayment,
}: {
  transactions: Transaction[];
  transfers: Transfer[];
  cardPayments: CardPayment[];
  cards: Card[];
  accounts: Account[];
  banks: Bank[];
  canEdit: boolean;
  onEdit: (t: Transaction) => void;
  onDelete: (id: string) => void;
  onEditTransfer: (t: Transfer) => void;
  onDeleteTransfer: (id: string) => void;
  onEditCardPayment: (p: CardPayment) => void;
  onDeleteCardPayment: (id: string) => void;
}) {
  const [filterMonth, setFilterMonth] = useState<string>("all");
  const [search, setSearch] = useState("");

  const allItems: LedgerItem[] = [
    ...transactions.map((t): LedgerItem => ({ kind: "transaction", date: t.date, data: t })),
    ...transfers.map((t): LedgerItem => ({ kind: "transfer", date: t.date, data: t })),
    ...cardPayments.map((p): LedgerItem => ({ kind: "cardPayment", date: p.date, data: p })),
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
                    <div className="text-xs" style={{ color: C.textFaint }}>
                      {formatDateDMY(t.date)}
                      {t.accountId && ` · ${accountLabel(accounts.find((a) => a.id === t.accountId), banks)}`}
                      {t.cardId && ` · ${cards.find((c) => c.id === t.cardId)?.name ?? "tarjeta eliminada"}`}
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
                  <ReceiptButton path={t.receiptPath} />
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
                    <div className="text-xs" style={{ color: C.textFaint }}>{formatDateDMY(tr.date)} · Transferencia</div>
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
                  <ReceiptButton path={tr.receiptPath} />
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
                  <div className="text-xs" style={{ color: C.textFaint }}>{formatDateDMY(p.date)}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="font-mono text-sm" style={{ color: C.negative }}>-{formatMoney(p.amountMinor, p.currency)}</div>
                  <CurrencyPill currency={p.currency} />
                </div>
                <ReceiptButton path={p.receiptPath} />
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
  // comprobante
  receiptPath: string | undefined;
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
  presetCardId,
  accounts,
  banks,
  cards,
  categories,
  onSaveTransaction,
  onSaveTransfer,
  onClose,
}: {
  /** Editar un gasto/ingreso existente. */
  initial?: Transaction;
  /** Editar una transferencia existente. */
  initialTransfer?: Transfer;
  /** Si se abre el modal para cargar un gasto desde una tarjeta puntual (ej. desde Tarjetas), la precarga como medio de pago. */
  presetCardId?: string;
  accounts: Account[];
  banks: Bank[];
  cards: Card[];
  categories: Category[];
  onSaveTransaction: (t: Transaction) => void;
  onSaveTransfer: (t: Transfer) => void;
  onClose: () => void;
}) {
  const catsFor = (type: TransactionType) => categories.filter((c) => c.type === type);
  const isEditingTransaction = !!initial;
  const isEditingTransfer = !!initialTransfer;
  // Estable durante toda la vida del modal, aunque el movimiento sea nuevo: sirve como prefijo
  // del archivo del comprobante en Storage y después se usa como id real al guardar.
  const [movementId] = useState(() => initial?.id ?? initialTransfer?.id ?? crypto.randomUUID());

  const [form, setForm] = useState<FormState>(() => ({
    kind: initialTransfer ? "transferencia" : initial ? initial.type : "gasto",
    amount: initial ? String(fromMinor(initial.amountMinor)) : "",
    currency: initial ? initial.currency : "UYU",
    category: initial ? initial.category : catsFor("gasto")[0]?.name ?? "",
    date: initialTransfer ? initialTransfer.date : initial ? initial.date : todayISO(),
    note: initialTransfer ? initialTransfer.note ?? "" : initial ? initial.note ?? "" : "",
    accountId: initial?.accountId ?? "",
    paymentMethod: initial?.cardId ? "tarjeta" : initial?.accountId ? "cuenta" : presetCardId ? "tarjeta" : "ninguno",
    cardId: initial?.cardId ?? presetCardId ?? "",
    fromAccountId: initialTransfer ? initialTransfer.fromAccountId : accounts[0]?.id ?? "",
    toAccountId: initialTransfer ? initialTransfer.toAccountId : accounts[1]?.id ?? accounts[0]?.id ?? "",
    fromAmount: initialTransfer ? String(fromMinor(initialTransfer.fromAmountMinor)) : "",
    toAmount: initialTransfer ? String(fromMinor(initialTransfer.toAmountMinor)) : "",
    exchangeRate: initialTransfer?.exchangeRate ? String(initialTransfer.exchangeRate) : "",
    receiptPath: initialTransfer?.receiptPath ?? initial?.receiptPath,
  }));
  const [error, setError] = useState<string | null>(null);
  const cats = form.kind === "transferencia" ? [] : catsFor(form.kind);
  const eligibleAccounts = accounts.filter((a) => a.currency === form.currency);

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
        receiptPath: form.receiptPath,
      });
      return;
    }

    const amountMinor = parseAmountInput(form.amount);
    if (amountMinor === null || amountMinor === 0) return setError("Ingresá un monto válido, mayor a cero.");
    if (!form.date) return setError("Elegí una fecha.");
    if (!form.category) return setError("Elegí una categoría (o creá una nueva en Configuración).");
    if (form.kind === "gasto" && form.paymentMethod === "tarjeta" && !form.cardId) return setError("Elegí una tarjeta.");

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
      receiptPath: form.receiptPath,
    });
  };

  const kindOptions =
    presetCardId || isEditingTransaction
      ? [{ value: "gasto" as const, label: "Gasto" }, { value: "ingreso" as const, label: "Ingreso" }]
      : [{ value: "gasto" as const, label: "Gasto" }, { value: "ingreso" as const, label: "Ingreso" }, { value: "transferencia" as const, label: "Transferencia" }];

  const title = isEditingTransfer ? "Editar transferencia" : isEditingTransaction ? "Editar movimiento" : presetCardId ? "Nuevo gasto con tarjeta" : "Nuevo movimiento";

  return (
    <Modal title={title} onClose={onClose}>
      {!isEditingTransfer && (
        <Field label="Tipo">
          {() => (
            <Segment
              value={form.kind}
              onChange={(v) => setForm((f) => ({ ...f, kind: v, category: v === "transferencia" ? f.category : catsFor(v)[0]?.name ?? "" }))}
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
                  {accounts.map((a) => <option key={a.id} value={a.id}>{accountLabel(a, banks)} ({a.currency})</option>)}
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
                  {accounts.map((a) => <option key={a.id} value={a.id}>{accountLabel(a, banks)} ({a.currency})</option>)}
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
                <Field label={`Cotización (1 USD = ? UYU)`}>
                  {(id) => (
                    <TextInput
                      id={id}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={form.exchangeRate}
                      onChange={(e) => setForm((f) => ({ ...f, exchangeRate: e.target.value, toAmount: applyRate(f.fromAmount, e.target.value) }))}
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
          <Field label="Categoría">
            {(id) =>
              cats.length === 0 ? (
                <p className="text-xs" style={{ color: C.textFaint }}>
                  No hay categorías de {form.kind === "ingreso" ? "ingreso" : "gasto"}. Creá una en Configuración → Categorías.
                </p>
              ) : (
                <Select id={id} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                  {cats.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </Select>
              )
            }
          </Field>
          <Field label="Fecha">
            {(id) => <TextInput id={id} type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />}
          </Field>
          <Field label="Nota (opcional)">
            {(id) => <TextInput id={id} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Detalle..." />}
          </Field>

          {form.kind === "ingreso" ? (
            <Field label="Cuenta (opcional)">
              {(id) => (
                <Select id={id} value={form.accountId} onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}>
                  <option value="">Sin cuenta asignada</option>
                  {eligibleAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{accountLabel(a, banks)}</option>
                  ))}
                </Select>
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
                      <Select id={id} value={form.accountId} onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}>
                        <option value="">Elegí una cuenta</option>
                        {eligibleAccounts.map((a) => (
                          <option key={a.id} value={a.id}>{accountLabel(a, banks)}</option>
                        ))}
                      </Select>
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
                      <Select id={id} value={form.cardId} onChange={(e) => setForm((f) => ({ ...f, cardId: e.target.value }))}>
                        <option value="">Elegí una tarjeta</option>
                        {cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </Select>
                    )
                  }
                </Field>
              )}
            </>
          )}
        </>
      )}

      <ReceiptField movementId={movementId} path={form.receiptPath} onChange={(p) => setForm((f) => ({ ...f, receiptPath: p }))} />

      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>
    </Modal>
  );
}
