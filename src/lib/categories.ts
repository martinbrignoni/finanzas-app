import type { Category, FinanceData } from "../types";

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

/**
 * Busca la categoría (objeto completo) a partir de un valor de `category` ya
 * guardado (el path completo, ver `categoryFullPath`). `undefined` si no hay
 * ninguna coincidencia (ej. se borró después de guardar el movimiento).
 */
export function findCategoryByPath(value: string | undefined, categories: Category[]): Category | undefined {
  if (!value) return undefined;
  return categories.find((c) => categoryFullPath(c, categories) === value);
}

/**
 * Si esta categoría (o cualquiera de sus categorías madre/intermedias arriba
 * en la jerarquía) tiene `allowFamilyMembers` activo, se hereda hacia abajo:
 * alcanza con activarlo en la madre o en una categoría intermedia para que ya
 * quede activo en todo lo que cuelgue de ella, sin tener que tildarlo
 * subcategoría por subcategoría.
 */
export function categoryAllowsFamilyMembers(category: Category, categories: Category[]): boolean {
  let current: Category | undefined = category;
  while (current) {
    if (current.allowFamilyMembers) return true;
    current = current.parentId ? categories.find((c) => c.id === current!.parentId) : undefined;
  }
  return false;
}

/**
 * Igual que `categoryAllowsFamilyMembers`, pero para `Category.trackOrders`
 * (MINUCHI > Ventas): alcanza con activarlo en la madre o en una categoría
 * intermedia para que ya quede activo en todo lo que cuelgue de ella.
 */
export function categoryTracksOrders(category: Category, categories: Category[]): boolean {
  let current: Category | undefined = category;
  while (current) {
    if (current.trackOrders) return true;
    current = current.parentId ? categories.find((c) => c.id === current!.parentId) : undefined;
  }
  return false;
}

/**
 * Igual que `categoryAllowsFamilyMembers`, pero para `Category.requiresVehicle`
 * (ej. Transporte): alcanza con activarlo en la madre o en una categoría
 * intermedia para que ya quede activo en todo lo que cuelgue de ella. También
 * es `true` si la categoría (o alguna madre) tiene `trackFuel` activo, porque
 * no tiene sentido registrar combustible sin saber de qué vehículo.
 */
export function categoryRequiresVehicle(category: Category, categories: Category[]): boolean {
  let current: Category | undefined = category;
  while (current) {
    if (current.requiresVehicle || current.trackFuel) return true;
    current = current.parentId ? categories.find((c) => c.id === current!.parentId) : undefined;
  }
  return false;
}

/**
 * Igual que `categoryAllowsFamilyMembers`, pero para `Category.trackFuel`
 * (ej. Combustible): alcanza con activarlo en la madre o en una categoría
 * intermedia para que ya quede activo en todo lo que cuelgue de ella.
 */
export function categoryTracksFuel(category: Category, categories: Category[]): boolean {
  let current: Category | undefined = category;
  while (current) {
    if (current.trackFuel) return true;
    current = current.parentId ? categories.find((c) => c.id === current!.parentId) : undefined;
  }
  return false;
}

/**
 * Nombre con el que se identifica el emprendimiento aparte "MINUCHI" (ver
 * Configuración → Categorías e Inicio): tiene su propia categoría madre de
 * ingreso y de gasto, para poder analizar sus números sin mezclarlos con las
 * finanzas personales, aunque comparta cuentas y tarjetas de la familia.
 */
export const MINUCHI_CATEGORY_NAME = "minuchi";

/** True si `cat` es la categoría madre "MINUCHI" (de ingreso o de gasto). */
export function isMinuchiRootCategory(cat: Category): boolean {
  return !cat.parentId && cat.name.trim().toLowerCase() === MINUCHI_CATEGORY_NAME;
}

/** Categoría madre de una categoría cualquiera, subiendo por `parentId` hasta el tope. */
export function categoryRoot(category: Category, categories: Category[]): Category {
  let current = category;
  while (current.parentId) {
    const parent = categories.find((c) => c.id === current.parentId);
    if (!parent) break;
    current = parent;
  }
  return current;
}

/**
 * True si el valor de `category` guardado en un movimiento o cuota (path
 * completo) cae bajo la categoría madre "MINUCHI". Se usa para no mezclar
 * esos movimientos en el resumen personal de Inicio (ver `Dashboard.tsx`).
 */
export function isMinuchiCategoryPath(value: string | undefined, categories: Category[]): boolean {
  if (!value) return false;
  const match = categories.find((c) => categoryFullPath(c, categories) === value);
  return !!match && isMinuchiRootCategory(categoryRoot(match, categories));
}

/** Scope elegido en el modal de Nuevo Movimiento: de quién es la plata (ver Transactions.tsx). */
export type MovementScope = "personal" | "minuchi";

