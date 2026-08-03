import { useState } from "react";
import { Plus, Trash2, Pencil, ArrowRightLeft, List, Download, ChevronDown, ChevronRight, Users } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Modal, Field, TextInput, Select, Segment, PrimaryButton, IconBtn } from "../../components/ui";
import { CategoryPicker, defaultLeafCategoryValue } from "../../components/CategoryPicker";
import { categoryFullPath, isMinuchiRootCategory, categoryAllowsFamilyMembers } from "../../lib/categories";
import { formatMoney } from "../../lib/money";
import { formatDateDMY, monthKeyOf, monthLabel, capitalize } from "../../lib/dates";
import { exportCategoryToExcel } from "../../lib/excelExport";
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
  onRename,
  onSetAllowFamilyMembers,
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
  /** Cambia el nombre de una categoría (madre, categoría o subcategoría) existente. */
  onRename: (id: string, newName: string) => void;
  /** Activa/desactiva si esta categoría permite elegir integrante de familia al cargar un movimiento. */
  onSetAllowFamilyMembers: (id: string, allow: boolean) => void;
  /** Reasigna todos los movimientos de una categoría a otra (antes de poder borrar la primera). */
  onReclassify: (fromName: string, toName: string) => void;
}) {
  const [blockedMsg, setBlockedMsg] = useState<string | null>(null);
  const [reclassifyTarget, setReclassifyTarget] = useState<Category | null>(null);
  const [moveTarget, setMoveTarget] = useState<Category | null>(null);
  const [renameTarget, setRenameTarget] = useState<Category | null>(null);
  const [ledgerTarget, setLedgerTarget] = useState<Category | null>(null);
  // Arranca con todo colapsado (solo categorías madre a la vista) para que un árbol
  // grande no sea una pared de texto; cada quien expande lo que quiere mirar.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(
    () => new Set(categories.filter((c) => categories.some((x) => x.parentId === c.id)).map((c) => c.id))
  );
  const toggleCollapsed = (id: string) =>
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const hasChildren = (cat: Category) => categories.some((c) => c.parentId === cat.id);
  const countMovements = (cat: Category) => {
    const fullPath = categoryFullPath(cat, categories);
    return transactions.filter((t) => t.category === fullPath).length + installments.filter((i) => i.category === fullPath).length;
  };

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
    if (budgets.some((b) => b.category === categoryFullPath(cat, categories))) {
      setBlockedMsg(`"${cat.name}" está en uso en un presupuesto. Borrá o recreá ese presupuesto con otra categoría antes de eliminar esta.`);
      return;
    }
    setBlockedMsg(null);
    onDelete(cat.id);
  };

  // El emprendimiento de la esposa (Martín usa las cuentas/tarjetas de la casa para
  // comprar y cobrar de "MINUCHI") se administra con sus propias categorías madre de
  // ingreso y de gasto, pero se muestran aparte de las categorías personales, arriba
  // de todo, para poder mirar y analizar sus números de forma independiente.
  const minuchiRoots = categories.filter(isMinuchiRootCategory);
  const gastos = categories.filter((c) => c.type === "gasto" && !c.parentId && !isMinuchiRootCategory(c));
  const ingresos = categories.filter((c) => c.type === "ingreso" && !c.parentId && !isMinuchiRootCategory(c));

  const renderRoots = (roots: Category[]) => (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
      {roots.length === 0 && (
        <div className="p-3 text-xs" style={{ background: C.surface, color: C.textMuted }}>Sin categorías.</div>
      )}
      {roots.map((madre, i) => {
        const hijas = categories.filter((c) => c.parentId === madre.id);
        const madreExpanded = !collapsedIds.has(madre.id);
        return (
          <div key={madre.id}>
            <div
              className="p-3 flex items-center justify-between text-sm"
              style={{ background: C.surface, borderTop: i ? `1px solid ${C.border}` : "none" }}
            >
              <button
                onClick={() => hijas.length > 0 && toggleCollapsed(madre.id)}
                className="flex items-center gap-1.5 text-left min-w-0"
                disabled={hijas.length === 0}
              >
                {hijas.length > 0 && (madreExpanded ? <ChevronDown size={14} color={C.textFaint} /> : <ChevronRight size={14} color={C.textFaint} />)}
                <span className="font-semibold truncate" style={{ color: C.text }}>{madre.name}</span>
                {categoryAllowsFamilyMembers(madre, categories) && <Users size={12} color={C.textFaint} />}
              </button>
              <div className="flex items-center gap-1 shrink-0">
                {countMovements(madre) > 0 && (
                  <>
                    <span className="text-xs" style={{ color: C.textFaint }}>
                      {countMovements(madre)} mov.
                    </span>
                    <IconBtn label={`Ver movimientos de ${madre.name}`} onClick={() => setLedgerTarget(madre)}><List size={14} /></IconBtn>
                  </>
                )}
                {canEdit && (
                  <>
                    <IconBtn label={`Editar ${madre.name}`} onClick={() => setRenameTarget(madre)}><Pencil size={14} /></IconBtn>
                    <IconBtn label={`Eliminar ${madre.name}`} danger onClick={() => handleDelete(madre)}><Trash2 size={14} /></IconBtn>
                  </>
                )}
              </div>
            </div>
            {madreExpanded && hijas.map((cat) => {
              const nietas = categories.filter((c) => c.parentId === cat.id);
              const catExpanded = !collapsedIds.has(cat.id);
              return (
                <div key={cat.id}>
                  <div
                    className="pl-6 py-2.5 pr-3 flex items-center justify-between text-sm"
                    style={{ background: C.surface2, borderTop: `1px solid ${C.border}` }}
                  >
                    <button
                      onClick={() => nietas.length > 0 && toggleCollapsed(cat.id)}
                      className="flex items-center gap-1.5 text-left min-w-0"
                      disabled={nietas.length === 0}
                    >
                      {nietas.length > 0 && (catExpanded ? <ChevronDown size={13} color={C.textFaint} /> : <ChevronRight size={13} color={C.textFaint} />)}
                      <span className="truncate" style={{ color: C.text }}>{cat.name}</span>
                      {categoryAllowsFamilyMembers(cat, categories) && <Users size={11} color={C.textFaint} />}
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      {countMovements(cat) > 0 && (
                        <>
                          <span className="text-xs" style={{ color: C.textFaint }}>
                            {countMovements(cat)} mov.
                          </span>
                          <IconBtn label={`Ver movimientos de ${cat.name}`} onClick={() => setLedgerTarget(cat)}><List size={13} /></IconBtn>
                        </>
                      )}
                      {canEdit && (
                        <>
                          <IconBtn label={`Editar ${cat.name}`} onClick={() => setRenameTarget(cat)}><Pencil size={13} /></IconBtn>
                          <IconBtn label={`Mover ${cat.name}`} onClick={() => setMoveTarget(cat)}><ArrowRightLeft size={13} /></IconBtn>
                          <IconBtn label={`Eliminar ${cat.name}`} danger onClick={() => handleDelete(cat)}><Trash2 size={13} /></IconBtn>
                        </>
                      )}
                    </div>
                  </div>
                  {catExpanded && nietas.map((sub) => (
                    <div
                      key={sub.id}
                      className="pl-10 py-2 pr-3 flex items-center justify-between text-xs"
                      style={{ background: C.surface, borderTop: `1px solid ${C.border}` }}
                    >
                      <span className="flex items-center gap-1" style={{ color: C.textMuted }}>
                        {sub.name}
                        {categoryAllowsFamilyMembers(sub, categories) && <Users size={10} color={C.textFaint} />}
                      </span>
                      <div className="flex items-center gap-1">
                        {countMovements(sub) > 0 && (
                          <>
                            <span className="text-xs" style={{ color: C.textFaint }}>
                              {countMovements(sub)} mov.
                            </span>
                            <IconBtn label={`Ver movimientos de ${sub.name}`} onClick={() => setLedgerTarget(sub)}><List size={12} /></IconBtn>
                          </>
                        )}
                        {canEdit && (
                          <>
                            <IconBtn label={`Editar ${sub.name}`} onClick={() => setRenameTarget(sub)}><Pencil size={12} /></IconBtn>
                            <IconBtn label={`Mover ${sub.name}`} onClick={() => setMoveTarget(sub)}><ArrowRightLeft size={12} /></IconBtn>
                            <IconBtn label={`Eliminar ${sub.name}`} danger onClick={() => handleDelete(sub)}><Trash2 size={12} /></IconBtn>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs" style={{ color: C.textMuted }}>
          Se organizan en categoría madre, categoría y subcategoría (hasta 3 niveles).
        </p>
        {canEdit && (
          <button
            onClick={onAdd}
            aria-label="Nueva categoría"
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 ml-2"
            style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text }}
          >
            <Plus size={18} />
          </button>
        )}
      </div>

      {blockedMsg && (
        <div className="rounded-lg p-3 mb-3 text-xs" style={{ background: "rgba(217,119,106,0.15)", color: C.negative }}>
          {blockedMsg}
        </div>
      )}

      {minuchiRoots.length > 0 && (
        <div className="mb-5 pb-1" style={{ borderBottom: `1px solid ${C.border}` }}>
          <h3 className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: C.usd }}>MINUCHI</h3>
          <p className="text-[11px] mb-2" style={{ color: C.textFaint }}>
            Emprendimiento aparte: se guarda con sus propias categorías para poder ver y analizar sus números por separado.
          </p>
          {(["ingreso", "gasto"] as TransactionType[]).map((type) => {
            const roots = minuchiRoots.filter((c) => c.type === type);
            if (roots.length === 0) return null;
            return (
              <div key={type} className="mb-3 last:mb-0">
                <h4 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.textFaint }}>
                  {type === "ingreso" ? "Ingreso" : "Gasto"}
                </h4>
                {renderRoots(roots)}
              </div>
            );
          })}
        </div>
      )}

      {([["Ingreso", ingresos], ["Gasto", gastos]] as [string, Category[]][]).map(([label, roots]) => (
        <div key={label} className="mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.textFaint }}>{label}</h3>
          {renderRoots(roots)}
        </div>
      ))}

      {reclassifyTarget && (
        <ReclassifyModal
          category={reclassifyTarget}
          categories={categories}
          movementCount={countMovements(reclassifyTarget)}
          onConfirm={(toName) => {
            onReclassify(categoryFullPath(reclassifyTarget, categories), toName);
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

      {renameTarget && (
        <RenameCategoryModal
          category={renameTarget}
          categories={categories}
          onRename={onRename}
          onSetAllowFamilyMembers={onSetAllowFamilyMembers}
          onClose={() => setRenameTarget(null)}
        />
      )}

      {ledgerTarget && (
        <CategoryLedgerModal
          category={ledgerTarget}
          categories={categories}
          transactions={transactions}
          installments={installments}
          onClose={() => setLedgerTarget(null)}
        />
      )}
    </div>
  );
}

/** Lista los movimientos (gastos/ingresos y compras en cuotas) de una categoría, con opción de exportarlos a Excel. */
function CategoryLedgerModal({
  category,
  categories,
  transactions,
  installments,
  onClose,
}: {
  category: Category;
  categories: Category[];
  transactions: Transaction[];
  installments: Installment[];
  onClose: () => void;
}) {
  const fullPath = categoryFullPath(category, categories);

  const items = [
    ...transactions
      .filter((t) => t.category === fullPath)
      .map((t) => ({
        id: t.id,
        date: t.date,
        label: t.type === "ingreso" ? "Ingreso" : "Gasto",
        note: t.note,
        amountMinor: t.amountMinor,
        sign: t.type === "ingreso" ? 1 : -1,
        currency: t.currency,
      })),
    ...installments
      .filter((i) => i.category === fullPath)
      .map((i) => ({
        id: i.id,
        date: i.date ?? `${i.startMonth}-01`,
        label: `Compra en cuotas (${i.numInstallments})`,
        note: [i.description, i.note].filter(Boolean).join(" · "),
        amountMinor: i.totalAmountMinor,
        sign: -1 as const,
        currency: i.currency,
      })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const grouped = new Map<string, typeof items>();
  items.forEach((it) => {
    const mk = monthKeyOf(it.date);
    grouped.set(mk, [...(grouped.get(mk) ?? []), it]);
  });

  return (
    <Modal title={`Movimientos: ${category.name}`} onClose={onClose}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs" style={{ color: C.textFaint }}>
          {items.length} movimiento{items.length === 1 ? "" : "s"}
        </span>
        {items.length > 0 && (
          <button
            onClick={() => exportCategoryToExcel(category, categories, transactions, installments)}
            className="text-xs font-semibold flex items-center gap-1"
            style={{ color: C.usd }}
          >
            <Download size={13} /> Exportar a Excel
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-xs" style={{ color: C.textFaint }}>Todavía no hay movimientos en esta categoría.</p>
      ) : (
        <div className="space-y-3 max-h-[55vh] overflow-y-auto">
          {Array.from(grouped.entries()).map(([mk, monthItems]) => (
            <div key={mk}>
              <div className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: C.textFaint }}>
                {capitalize(monthLabel(mk))}
              </div>
              <div className="space-y-1.5">
                {monthItems.map((it) => (
                  <div key={it.id} className="rounded-lg p-2.5 flex items-center justify-between text-sm" style={{ background: C.surface2 }}>
                    <div>
                      <div style={{ color: C.text }}>{it.label}{it.note ? ` · ${it.note}` : ""}</div>
                      <div className="text-xs" style={{ color: C.textFaint }}>{formatDateDMY(it.date)}</div>
                    </div>
                    <span className="font-mono text-sm" style={{ color: it.sign > 0 ? C.positive : C.negative }}>
                      {it.sign > 0 ? "+" : "-"}{formatMoney(it.amountMinor, it.currency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
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
  const [toName, setToName] = useState(() => defaultLeafCategoryValue(otherCategories, category.type));
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

/** Edita el nombre de una categoría (madre, categoría o subcategoría) ya existente, y si permite elegir integrante de familia. */
function RenameCategoryModal({
  category,
  categories,
  onRename,
  onSetAllowFamilyMembers,
  onClose,
}: {
  category: Category;
  categories: Category[];
  onRename: (id: string, newName: string) => void;
  onSetAllowFamilyMembers: (id: string, allow: boolean) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [allowFamilyMembers, setAllowFamilyMembers] = useState(!!category.allowFamilyMembers);
  const [error, setError] = useState<string | null>(null);

  const parent = categories.find((c) => c.id === category.parentId);
  const inheritedFromAbove = !!parent && categoryAllowsFamilyMembers(parent, categories);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return setError("Ingresá un nombre.");
    const dup = categories.some(
      (c) => c.id !== category.id && c.type === category.type && c.parentId === category.parentId && c.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (dup) return setError("Ya existe una categoría con ese nombre en este nivel.");
    if (trimmed !== category.name) onRename(category.id, trimmed);
    if (allowFamilyMembers !== !!category.allowFamilyMembers) onSetAllowFamilyMembers(category.id, allowFamilyMembers);
    onClose();
  };

  return (
    <Modal title={`Editar "${category.name}"`} onClose={onClose}>
      <p className="text-xs mb-3" style={{ color: C.textMuted }}>
        Los movimientos, cuotas y presupuestos ya cargados con esta categoría (y sus subcategorías) se actualizan solos al nuevo nombre.
      </p>
      <Field label="Nombre">
        {(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      {inheritedFromAbove ? (
        <p className="text-xs mb-3" style={{ color: C.textFaint }}>
          Ya está heredado de "{parent!.name}": esta categoría (y las que cuelguen de ella) ya permiten elegir integrante de familia sin necesidad de activarlo acá también.
        </p>
      ) : (
        <>
          <Field label="¿Permite elegir integrante de familia?">
            {() => (
              <Segment
                value={allowFamilyMembers ? "si" : "no"}
                onChange={(v) => setAllowFamilyMembers(v === "si")}
                options={[{ value: "no", label: "No" }, { value: "si", label: "Sí" }]}
              />
            )}
          </Field>
          <p className="text-xs -mt-2 mb-3" style={{ color: C.textFaint }}>
            Si está en "Sí", al cargar un gasto o ingreso en esta categoría (y en las que cuelguen de ella) vas a poder elegir para quién de la familia es (uno, varios, o dejarlo sin asignar).
          </p>
        </>
      )}
      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>
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
  const [allowFamilyMembers, setAllowFamilyMembers] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roots = categories.filter((c) => c.type === type && !c.parentId);
  const madre = categories.find((c) => c.id === madreId);
  const categoriaOptions = madre ? categories.filter((c) => c.parentId === madre.id) : [];
  const parentId = categoriaId || madreId || undefined;
  const effectiveParent = categories.find((c) => c.id === parentId);
  const inheritedFromAbove = !!effectiveParent && categoryAllowsFamilyMembers(effectiveParent, categories);

  const nameLabel = categoriaId ? "Nombre de la subcategoría" : madreId ? "Nombre de la categoría" : "Nombre de la categoría madre";

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return setError("Ingresá un nombre.");
    const dup = categories.some((c) => c.type === type && c.parentId === parentId && c.name.toLowerCase() === trimmed.toLowerCase());
    if (dup) return setError("Ya existe una categoría con ese nombre en este nivel.");
    onSave({ id: crypto.randomUUID(), name: trimmed, type, parentId, allowFamilyMembers: allowFamilyMembers || undefined });
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

      {inheritedFromAbove ? (
        <p className="text-xs mb-3" style={{ color: C.textFaint }}>
          Ya heredado de "{effectiveParent!.name}": esta categoría nueva ya va a permitir elegir integrante de familia, sin necesidad de activarlo acá también.
        </p>
      ) : (
        <>
          <Field label="¿Permite elegir integrante de familia?">
            {() => (
              <Segment
                value={allowFamilyMembers ? "si" : "no"}
                onChange={(v) => setAllowFamilyMembers(v === "si")}
                options={[{ value: "no", label: "No" }, { value: "si", label: "Sí" }]}
              />
            )}
          </Field>
          <p className="text-xs -mt-2 mb-3" style={{ color: C.textFaint }}>
            Si está en "Sí", al cargar un gasto o ingreso en esta categoría (y en las que cuelguen de ella) vas a poder elegir para quién de la familia es (ej. una clase o una salida que a veces es tuya, a veces de otro).
          </p>
        </>
      )}

      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>
    </Modal>
  );
}
