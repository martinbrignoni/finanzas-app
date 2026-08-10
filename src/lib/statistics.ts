import type { FinanceData, MovementTimingKind } from "../types";
import { currentMonthKey, addMonths } from "./dates";

/**
 * Tipo de movimiento a efectos de estadísticas: además de gasto/ingreso, se
 * cuentan por separado las transferencias, pagos de tarjeta, compras en
 * cuotas y movimientos con personas (cada uno vive en su propia tabla, ver
 * `FinanceData`). Mismo vocabulario que `MovementTimingEntry.kind`.
 */
export type StatKind = MovementTimingKind;

export const STAT_KIND_LABELS: Record<StatKind, string> = {
  gasto: "Gasto",
  ingreso: "Ingreso",
  transferencia: "Transferencia",
  pagoTarjeta: "Pago de tarjeta",
  cuotas: "Compra en cuotas",
  personas: "Movimiento con persona",
};

export type StatPeriod = "mes" | "3meses" | "anio" | "todo";

export const STAT_PERIOD_LABELS: Record<StatPeriod, string> = {
  mes: "Este mes",
  "3meses": "Últimos 3 meses",
  anio: "Este año",
  todo: "Todo",
};

/** Fecha (YYYY-MM-DD) desde la que contar según el período elegido, o `undefined` para "todo" (sin piso). */
export function statPeriodFrom(period: StatPeriod): string | undefined {
  const mk = currentMonthKey();
  if (period === "mes") return `${mk}-01`;
  if (period === "3meses") return `${addMonths(mk, -2)}-01`;
  if (period === "anio") return `${mk.slice(0, 4)}-01-01`;
  return undefined;
}

export interface StatCount<T extends string | undefined = string> {
  key: T;
  /** Cantidad de movimientos, salvo en `byUserTimeSeconds`, donde son segundos (ver `formatDurationHM`). */
  count: number;
}

export interface StatisticsResult {
  /** Total de movimientos contados en el período (todas las tablas juntas). */
  totalCount: number;
  /** `key` es `AppUser.id`, o `undefined` para movimientos sin perfil registrado (cargados antes de que existiera `createdByUserId`). */
  byUser: StatCount<string | undefined>[];
  /** `key` es `Account.id`. Una transferencia o un pago de tarjeta pueden sumar a dos cuentas (origen y destino/pago). */
  byAccount: StatCount<string>[];
  /** `key` es `Card.id`. */
  byCard: StatCount<string>[];
  /** `key` es el path completo de la categoría (solo gastos/ingresos tienen categoría). */
  byCategory: StatCount<string>[];
  byKind: StatCount<StatKind>[];
  /** Tiempo con la app abierta y visible por perfil, en el período (ver `UsageSession`). `count` son segundos, no cantidad de bloques. */
  byUserTimeSeconds: StatCount<string | undefined>[];
  /** Suma de `byUserTimeSeconds`, en segundos. */
  totalTimeSeconds: number;
  /** Promedio de segundos entre abrir "Nuevo movimiento" y guardar (ver `MovementTimingEntry`), por perfil. `count` es el promedio en segundos. */
  avgCreateSecondsByUser: StatCount<string | undefined>[];
  /** Ídem, pero para ediciones (abrir "Editar" hasta guardar). */
  avgEditSecondsByUser: StatCount<string | undefined>[];
  /** Promedio general de `avgCreateSecondsByUser`, en segundos. */
  avgCreateSeconds: number;
  /** Promedio general de `avgEditSecondsByUser`, en segundos. */
  avgEditSeconds: number;
  /** Cantidad de movimientos nuevos con tiempo registrado en el período (el tamaño de muestra detrás de `avgCreateSeconds`). */
  createTimingCount: number;
  /** Cantidad de ediciones con tiempo registrado en el período. */
  editTimingCount: number;
}