/**
 * Recorta el árbol de categorías al scope elegido (Personal o MINUCHI) antes
 * de pasarlo al selector de categoría o al alta rápida de categoría desde el
 * modal de movimiento. "personal" deja afuera toda la rama MINUCHI (madre y
 * subcategorías); "minuchi" deja solo esa rama. Así queda una exclusión dura
 * en los dos sentidos: no se puede elegir por error una categoría del otro
 * lado.
 */
export function filterCategoriesByScope(categories: Category[], scope: MovementScope): Category[] {
  return categories.filter((c) => {
    const isMinuchi = isMinuchiRootCategory(categoryRoot(c, categories));
    return scope === "minuchi" ? isMinuchi : !isMinuchi;
  });
}

/**
 * Reescribe el `category` guardado en TODOS los registros que lo usan
 * (movimientos, cuotas, presupuestos, recurrentes, hipotecas y contactos)
 * cuando una categoría cambia de path, ya sea por renombrarla o por moverla
 * a otra madre. Con `exact`, solo cambia coincidencias exactas (para
 * reclasificar los movimientos de una categoría que se elimina).
 *
 * Antes cada acción actualizaba solo algunas colecciones, y mover una
 * categoría no actualizaba ninguna: sus movimientos quedaban huérfanos.
 */
export function remapCategoryInData<D extends CategoryHolders>(d: D, oldPath: string, newPath: string, exact = false): D {
  const remap = (v: string): string => (exact ? (v === oldPath ? newPath : v) : remapCategoryPath(v, oldPath, newPath));
  const remapOpt = <T extends { category?: string }>(x: T): T => {
    if (!x.category) return x;
    const next = remap(x.category);
    return next === x.category ? x : { ...x, category: next };
  };
  return {
    ...d,
    transactions: d.transactions.map(remapOpt),
    installments: d.installments.map(remapOpt),
    budgets: d.budgets.map((b) => {
      const next = remap(b.category);
      return next === b.category ? b : { ...b, category: next };
    }),
    recurringRules: d.recurringRules.map(remapOpt),
    contacts: d.contacts.map(remapOpt),
    mortgageLoans: d.mortgageLoans.map((m) => {
      if (!m.paymentCategory) return m;
      const next = remap(m.paymentCategory);
      return next === m.paymentCategory ? m : { ...m, paymentCategory: next };
    }),
  };
}

/** Path completo que tendría `category` si se la moviera bajo `newParentId`. */
export function categoryMovePaths(category: Category, categories: Category[], newParentId: string): { oldPath: string; newPath: string } {
  const oldPath = categoryFullPath(category, categories);
  const moved = categories.map((c) => (c.id === category.id ? { ...c, parentId: newParentId } : c));
  const newPath = categoryFullPath({ ...category, parentId: newParentId }, moved);
  return { oldPath, newPath };
}

/**
 * Repara movimientos que quedaron con un path de categoría que ya no existe
 * (por ejemplo, por mover una categoría antes de que existiera
 * `remapCategoryInData`). Solo reasigna cuando el último tramo del path
 * (el nombre de la categoría) coincide con UNA sola categoría existente;
 * si el nombre se repite en más de una rama, no toca nada para no adivinar.
 * Devuelve los datos reparados y cuántos registros se corrigieron.
 */
export function repairOrphanCategoryPaths<D extends CategoryHolders & { categories: Category[] }>(d: D): { data: D; repaired: number } {
  const existing = new Set(d.categories.map((c) => categoryFullPath(c, d.categories)));
  const byName = new Map<string, Category[]>();
  for (const c of d.categories) byName.set(c.name, [...(byName.get(c.name) ?? []), c]);

  const orphanPaths = new Set<string>();
  const collect = (v: string | undefined) => {
    if (v && !existing.has(v)) orphanPaths.add(v);
  };
  d.transactions.forEach((t) => collect(t.category));
  d.installments.forEach((i) => collect(i.category));
  d.budgets.forEach((b) => collect(b.category));
  d.recurringRules.forEach((r) => collect(r.category));
  d.contacts.forEach((c) => collect(c.category));
  d.mortgageLoans.forEach((m) => collect(m.paymentCategory));

  let data = d;
  let repaired = 0;
  for (const path of orphanPaths) {
    const leaf = path.split(" > ").pop()!.trim();
    const matches = byName.get(leaf) ?? [];
    if (matches.length !== 1) continue;
    const newPath = categoryFullPath(matches[0], d.categories);
    const before = data;
    data = remapCategoryInData(data, path, newPath, true);
    repaired += countChanged(before, data);
  }
  return { data, repaired };
}

function countChanged(a: CategoryHolders, b: CategoryHolders): number {
  const keys = ["transactions", "installments", "budgets", "recurringRules", "contacts", "mortgageLoans"] as const;
  let n = 0;
  for (const k of keys) {
    const xa = a[k] as unknown[];
    const xb = b[k] as unknown[];
    for (let i = 0; i < xa.length; i++) if (xa[i] !== xb[i]) n++;
  }
  return n;
}

type CategoryHolders = Pick<
  FinanceData,
  "transactions" | "installments" | "budgets" | "recurringRules" | "contacts" | "mortgageLoans"
>;
