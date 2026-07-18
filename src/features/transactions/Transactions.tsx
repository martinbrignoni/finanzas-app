import { useState } from "react";
import { ArrowUpRight, ArrowDownRight, Pencil, Trash2 } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Modal, Field, TextInput, Select, Segment, PrimaryButton, IconBtn, CurrencyPill } from "../../components/ui";
import { formatMoney, parseAmountInput, fromMinor } from "../../lib/money";
import { monthKeyOf, currentMonthKey, todayISO } from "../../lib/dates";
import type { Transaction, Currency, TransactionType, Account, Category } from "../../types";

export function Transactions({
  transactions,
  accounts,
  canEdit,
  onEdit,
  onDelete,
}: {
  transactions: Transaction[];
  accounts: Account[];
  canEdit: boolean;
  onEdit: (t: Transaction) => void;
  onDelete: (id: string) => void;
}) {
  const [filterMonth, setFilterMonth] = useState(currentMonthKey());
  const list = transactions
    .filter((t) => monthKeyOf(t.date) === filterMonth)
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

      {list.length === 0 && (
        <div className="rounded-xl p-6 text-center text-sm" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textMuted }}>
          Sin movimientos este mes.
        </div>
      )}

      <div className="space-y-2">
        {list.map((t) => (
          <div key={t.id} className="rounded-xl p-3 flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: t.type === "ingreso" ? "rgba(111,191,139,0.15)" : "rgba(217,119,106,0.15)" }}>
                {t.type === "ingreso" ? <ArrowUpRight size={16} color={C.positive} /> : <ArrowDownRight size={16} color={C.negative} />}
              </div>
              <div>
                <div className="text-sm" style={{ color: C.text }}>{t.category}{t.note ? ` · ${t.note}` : ""}</div>
                <div className="text-xs" style={{ color: C.textFaint }}>
                  {t.date}
                  {t.accountId && ` · ${accounts.find((a) => a.id === t.accountId)?.name ?? "cuenta eliminada"}`}
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
        ))}
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
