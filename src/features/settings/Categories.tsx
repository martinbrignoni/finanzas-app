import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Modal, Field, TextInput, Segment, PrimaryButton, IconBtn } from "../../components/ui";
import type { Category, Transaction, Budget, TransactionType } from "../../types";

export function CategoriesSettings({
  categories,
  transactions,
  budgets,
  canEdit,
  onAdd,
  onDelete,
}: {
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  canEdit: boolean;
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  const [blockedMsg, setBlockedMsg] = useState<string | null>(null);

  const isInUse = (cat: Category) =>
    transactions.some((t) => t.category === cat.name) || budgets.some((b) => b.category === cat.name);

  const handleDelete = (cat: Category) => {
    if (isInUse(cat)) {
      setBlockedMsg(`"${cat.name}" está en uso en movimientos o presupuestos. Reasigná esos registros a otra categoría antes de borrarla.`);
      return;
    }
    setBlockedMsg(null);
    onDelete(cat.id);
  };

  const gastos = categories.filter((c) => c.type === "gasto");
  const ingresos = categories.filter((c) => c.type === "ingreso");

  return (
    <div>
      {blockedMsg && (
        <div className="rounded-lg p-3 mb-3 text-xs" style={{ background: "rgba(217,119,106,0.15)", color: C.negative }}>
          {blockedMsg}
        </div>
      )}

      {([["Gasto", gastos], ["Ingreso", ingresos]] as [string, Category[]][]).map(([label, list]) => (
        <div key={label} className="mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.textFaint }}>{label}</h3>
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
            {list.length === 0 && (
              <div className="p-3 text-xs" style={{ background: C.surface, color: C.textMuted }}>Sin categorías.</div>
            )}
            {list.map((cat, i) => (
              <div key={cat.id} className="p-3 flex items-center justify-between text-sm" style={{ background: C.surface, borderTop: i ? `1px solid ${C.border}` : "none" }}>
                <span style={{ color: C.text }}>{cat.name}</span>
                {canEdit && <IconBtn label={`Eliminar ${cat.name}`} danger onClick={() => handleDelete(cat)}><Trash2 size={14} /></IconBtn>}
              </div>
            ))}
          </div>
        </div>
      ))}

      {canEdit && (
        <button
          onClick={onAdd}
          className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
          style={{ background: C.surface2, border: `1px dashed ${C.borderLight}`, color: C.textMuted }}
        >
          <Plus size={16} /> Nueva categoría
        </button>
      )}
    </div>
  );
}

export function CategoryModal({ onSave, onClose }: { onSave: (c: Category) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<TransactionType>("gasto");
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    if (!name.trim()) return setError("Ingresá un nombre para la categoría.");
    onSave({ id: crypto.randomUUID(), name: name.trim(), type });
  };

  return (
    <Modal title="Nueva categoría" onClose={onClose}>
      <Field label="Nombre">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="ej. Mascotas" />}</Field>
      <Field label="Tipo">{() => <Segment value={type} onChange={setType} options={[{ value: "gasto", label: "Gasto" }, { value: "ingreso", label: "Ingreso" }]} />}</Field>
      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>
    </Modal>
  );
}
