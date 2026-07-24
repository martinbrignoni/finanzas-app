export const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
export const MONTHS_ES_FULL = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const pad2 = (n: number) => String(n).padStart(2, "0");

export function capitalize(s: string): string {
  return s.replace(/^./, (c) => c.toUpperCase());
}

/** Convierte una fecha guardada como YYYY-MM-DD a DD/MM/AAAA para mostrarla. Fechas vacías o con otro formato quedan tal cual. */
export function formatDateDMY(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const [, y, m, d] = match;
  return `${d}/${m}/${y}`;
}

/**
 * Fecha de HOY en formato YYYY-MM-DD, según la hora local del dispositivo.
 * OJO: no usar `toISOString()` acá, porque convierte a UTC y en Uruguay
 * (UTC-3) eso adelanta la fecha en cualquier momento entre las 21:00 y la
 * medianoche local (a las 23:00 del 23/07 en Uruguay, en UTC ya son las
 * 02:00 del 24/07). Usamos los getters locales de `Date` para que la fecha
 * coincida siempre con la del calendario del usuario.
 */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Convierte una fecha y hora ISO completa a "DD/MM/AAAA HH:MM" para mostrarla. */
export function formatDateTimeDMY(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function monthKeyOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function monthLabel(mk: string): string {
  const [y, m] = mk.split("-").map(Number);
  return `${MONTHS_ES_FULL[m - 1]} ${y}`;
}

export function monthShortLabel(mk: string): string {
  const m = Number(mk.split("-")[1]);
  return MONTHS_ES[m - 1];
}

/** Cantidad de meses de diferencia entre dos claves YYYY-MM (to - from). */
export function monthsBetween(fromMk: string, toMk: string): number {
  const [fy, fm] = fromMk.split("-").map(Number);
  const [ty, tm] = toMk.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

export function addMonths(mk: string, n: number): string {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/**
 * Suma `n` meses a una fecha completa (YYYY-MM-DD) conservando el día,
 * salvo que ese mes tenga menos días (ej. 31/01 + 1 mes -> 28 o 29/02, el
 * último día de febrero, no marzo). Usado para las fechas de vencimiento de
 * cuotas de un préstamo, todas el mismo día del mes que la primera.
 */
export function addMonthsToDate(iso: string, n: number): string {
  const [y, m, day] = iso.split("-").map(Number);
  const target = new Date(y, m - 1 + n, 1);
  const lastDayOfTargetMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDayOfTargetMonth));
  return `${target.getFullYear()}-${pad2(target.getMonth() + 1)}-${pad2(target.getDate())}`;
}

/** Cantidad de días de diferencia entre dos fechas YYYY-MM-DD (`to` - `from`). Puede dar negativo si `to` es anterior. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / 86400000);
}
