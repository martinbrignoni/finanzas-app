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

/**
 * Nombre para mostrar de una categoría ya guardada en un movimiento, cuota o
 * presupuesto (`category`, que siempre guarda el camino completo, ver
 * `categoryFullPath`). Muestra solo el nombre de la hoja (ej. "Ropa gorda")
 * cuando ese nombre no se repite en ninguna otra rama del mismo tipo; si hay
 * más de una categoría o subcategoría con el mismo nombre (ej. "Transporte"
 * bajo "Gastos domésticos" y bajo "Servicio doméstico"), muestra el camino
 * completo para poder distinguirlas. Si la categoría guardada ya no existe
 * (se borró después), devuelve el valor guardado tal cual.
 */
export function categoryDisplayName(value: string | undefined, categories: Category[]): string {
  if (!value) return "";
  const match = categories.find((c) => categoryFullPath(c, categories) === value);
  if (!match) return value;
  const sameName = categories.filter((c) => c.type === match.type && c.name.toLowerCase() === match.name.toLowerCase());
  return sameName.length > 1 ? value : match.name;
}

/**
 * Path completo de una categoría antes y después de renombrarla. Como
 * `category` en movimientos/cuotas/presupuestos guarda el camino completo (no
 * un id), cambiar el nombre de una categoría madre o intermedia deja
 * "huérfano" todo lo que tenga ese camino guardado (tanto la categoría
 * renombrada como sus subcategorías, que heredan el path). Ver
 * `remapCategoryPath` para reasignar esos valores ya guardados al nuevo path.
 */
export function categoryRenamePaths(cat: Category, categories: Category[], newName: string): { oldPath: string; newPath: string } {
  const oldPath = categoryFullPath(cat, categories);
  const renamedCategories = categories.map((c) => (c.id === cat.id ? { ...c, name: newName } : c));
  const newPath = categoryFullPath({ ...cat, name: newName }, renamedCategories);
  return { oldPath, newPath };
}

/**
 * Reescribe un valor de `category` ya guardado (en un movimiento, cuota o
 * presupuesto) si corresponde exactamente al path viejo, o a algo debajo de
 * él en el árbol (una subcategoría de la que se renombró), tras un cambio de
 * nombre. Si no tiene nada que ver con `oldPath`, lo deja intacto.
 */
export function remapCategoryPath(value: string, oldPath: string, newPath: string): string {
  if (value === oldPath) return newPath;
  if (value.startsWith(`${oldPath} > `)) return newPath + value.slice(oldPath.length);
  return value;
}
