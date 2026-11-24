import type { FinanceData } from "../types";
import { monthKeyOf } from "./dates";

/**
 * Fusión de tres vías para los datos de la app.
 *
 * Contexto: todos los datos viven en una sola fila de Supabase (un JSON). Si
 * dos dispositivos (o dos personas del hogar) editan a la vez, el que guarda
 * segundo no puede simplemente pisar la fila: perdería lo que guardó el otro.
 * Cuando el guardado detecta que la fila cambió desde la última vez que la
 * leímos (ver `SupabaseRepository.save`), combina:
 *
 *   - `base`:   lo último que este dispositivo sabe que había en el servidor
 *   - `local`:  lo que este dispositivo quiere guardar (base + sus cambios)
 *   - `remote`: lo que hay ahora en el servidor (base + cambios del otro)
 *
 * Regla general, campo por campo y registro por registro (por `id`):
 *   - Si solo cambió un lado, gana ese lado.
 *   - Si cambiaron los dos el mismo registro, se combinan sus campos; si
 *     chocan en el mismo campo, gana el local (es la edición más reciente).
 *   - Un borrado gana sobre "no tocar", pero NO sobre una edición del otro
 *     lado: nunca se pierde una modificación por un borrado concurrente.
 *
 * Es una función pura (sin efectos), testeada en merge.test.ts.
 */
export function mergeFinanceData(base: FinanceData, local: FinanceData, remote: FinanceData): FinanceData {
  const merged = mergeValue(base, local, remote) as FinanceData;
  return dedupeGeneratedItems(merged, base, remote);
}

type Json = unknown;
type WithId = { id: string };

function isPlainObject(v: Json): v is Record<string, Json> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isIdArray(v: Json): v is WithId[] {
  return Array.isArray(v) && v.every((x) => isPlainObject(x) && typeof x.id === "string");
}

export function deepEqual(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as Json[];
    if (a.length !== bb.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], bb[i])) return false;
    return true;
  }
  const ao = a as Record<string, Json>;
  const bo = b as Record<string, Json>;
  // Un campo con `undefined` equivale a que no exista (así se guarda en JSON).
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) if (!deepEqual(ao[k], bo[k])) return false;
  return true;
}

function mergeValue(base: Json, local: Json, remote: Json): Json {
  if (deepEqual(local, base)) return remote;
  if (deepEqual(remote, base)) return local;
  // Cambiaron los dos lados.
  if (isIdArray(local) && isIdArray(remote)) {
    return mergeById(isIdArray(base) ? base : [], local, remote);
  }
  if (isPlainObject(local) && isPlainObject(remote)) {
    const b = isPlainObject(base) ? base : {};
    const out: Record<string, Json> = {};
    const keys = new Set([...Object.keys(remote), ...Object.keys(local)]);
    for (const k of keys) {
      const v = mergeValue(b[k], local[k], remote[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  return local;
}

function mergeById(base: WithId[], local: WithId[], remote: WithId[]): WithId[] {
  const baseById = new Map(base.map((x) => [x.id, x]));
  const localById = new Map(local.map((x) => [x.id, x]));
  const remoteIds = new Set(remote.map((x) => x.id));
  const out: WithId[] = [];

  // Se respeta el orden del servidor y al final se agregan los nuevos locales.
  for (const r of remote) {
    const b = baseById.get(r.id);
    const l = localById.get(r.id);
    if (l) {
      out.push(mergeValue(b, l, r) as WithId);
    } else if (b) {
      // Lo borró este dispositivo. Si el otro lado no lo tocó, se borra; si
      // lo editó, se conserva su edición.
      if (!deepEqual(r, b)) out.push(r);
    } else {
      out.push(r); // Alta del otro lado.
    }
  }
  for (const l of local) {
    if (remoteIds.has(l.id)) continue;
    const b = baseById.get(l.id);
    if (!b) out.push(l); // Alta de este dispositivo.
    else if (!deepEqual(l, b)) out.push(l); // El otro lo borró, pero acá se editó: se conserva.
    // Si no, el otro lado lo borró y acá no se tocó: queda borrado.
  }
  return out;
}

/**
 * Los movimientos recurrentes, las cuotas de hipoteca y los recordatorios
 * periódicos se generan solos al abrir la app. Si dos dispositivos abren la
 * app casi a la vez, cada uno genera su copia (con distinto `id`) y la fusión
 * conservaría las dos. Acá se descarta la copia local cuando el servidor ya
 * trae una equivalente generada al mismo tiempo. Solo mira registros nuevos
 * de los dos lados (ausentes en `base`): nunca toca algo que ya existía.
 */
function dedupeGeneratedItems(data: FinanceData, base: FinanceData, remote: FinanceData): FinanceData {
  const dropLocalTwins = <T extends WithId>(
    items: T[],
    baseItems: T[] | undefined,
    remoteItems: T[] | undefined,
    keyOf: (x: T) => string | null
  ): T[] => {
    const baseIds = new Set((baseItems ?? []).map((x) => x.id));
    const remoteNew = (remoteItems ?? []).filter((x) => !baseIds.has(x.id));
    const remoteNewIds = new Set(remoteNew.map((x) => x.id));
    const remoteKeys = new Set(remoteNew.map(keyOf).filter((k): k is string => !!k));
    if (remoteKeys.size === 0) return items;
    return items.filter((x) => {
      if (baseIds.has(x.id) || remoteNewIds.has(x.id)) return true;
      const key = keyOf(x);
      return !key || !remoteKeys.has(key);
    });
  };

  return {
    ...data,
    transactions: dropLocalTwins(data.transactions ?? [], base.transactions, remote.transactions, (t) =>
      t.recurringRuleId
        ? `rec:${t.recurringRuleId}:${t.date}`
        : t.mortgageLoanId
          ? `mort:${t.mortgageLoanId}:${monthKeyOf(t.date)}`
          : null
    ),
    reminders: dropLocalTwins(data.reminders ?? [], base.reminders, remote.reminders, (r) =>
      r.reminderRuleId ? `rem:${r.reminderRuleId}:${r.date}` : null
    ),
  };
}
