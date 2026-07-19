import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Modal, Field, TextInput, Select, Segment, PrimaryButton, IconBtn } from "../../components/ui";
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

  const hasChildren = (cat: Category) => categories.some((c) => c.parentId === cat.id);
  const isInUse = (cat: Category) =>
    transactions.some((t) => t.category === cat.name) || budgets.some((b) => b.category === cat.name);

  const handleDelete = (cat: Category) => {
    if (hasChildren(cat)) {
      setBlockedMsg(`"${cat.name}" tiene categorías o subcategorías debajo. Borrá esas primero.`);
      return;
    }
    if (isInUse(cat)) {
      setBlockedMsg(`"${cat.name}" está en uso en movimientos o presupuestos. Reasigná esos registros a otra categoría antes de borrarla.`);
      return;
    }
    setBlockedMsg(null);
    onDelete(cat.id);
  };

  const gastos = categories.filter((c) => c.type === "gasto" && !c.parentId);
  const ingresos = categories.filter((c) => c.type === "ingreso" && !c.parentId);

  return (
    <div>
      {blockedMsg && (
        <div className="rounded-lg p-3 mb-3 text-xs" style={{ background: "rgba(217,119,106,0.15)", color: C.negative }}>
          {blockedMsg}
        </div>
      )}

      {([["Gasto", gastos], ["Ingreso", ingresos]] as [string, Category[]][]).map(([label, roots]) => (
        <div key={label} className="mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.textFaint }}>{label}</h3>
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
            {roots.length === 0 && (
              <div className="p-3 text-xs" style={{ background: C.surface, color: C.textMuted }}>Sin categorías.</div>
            )}
            {roots.map((madre, i) => {
              const hijas = categories.filter((c) => c.parentId === madre.id);
              return (
                <div key={madre.id}>
                  <div
                    className="p-3 flex items-center justify-between text-sm"
                    style={{ background: C.surface, borderTop: i ? `1px solid ${C.border}` : "none" }}
                  >
                    <span className="font-semibold" style={{ color: C.text }}>{madre.name}</span>
                    {canEdit && <IconBtn label={`Eliminar ${madre.name}`} danger onClick={() => handleDelete(madre)}><Trash2 size={14} /></IconBtn>}
                  </div>
                  {hijas.map((cat) => {
                    const nietas = categories.filter((c) => c.parentId === cat.id);
                    return (
                      <div key={cat.id}>
                        <div
                          className="pl-6 py-2.5 pr-3 flex items-center justify-between text-sm"
                          style={{ background: C.surface2, borderTop: `1px solid ${C.border}` }}
                        >
                          <span style={{ color: C.text }}>{cat.name}</span>
                          {canEdit && <IconBtn label={`Eliminar ${cat.name}`} danger onClick={() => handleDelete(cat)}><Trash2 size={13} /></IconBtn>}
                        </div>
                        {nietas.map((sub) => (
                          <div
                            key={sub.id}
                            className="pl-10 py-2 pr-3 flex items-center justify-between text-xs"
                            style={{ background: C.surface, borderTop: `1px solid ${C.border}` }}
                          >
                            <span style={{ color: C.textMuted }}>{sub.name}</span>
                            {canEdit && <IconBtn label={`Eliminar ${sub.name}`} danger onClick={() => handleDelete(sub)}><Trash2 size={12} /></IconBtn>}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}
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

/**
 * Crea una categoría en cualquier nivel de la jerarquía: si no elegís
 * "Categoría madre" queda como madre nueva; si elegís una madre pero no
 * "Categoría", queda colgando directo de la madre; si elegís ambas, queda
 * como subcategoría de la categoría elegida.
 */
export function CategoryModal({
  categories,
  defaultType = "gasto",
  onSave,
  onClose,
}: {
  categories: Category[];
  /** Tipo preseleccionado al abrir (ej. si se crea desde un movimiento que ya es un ingreso). */
  defaultType?: TransactionType;
  onSave: (c: Category) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<TransactionType>(defaultType);
  const [madreId, setMadreId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const roots = categories.filter((c) => c.type === type && !c.parentId);
  const madre = categories.find((c) => c.id === madreId);
  const categoriaOptions = madre ? categories.filter((c) => c.parentId === madre.id) : [];
  const parentId = categoriaId || madreId || undefined;

  const nameLabel = categoriaId ? "Nombre de la subcategoría" : madreId ? "Nombre de la categoría" : "Nombre de la categoría madre";

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return setError("Ingresá un nombre.");
    const dup = categories.some((c) => c.type === type && c.parentId === parentId && c.name.toLowerCase() === trimmed.toLowerCase());
    if (dup) return setError("Ya existe una categoría con ese nombre en este nivel.");
    onSave({ id: crypto.randomUUID(), name: trimmed, type, parentId });
  };

  return (
    <Modal title="Nueva categoría" onClose={onClose}>
      <Field label="Tipo">
        {() => (
          <Segment
            value={type}
            onChange={(v) => { setType(v); setMadreId(""); setCategoriaId(""); }}
            options={[{ value: "gasto", label: "Gasto" }, { value: "ingreso", label: "Ingreso" }]}
          />
        )}
      </Field>

      <Field label="Categoría madre">
        {(id) => (
          <Select id={id} value={madreId} onChange={(e) => { setMadreId(e.target.value); setCategoriaId(""); }}>
            <option value="">— Nueva categoría madre —</option>
            {roots.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        )}
      </Field>

      {madre && (
        <Field label="Categoría (opcional)">
          {(id) => (
            <Select id={id} value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
              <option value="">{`— Directo bajo "${madre.name}" —`}</option>
              {categoriaOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
        </Field>
      )}

      <Field label={nameLabel}>
        {(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="ej. UTE" />}
      </Field>

      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>
    </Modal>
  );
}
