import { useState } from "react";
import { Pencil, Trash2, Plus } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Modal, Field, TextInput, Segment, PrimaryButton, IconBtn, CurrencyPill } from "../../components/ui";
import { CategoryPicker, defaultLeafCategoryValue } from "../../components/CategoryPicker";
import { formatMoney, parseAmountInput, fromMinor } from "../../lib/money";
import { currentMonthKey, monthKeyOf } from "../../lib/dates";
import type { Budget, Transaction, Currency, Category } from "../../types";

export function Budgets({ budgets, transactions, canEdit, onAdd, onEdit, onDelete }: {
  budgets: Budget[];
  transactions: Transaction[];
  canEdit: boolean;
  onAdd: () => void;
  onEdit: (b: Budget) => void;
  onDelete: (id: string) => void;
}) {
  const mk = currentMonthKey();
  const monthExpenses = transactions.filter((t) => monthKeyOf(t.date) === mk && t.type === "gasto");

  return (
    <div className="pb-24">
      <h1 className="text-2xl mb-4 font-display" style={{ color: C.text }}>Presupuestos</h1>

      {budgets.length === 0 && (
        <div className="rounded-xl p-6 text-center text-sm mb-4" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textMuted }}>
          Definí un límite mensual por categoría para ver tu progreso acá.
        </div>
      )}

      <div className="space-y-3 mb-4">
        {budgets.map((b) => {
          const spent = monthExpenses.filter((t) => t.category === b.category && t.currency === b.currency).reduce((s, t) => s + t.amountMinor, 0);
          const pct = Math.min(100, (spent / b.limitMinor) * 100);
          const over = spent > b.limitMinor;
          return (
            <div key={b.id} className="rounded-xl p-3.5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: C.text }}>{b.category}</span>
                  <CurrencyPill currency={b.currency} />
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <IconBtn label="Editar presupuesto" onClick={() => onEdit(b)}><Pencil size={14} /></IconBtn>
                    <IconBtn label="Eliminar presupuesto" danger onClick={() => onDelete(b.id)}><Trash2 size={14} /></IconBtn>
                  </div>
                )}
              </div>
              <div className="h-2 rounded-full overflow-hidden mb-1.5" style={{ background: C.surface2 }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: over ? C.negative : C.usd }} />
              </div>
              <div className="flex justify-between text-xs font-mono" style={{ color: C.textMuted }}>
                <span style={{ color: over ? C.negative : C.textMuted }}>{formatMoney(spent, b.currency)} gastado</span>
                <span>de {formatMoney(b.limitMinor, b.currency)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {canEdit && (
        <button
          onClick={onAdd}
          className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
          style={{ background: C.surface2, border: `1px dashed ${C.borderLight}`, color: C.textMuted }}
        >
          <Plus size={16} /> Nuevo presupuesto
        </button>
      )}
    </div>
  );
}

export function BudgetModal({ categories, initial, onSave, onClose }: {
  categories: Category[];
  initial?: Budget;
  onSave: (b: Budget) => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<string>(() => initial?.category ?? defaultLeafCategoryValue(categories, "gasto"));
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? "UYU");
  const [limit, setLimit] = useState(initial ? String(fromMinor(initial.limitMinor)) : "");
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    if (!category) return setError("Elegí una categoría (o creá una en Configuración).");
    const limitMinor = parseAmountInput(limit);
    if (limitMinor === null || limitMinor === 0) return setError("Ingresá un límite mensual válido.");
    onSave({ id: initial?.id ?? crypto.randomUUID(), category, currency, limitMinor });
  };

  return (
    <Modal title={initial ? "Editar presupuesto" : "Nuevo presupuesto"} onClose={onClose}>
      <CategoryPicker categories={categories} type="gasto" value={category} onChange={setCategory} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Límite mensual">{(id) => <TextInput id={id} type="number" min="0" step="0.01" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="0" />}</Field>
        <Field label="Moneda">{() => <Segment value={currency} onChange={setCurrency} options={[{ value: "UYU", label: "UYU" }, { value: "USD", label: "USD" }]} />}</Field>
      </div>
      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>
    </Modal>
  );
}
