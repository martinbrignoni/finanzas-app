import { useEffect } from "react";
import { theme as C } from "../styles/theme";
import { Field, Combobox } from "./ui";
import type { ComboboxOption } from "./ui";
import type { Category, TransactionType } from "../types";

interface LeafInfo {
  leaf: Category;
  /** Nombres desde justo debajo de la categoría madre hasta la hoja (vacío si la madre es la hoja). */
  path: string[];
  root: Category;
}

/** Baja por la rama del "primer hijo" hasta encontrar una categoría sin hijas (una hoja). */
function firstLeafUnder(categories: Category[], type: TransactionType, node: Category): Category {
  const children = categories.filter((c) => c.type === type && c.parentId === node.id);
  return children.length === 0 ? node : firstLeafUnder(categories, type, children[0]);
}

/** Todas las hojas (categorías sin hijas) debajo de una categoría madre, con el camino recorrido para mostrarlo. */
function collectLeaves(categories: Category[], type: TransactionType, node: Category, path: string[]): { leaf: Category; path: string[] }[] {
  const children = categories.filter((c) => c.type === type && c.parentId === node.id);
  if (children.length === 0) return [{ leaf: node, path }];
  return children.flatMap((child) => collectLeaves(categories, type, child, [...path, child.name]));
}

/**
 * Selector de categoría: un único combo, pero las opciones son siempre el
 * nivel más bajo cargado. Si una categoría madre no tiene nada debajo,
 * aparece como una opción suelta (ej. "Salud"); si tiene categorías o
 * subcategorías, aparecen agrupadas bajo su madre y solo se puede elegir
 * la hoja (ej. "Gastos Fijos" agrupa "UTE > Casa" y "UTE > Apto", ya no se
 * puede registrar un movimiento directo en "Gastos Fijos").
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
  const allLeaves: LeafInfo[] = roots.flatMap((root) =>
    collectLeaves(categories, type, root, []).map(({ leaf, path }) => ({ leaf, path, root }))
  );

  const current = allLeaves.find((x) => x.leaf.name === value);

  // Si el valor actual no corresponde a ninguna hoja válida (ej. le agregaron
  // subcategorías después a una que ya estaba en uso), corregimos a la primera disponible.
  useEffect(() => {
    if (!current && allLeaves.length > 0) {
      onChange(allLeaves[0].leaf.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.leaf.id, allLeaves.length]);

  if (roots.length === 0) {
    return (
      <p className="text-xs" style={{ color: C.textFaint }}>
        No hay categorías de {type === "ingreso" ? "ingreso" : "gasto"}. Creá una en Configuración → Categorías.
      </p>
    );
  }

  const options: ComboboxOption[] = roots.flatMap((root) => {
    const leaves = allLeaves.filter((x) => x.root.id === root.id);
    if (leaves.length === 1 && leaves[0].leaf.id === root.id) {
      return [{ value: root.id, label: root.name }];
    }
    return leaves.map(({ leaf, path }) => ({ value: leaf.id, label: path.join(" > "), group: root.name }));
  });

  return (
    <Field label="Categoría">
      {(id) => (
        <Combobox
          id={id}
          options={options}
          value={current?.leaf.id ?? ""}
          placeholder="Escribí o elegí una categoría..."
          onChange={(id) => {
            const found = allLeaves.find((x) => x.leaf.id === id);
            if (found) onChange(found.leaf.name);
          }}
        />
      )}
    </Field>
  );
}

/** Nombre de la primera hoja (categoría sin hijas) de un tipo, para usar como default al abrir un formulario. */
export function defaultLeafCategoryName(categories: Category[], type: TransactionType): string {
  const root = categories.find((c) => c.type === type && !c.parentId);
  if (!root) return "";
  return firstLeafUnder(categories, type, root).name;
}
