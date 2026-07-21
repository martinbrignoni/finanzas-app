/**
 * Utilidades para mantener un orden manual persistente (subir/bajar con
 * flechas) sobre listas que no tienen un orden natural fijo, como los
 * bancos o las cajas en la sección Cuentas. El orden se guarda como un
 * array de ids en `FinanceData.sortOrders`; los ids que todavía no
 * aparecen ahí (elementos nuevos) se agregan al final, en el orden en que
 * ya venían.
 */

/** Devuelve `ids` reordenados según `order`, agregando al final los que falten en `order`. */
export function applyIdOrder(ids: string[], order: string[]): string[] {
  const set = new Set(ids);
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of order) {
    if (set.has(id) && !seen.has(id)) {
      ordered.push(id);
      seen.add(id);
    }
  }
  for (const id of ids) {
    if (!seen.has(id)) ordered.push(id);
  }
  return ordered;
}

/** Reordena un subconjunto (`group`) de elementos según el orden guardado, calculado sobre el universo completo (`allIds`). */
export function orderItems<T extends { id: string }>(group: T[], allIds: string[], order: string[]): T[] {
  const seq = applyIdOrder(allIds, order);
  const byId = new Map(group.map((i) => [i.id, i]));
  const ordered: T[] = [];
  for (const id of seq) {
    const item = byId.get(id);
    if (item) {
      ordered.push(item);
      byId.delete(id);
    }
  }
  for (const item of group) if (byId.has(item.id)) ordered.push(item);
  return ordered;
}

/**
 * Mueve un elemento una posición arriba/abajo dentro de su grupo (ej. las
 * cajas de un mismo banco) sin afectar el orden relativo de los demás
 * grupos, y devuelve el nuevo array completo de ids para guardar.
 */
export function moveWithinGroup<T extends { id: string }>(
  group: T[],
  allIds: string[],
  order: string[],
  id: string,
  dir: "up" | "down"
): string[] {
  const fullSeq = applyIdOrder(allIds, order);
  const groupSeq = orderItems(group, allIds, order).map((i) => i.id);
  const idx = groupSeq.indexOf(id);
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= groupSeq.length) return fullSeq;
  const idA = groupSeq[idx];
  const idB = groupSeq[swapIdx];
  const posA = fullSeq.indexOf(idA);
  const posB = fullSeq.indexOf(idB);
  const next = [...fullSeq];
  [next[posA], next[posB]] = [next[posB], next[posA]];
  return next;
}
