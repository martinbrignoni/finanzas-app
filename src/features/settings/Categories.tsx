import { useState } from "react";
import { Plus, Trash2, ArrowRightLeft } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Modal, Field, TextInput, Select, Segment, PrimaryButton, IconBtn } from "../../components/ui";
import { CategoryPicker, defaultLeafCategoryName } from "../../components/CategoryPicker";
import type { Category, Transaction, Installment, Budget, TransactionType } from "../../types";

export function CategoriesSettings({
  categories,
  transactions,
  installments,
  budgets,
  canEdit,
  onAdd,
  onDelete,
  onMove,
  onReclassify,
}: {
  categories: Category[];
  transactions: Transaction[];
  installments: Installment[];
  budgets: Budget[];
  canEdit: boolean;
  onAdd: () => void;
  onDelete: (id: string) => void;
  /** Cambia el padre de una categoría (nivel 2) o subcategoría (nivel 3) existente. */
  onMove: (id: string, newParentId: string) => void;
  /** Reasigna todos los movimientos de una categoría a otra (antes de poder borrar la primera). */
  onReclassify: (fromName: string, toName: string) => void;
}) {
  const [blockedMsg, setBlockedMsg] = useState<string | null>(null);
  const [reclassifyTarget, setReclassifyTarget] = useState<Category | null>(null);
  const [moveTarget, setMoveTarget] = useState<Category | null>(null);

  const hasChildren = (cat: Category) => categories.some((c) => c.parentId === cat.id);
  const countMovements = (cat: Category) =>
    transactions.filter((t) => t.category === cat.name).length + installments.filter((i) => i.category === cat.name).length;

  const handleDelete = (cat: Category) => {
    if (hasChildren(cat)) {
      setBlockedMsg(`"${cat.name}" tiene categorías o subcategorías debajo. Borrá esas primero.`);
      return;
    }
    const movCount = countMovements(cat);
    if (movCount > 0) {
      setBlockedMsg(null);
      setReclassifyTarget(cat);
      return;
    }
    if (budgets.some((b) => b.category === cat.name)) {
      setBlockedMsg(`"${cat.name}" está en uso en un presupuesto. Borrá o recreá ese presupuesto con otra categoría antes de eliminar esta.`);
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
                          {canEdit && (
                            <div className="flex gap-1">
                              <IconBtn label={`Mover ${cat.name}`} onClick={() => setMoveTarget(cat)}><ArrowRightLeft size={13} /></IconBtn>
                              <IconBtn label={`Eliminar ${cat.name}`} danger onClick={() => handleDelete(cat)}><Trash2 size={13} /></IconBtn>
                            </div>
                          )}
                        </div>
                        {nietas.map((sub) => (
                          <div
                            key={sub.id}
                            className="pl-10 py-2 pr-3 flex items-center justify-between text-xs"
                            style={{ background: C.surface, borderTop: `1px solid ${C.border}` }}
                          >
                            <span style={{ color: C.textMuted }}>{sub.name}</span>
                            {canEdit && (
                              <div className="flex gap-1">
                                <IconBtn label={`Mover ${sub.name}`} onClick={() => setMoveTarget(sub)}><ArrowRightLeft size={12} /></IconBtn>
                                <IconBtn label={`Eliminar ${sub.name}`} danger onClick={() => handleDelete(sub)}><Trash2 size={12} /></IconBtn>
                              </div>
                            )}
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

      {reclassifyTarget && (
        <ReclassifyModal
          category={reclassifyTarget}
          categories={categories}
          movementCount={countMovements(reclassifyTarget)}
          onConfirm={(toName) => {
            onReclassify(reclassifyTarget.name, toName);
            setReclassifyTarget(null);
            onDelete(reclassifyTarget.id);
          }}
          onClose={() => setReclassifyTarget(null)}
        />
      )}

      {moveTarget && (
        <MoveCategoryModal
          category={moveTarget}
          categories={categories}
          onMove={(id, newParentId) => {
            onMove(id, newParentId);
            setMoveTarget(null);
          }}
          onClose={() => setMoveTarget(null)}
        />
      )}
    </div>
  );
}

/** Pide a qué categoría pasar los movimientos de `category` antes de poder eliminarla. */
function ReclassifyModal({
  category,
  categories,
  movementCount,
  onConfirm,
  onClose,
}: {
  category: Category;
  categories: Category[];
  movementCount: number;
  onConfirm: (toName: string) => void;
  onClose: () => void;
}) {
  const otherCategories = categories.filter((c) => c.id !== category.id);
  const [toName, setToName] = useState(() => defaultLeafCategoryName(otherCategories, category.type));
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = () => {
    if (!toName) return setError("Elegí una categoría destino.");
    onConfirm(toName);
  };

  return (
    <Modal title={`Reclasificar "${category.name}"`} onClose={onClose}>
      <p className="text-xs mb-3" style={{ color: C.textMuted }}>
        Esta categoría tiene {movementCount} movimiento{movementCount === 1 ? "" : "s"} cargado{movementCount === 1 ? "" : "s"}.
        Elegí a qué categoría pasarlos; una vez reclasificados, "{category.name}" queda vacía y te vamos a pedir que confirmes el borrado.
      </p>
      <CategoryPicker categories={otherCategories} type={category.type} value={toName} onChange={setToName} />
      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleConfirm}>Reclasificar y continuar</PrimaryButton>
    </Modal>
  );
}

/** Cambia el padre de una categoría (nivel 2) o subcategoría (nivel 3), manteniendo su nivel actual. */
function MoveCategoryModal({
  category,
  categories,
  onMove,
  onClose,
}: {
  category: Category;
  categories: Category[];
  onMove: (id: string, newParentId: string) => void;
  onClose: () => void;
}) {
  const currentParent = categories.find((c) => c.id === category.parentId);
  const isLevel2 = !!currentParent && !currentParent.parentId;

  const targets = isLevel2
    ? categories.filter((c) => c.type === category.type && !c.parentId && c.id !== category.id)
    : categories.filter((c) => {
        if (c.type !== category.type || !c.parentId) return false;
        const p = categories.find((x) => x.id === c.parentId);
        return !!p && !p.parentId;
      });

  const [targetId, setTargetId] = useState(() => targets.find((t) => t.id !== category.parentId)?.id ?? targets[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  const madreGroupIds = Array.from(new Set(targets.map((t) => t.parentId).filter((id): id is string => !!id)));

  const handleSave = () => {
    if (!targetId) return setError("Elegí un destino.");
    if (targetId === category.parentId) return setError("Ya está ahí. Elegí un destino distinto.");
    onMove(category.id, targetId);
  };

  return (
    <Modal title={`Mover "${category.name}"`} onClose={onClose}>
      <Field label={isLevel2 ? "Nueva categoría madre" : "Nueva categoría"}>
        {(id) =>
          targets.length === 0 ? (
            <p className="text-xs" style={{ color: C.textFaint }}>No hay otro destino disponible todavía.</p>
          ) : isLevel2 ? (
            <Select id={id} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              {targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          ) : (
            <Select id={id} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              {madreGroupIds.map((madreId) => {
                const madre = categories.find((c) => c.id === madreId);
                const hijas = targets.filter((t) => t.parentId === madreId);
                return (
                  <optgroup key={madreId} label={madre?.name ?? ""}>
                    {hijas.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </optgroup>
                );
              })}
            </Select>
          )
        }
      </Field>
      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Mover</PrimaryButton>
    </Modal>
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
