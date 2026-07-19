import { useEffect } from "react";
import { theme as C } from "../styles/theme";
import { Field, Select } from "./ui";
import type { Category, TransactionType } from "../types";

/** Baja por la rama del "primer hijo" hasta encontrar una categoría sin hijas (una hoja). */
function firstLeafUnder(categories: Category[], type: TransactionType, node: Category): Category {
  const children = categories.filter((c) => c.type === type && c.parentId === node.id);
  return children.length === 0 ? node : firstLeafUnder(categories, type, children[0]);
}

/**
 * Selector en cascada de hasta 3 niveles: Categoría madre → Categoría →
 * Subcategoría. `value` guarda el NOMBRE del nivel elegido (el mismo string
 * que ya se guardaba en Transaction.category/Budget.category).
 *
 * Siempre exige llegar hasta la última jerarquía cargada: si una categoría
 * tiene hijas, no se puede registrar en ese nivel, hay que elegir una de
 * las hijas (y así en cascada). Solo se puede quedar en un nivel si ese
 * nivel no tiene nada debajo.
 */
export function CategoryPicker({
  categories,
  type,
  value,
  onChange,
}: {
  categories: Category[];
  type: TransactionType;
  value: string;
  onChange: (name: string) => void;
}) {
  const roots = categories.filter((c) => c.type === type && !c.parentId);

  const selected = categories.find((c) => c.type === type && c.name === value);

  let madre: Category | undefined;
  let categoria: Category | undefined;
  let subcategoria: Category | undefined;

  if (selected) {
    if (!selected.parentId) {
      madre = selected;
    } else {
      const parent = categories.find((c) => c.id === selected.parentId);
      if (parent && !parent.parentId) {
        madre = parent;
        categoria = selected;
      } else if (parent) {
        madre = categories.find((c) => c.id === parent.parentId);
        categoria = parent;
        subcategoria = selected;
      }
    }
  }
  if (!madre) madre = roots[0];

  const categoriaOptions = madre ? categories.filter((c) => c.type === type && c.parentId === madre!.id) : [];
  const subcategoriaOptions = categoria ? categories.filter((c) => c.type === type && c.parentId === categoria!.id) : [];

  // El nodo elegido tiene que ser una hoja (sin hijas). Si el valor actual quedó
  // "a mitad de camino" (ej. le agregaron subcategorías después a una categoría
  // que ya estaba en uso), bajamos automáticamente a la primera hoja disponible.
  const resolvedLeaf = subcategoria ?? categoria ?? madre;
  const needsCorrection = !!resolvedLeaf && categories.some((c) => c.type === type && c.parentId === resolvedLeaf!.id);

  useEffect(() => {
    if (!needsCorrection || !resolvedLeaf) return;
    const leaf = firstLeafUnder(categories, type, resolvedLeaf);
    if (leaf.name !== value) onChange(leaf.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsCorrection, resolvedLeaf?.id]);

  if (roots.length === 0) {
    return (
      <p className="text-xs" style={{ color: C.textFaint }}>
        No hay categorías de {type === "ingreso" ? "ingreso" : "gasto"}. Creá una en Configuración → Categorías.
      </p>
    );
  }

  return (
    <>
      <Field label="Categoría madre">
        {(id) => (
          <Select
            id={id}
            value={madre!.id}
            onChange={(e) => {
              const m = categories.find((c) => c.id === e.target.value);
              if (m) onChange(firstLeafUnder(categories, type, m).name);
            }}
          >
            {roots.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </Select>
        )}
      </Field>

      {categoriaOptions.length > 0 && (
        <Field label="Categoría">
          {(id) => (
            <Select
              id={id}
              value={categoria?.id ?? ""}
              onChange={(e) => {
                const c = categories.find((c) => c.id === e.target.value);
                if (c) onChange(firstLeafUnder(categories, type, c).name);
              }}
            >
              {!categoria && <option value="" disabled>Elegí una categoría</option>}
              {categoriaOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          )}
        </Field>
      )}

      {categoria && subcategoriaOptions.length > 0 && (
        <Field label="Subcategoría">
          {(id) => (
            <Select
              id={id}
              value={subcategoria?.id ?? ""}
              onChange={(e) => {
                const s = categories.find((c) => c.id === e.target.value);
                if (s) onChange(firstLeafUnder(categories, type, s).name);
              }}
            >
              {!subcategoria && <option value="" disabled>Elegí una subcategoría</option>}
              {subcategoriaOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          )}
        </Field>
      )}
    </>
  );
}

/** Nombre de la primera hoja (categoría sin hijas) de un tipo, para usar como default al abrir un formulario. */
export function defaultLeafCategoryName(categories: Category[], type: TransactionType): string {
  const root = categories.find((c) => c.type === type && !c.parentId);
  if (!root) return "";
  return firstLeafUnder(categories, type, root).name;
}
