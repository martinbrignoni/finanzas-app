import type { Category } from "../types";

/**
 * Identifica una categoría sin ambigüedad, aunque el mismo nombre se repita
 * en más de una rama (ej. "Transporte" puede existir tanto bajo "Gastos
 * domésticos" como bajo "Servicio doméstico": son categorías distintas y no
 * hay que confundirlas entre sí). Es el valor que se guarda en movimientos y
 * presupuestos (`category`), y el que hay que usar siempre para comparar o
 * buscar coincidencias, en vez del nombre de la hoja solo.
 */
export function categoryFullPath(category: Category, categories: Category[]): string {
  const names: string[] = [category.name];
  let current = category;
  while (current.parentId) {
    const parent = categories.find((c) => c.id === current.parentId);
    if (!parent) break;
    names.unshift(parent.name);
    current = parent;
  }
  return names.join(" > ");
}
