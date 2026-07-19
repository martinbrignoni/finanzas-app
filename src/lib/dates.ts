export const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
export const MONTHS_ES_FULL = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const pad2 = (n: number) => String(n).padStart(2, "0");

export function capitalize(s: string): string {
  return s.replace(/^./, (c) => c.toUpperCase());
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
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
