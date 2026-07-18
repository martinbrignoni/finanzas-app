import { useState } from "react";
import { ArrowUpRight, ArrowDownRight, ArrowRightLeft, Pencil, Trash2, Repeat } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Modal, Field, TextInput, Select, Segment, PrimaryButton, IconBtn, CurrencyPill } from "../../components/ui";
import { formatMoney, parseAmountInput, fromMinor } from "../../lib/money";
import { monthKeyOf, currentMonthKey, todayISO } from "../../lib/dates";
import type { Transaction, Currency, TransactionType, Account, Bank, Category, Transfer } from "../../types";

function accountLabel(account: Account | undefined, banks: Bank[]): string {
  if (!account) return "cuenta eliminada";
  const bank = banks.find((b) => b.id === account.bankId);
  return bank ? `${bank.name} · ${account.name}` : account.name;
}

type LedgerItem =
  | { kind: "transaction"; date: string; data: Transaction }
  | { kind: "transfer"; date: string; data: Transfer };

export function Transactions({
  transactions,
  transfers,
  accounts,
  banks,
  canEdit,
  onEdit,
  onDelete,
  onAddTransfer,
  onEditTransfer,
  onDeleteTransfer,
}: {
  transactions: Transaction[];
  transfers: Transfer[];
  accounts: Account[];
  banks: Bank[];
  canEdit: boolean;
  onEdit: (t: Transaction) => void;
  onDelete: (id: string) => void;
  onAddTransfer: () => void;
  onEditTransfer: (t: Transfer) => void;
  onDeleteTransfer: (id: string) => void;
}) {
  const [filterMonth, setFilterMonth] = useState(currentMonthKey());

  const items: LedgerItem[] = [
    ...transactions.map((t): LedgerItem => ({ kind: "transaction", date: t.date, data: t })),
    ...transfers.map((t): LedgerItem => ({ kind: "transfer", date: t.date, data: t })),
  ]
    .filter((item) => monthKeyOf(item.date) === filterMonth)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="pb-24">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-display" style={{ color: C.text }}>Movimientos</h1>
        <input
          type="month"
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          aria-label="Filtrar por mes"
          style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 8px", color: C.text }}
        />
      </div>

      {canEdit && accounts.length >= 2 && (
        <button
          onClick={onAddTransfer}
          className="w-full py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 mb-4"
          style={{ border: `1px dashed ${C.borderLight}`, color: C.textMuted }}
        >
          <Repeat size={13} /> Transferir entre cuentas
        </button>
      )}

      {items.length === 0 && (
        <div className="rounded-xl p-6 text-center text-sm" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textMuted }}>
          Sin movimientos este mes.
        </div>
      )}

      <div className="space-y-2">
        {items.map((item) => {
          if (item.kind === "transaction") {
            const t = item.data;
            return (
              <div key={t.id} className="rounded-xl p-3 flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: t.type === "ingreso" ? "rgba(111,191,139,0.15)" : "rgba(217,119,106,0.15)" }}>
                    {t.type === "ingreso" ? <ArrowUpRight size={16} color={C.positive} /> : <ArrowDownRight size={16} color={C.negative} />}
                  </div>
                  <div>
                    <div className="text-sm" style={{ color: C.text }}>{t.category}{t.note ? ` · ${t.note}` : ""}</div>
                    <div className="text-xs" style={{ color: C.textFaint }}>
                      {t.date}
                      {t.accountId && ` · ${accountLabel(accounts.find((a) => a.id === t.accountId), banks)}`}
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
                  {canEdit && (
                    <>
                      <IconBtn label="Editar movimiento" onClick={() => onEdit(t)}><Pencil size={15} /></IconBtn>
                      <IconBtn label="Eliminar movimiento" danger onClick={() => onDelete(t.id)}><Trash2 size={15} /></IconBtn>
                    </>
                  )}
                </div>
              </div>
            );
          }

          const tr = item.data;
          const fromAcc = accounts.find((a) => a.id === tr.fromAccountId);
          const toAcc = accounts.find((a) => a.id === tr.toAccountId);
          const sameCurrency = fromAcc && toAcc && fromAcc.currency === toAcc.currency;
          return (
            <div key={tr.id} className="rounded-xl p-3 flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(79,168,160,0.15)" }}>
                  <ArrowRightLeft size={16} color={C.usd} />
                </div>
                <div>
                  <div className="text-sm" style={{ color: C.text }}>
                    {accountLabel(fromAcc, banks)} → {accountLabel(toAcc, banks)}
                    {tr.note ? ` · ${tr.note}` : ""}
                  </div>
                  <div className="text-xs" style={{ color: C.textFaint }}>{tr.date} · Transferencia</div>
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
                {canEdit && (
                  <>
                    <IconBtn label="Editar transferencia" onClick={() => onEditTransfer(tr)}><Pencil size={15} /></IconBtn>
                    <IconBtn label="Eliminar transferencia" danger onClick={() => onDeleteTransfer(tr.id)}><Trash2 size={15} /></IconBtn>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface FormState {
  type: TransactionType;
  amount: string;
  currency: Currency;
  category: string;
  date: string;
  note: string;
  accountId: string; // "" significa sin cuenta asignada
}

export function TransactionModal({
  initial,
  accounts,
  categories,
  onSave,
  onClose,
}: {
  initial?: Transaction;
  accounts: Account[];
  categories: Category[];
  onSave: (t: Transaction) => void;
  onClose: () => void;
}) {
  const catsFor = (type: TransactionType) => categories.filter((c) => c.type === type);

  const [form, setForm] = useState<FormState>(
    initial
      ? { type: initial.type, amount: String(fromMinor(initial.amountMinor)), currency: initial.currency, category: initial.category, date: initial.date, note: initial.note ?? "", accountId: initial.accountId ?? "" }
      : { type: "gasto", amount: "", currency: "UYU", category: catsFor("gasto")[0]?.name ?? "", date: todayISO(), note: "", accountId: "" }
  );
  const [error, setError] = useState<string | null>(null);
  const cats = catsFor(form.type);

  const handleSave = () => {
    const amountMinor = parseAmountInput(form.amount);
    if (amountMinor === null || amountMinor === 0) {
      setError("Ingresá un monto válido, mayor a cero.");
      return;
    }
    if (!form.date) {
      setError("Elegí una fecha.");
      return;
    }
    if (!form.category) {
      setError("Elegí una categoría (o creá una nueva en Configuración).");
      return;
    }
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      type: form.type,
      amountMinor,
      currency: form.currency,
      category: form.category,
      date: form.date,
      note: form.note.trim() || undefined,
      accountId: form.accountId || undefined,
    });
  };

  return (
    <Modal title={initial ? "Editar movimiento" : "Nuevo movimiento"} onClose={onClose}>
      <Field label="Tipo">
        {() => (
          <Segment
            value={form.type}
            onChange={(v) => setForm((f) => ({ ...f, type: v, category: catsFor(v)[0]?.name ?? "" }))}
            options={[{ value: "gasto", label: "Gasto" }, { value: "ingreso", label: "Ingreso" }]}
          />
        )}
      </Field>
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
              No hay categorías de {form.type === "ingreso" ? "ingreso" : "gasto"}. Creá una en Configuración → Categorías.
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
      <Field label="Cuenta (opcional)">
        {(id) => (
          <Select id={id} value={form.accountId} onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}>
            <option value="">Sin cuenta asignada</option>
            {accounts.filter((a) => a.currency === form.currency).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        )}
      </Field>
      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>
    </Modal>
  );
}

interface TransferFormState {
  fromAccountId: string;
  toAccountId: string;
  date: string;
  fromAmount: string;
  toAmount: string;
  exchangeRate: string;
  note: string;
}

export function TransferModal({
  initial,
  accounts,
  banks,
  onSave,
  onClose,
}: {
  initial?: Transfer;
  accounts: Account[];
  banks: Bank[];
  onSave: (t: Transfer) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<TransferFormState>(
    initial
      ? {
          fromAccountId: initial.fromAccountId,
          toAccountId: initial.toAccountId,
          date: initial.date,
          fromAmount: String(fromMinor(initial.fromAmountMinor)),
          toAmount: String(fromMinor(initial.toAmountMinor)),
          exchangeRate: initial.exchangeRate ? String(initial.exchangeRate) : "",
          note: initial.note ?? "",
        }
      : {
          fromAccountId: accounts[0]?.id ?? "",
          toAccountId: accounts[1]?.id ?? accounts[0]?.id ?? "",
          date: todayISO(),
          fromAmount: "",
          toAmount: "",
          exchangeRate: "",
          note: "",
        }
  );
  const [error, setError] = useState<string | null>(null);

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

    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      date: form.date,
      fromAccountId: fromAcc.id,
      toAccountId: toAcc.id,
      fromAmountMinor,
      toAmountMinor,
      exchangeRate,
      note: form.note.trim() || undefined,
    });
  };

  return (
    <Modal title={initial ? "Editar transferencia" : "Transferir entre cuentas"} onClose={onClose}>
      {accounts.length < 2 ? (
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
          {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
          <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>
        </>
      )}
    </Modal>
  );
}