/** "2 h 15 min", "45 min" o "0 min" — formato compacto para mostrar segundos acumulados. */
export function formatDurationHM(totalSeconds: number): string {
  const totalMinutes = Math.round(totalSeconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function bump<K>(map: Map<K, number>, key: K) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function toSortedArray<K extends string | undefined>(map: Map<K, number>): StatCount<K>[] {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || String(a.key ?? "").localeCompare(String(b.key ?? "")));
}

/** Promedio (redondeado) por clave a partir de sumas y cantidades acumuladas, ordenado de mayor a menor. */
function toAveragedArray<K extends string | undefined>(sums: Map<K, number>, counts: Map<K, number>): StatCount<K>[] {
  return [...sums.entries()]
    .map(([key, sum]) => ({ key, count: Math.round(sum / (counts.get(key) ?? 1)) }))
    .sort((a, b) => b.count - a.count || String(a.key ?? "").localeCompare(String(b.key ?? "")));
}

/**
 * Cuenta movimientos (gastos/ingresos, transferencias, pagos de tarjeta,
 * compras en cuotas y movimientos con personas) agrupados por perfil, cuenta,
 * tarjeta, categoría y tipo, y suma el tiempo con la app abierta por perfil
 * (ver `UsageSession`/`lib/usage.ts`), todo dentro de un período.
 */
export function computeStatistics(data: FinanceData, period: StatPeriod): StatisticsResult {
  const from = statPeriodFrom(period);
  const inRange = (date: string) => !from || date >= from;

  const byUser = new Map<string | undefined, number>();
  const byAccount = new Map<string, number>();
  const byCard = new Map<string, number>();
  const byCategory = new Map<string, number>();
  const byKind = new Map<StatKind, number>();
  let totalCount = 0;

  const count = (
    date: string | undefined,
    createdByUserId: string | undefined,
    kind: StatKind,
    accountIds: (string | undefined)[],
    cardIds: (string | undefined)[],
    category?: string
  ) => {
    if (!date || !inRange(date)) return;
    totalCount++;
    bump(byUser, createdByUserId);
    bump(byKind, kind);
    for (const a of accountIds) if (a) bump(byAccount, a);
    for (const c of cardIds) if (c) bump(byCard, c);
    if (category) bump(byCategory, category);
  };

  for (const t of data.transactions) {
    count(t.date, t.createdByUserId, t.type, [t.accountId], [t.cardId], t.category);
  }
  for (const t of data.transfers) {
    count(t.date, t.createdByUserId, "transferencia", [t.fromAccountId, t.toAccountId], []);
  }
  for (const p of data.cardPayments) {
    count(p.date, p.createdByUserId, "pagoTarjeta", [p.accountId], [p.cardId]);
  }
  for (const i of data.installments) {
    // Las cuotas cargadas antes de unificarse con Nuevo movimiento no tienen `date`; usamos el primer día de `startMonth` para no perderlas del conteo.
    count(i.date ?? `${i.startMonth}-01`, i.createdByUserId, "cuotas", [], [i.cardId]);
  }
  for (const e of data.contactEntries) {
    count(e.date, e.createdByUserId, "personas", [e.accountId], [e.cardId]);
  }

  const byUserTime = new Map<string | undefined, number>();
  let totalTimeSeconds = 0;
  for (const s of data.usageSessions) {
    if (!inRange(s.date)) continue;
    byUserTime.set(s.userId, (byUserTime.get(s.userId) ?? 0) + s.durationSeconds);
    totalTimeSeconds += s.durationSeconds;
  }

  // Tiempo de cargar/editar cada movimiento puntual (ver `MovementTimingEntry`).
  const createSum = new Map<string | undefined, number>();
  const createN = new Map<string | undefined, number>();
  const editSum = new Map<string | undefined, number>();
  const editN = new Map<string | undefined, number>();
  let createTotalSum = 0;
  let createTimingCount = 0;
  let editTotalSum = 0;
  let editTimingCount = 0;
  for (const timing of data.movementTimings) {
    if (!inRange(timing.date)) continue;
    const sumMap = timing.action === "create" ? createSum : editSum;
    const nMap = timing.action === "create" ? createN : editN;
    sumMap.set(timing.userId, (sumMap.get(timing.userId) ?? 0) + timing.seconds);
    nMap.set(timing.userId, (nMap.get(timing.userId) ?? 0) + 1);
    if (timing.action === "create") {
      createTotalSum += timing.seconds;
      createTimingCount++;
    } else {
      editTotalSum += timing.seconds;
      editTimingCount++;
    }
  }

  return {
    totalCount,
    byUser: toSortedArray(byUser),
    byAccount: toSortedArray(byAccount),
    byCard: toSortedArray(byCard),
    byCategory: toSortedArray(byCategory),
    byKind: toSortedArray(byKind),
    byUserTimeSeconds: toSortedArray(byUserTime),
    totalTimeSeconds,
    avgCreateSecondsByUser: toAveragedArray(createSum, createN),
    avgEditSecondsByUser: toAveragedArray(editSum, editN),
    avgCreateSeconds: createTimingCount > 0 ? Math.round(createTotalSum / createTimingCount) : 0,
    avgEditSeconds: editTimingCount > 0 ? Math.round(editTotalSum / editTimingCount) : 0,
    createTimingCount,
    editTimingCount,
  };
}
