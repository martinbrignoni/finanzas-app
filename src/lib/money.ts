import type { Currency } from "../types";

/**
 * Convierte un valor decimal ingresado por el usuario (ej. "1234.5") a unidades
 * mínimas enteras (ej. 123450). Todo cálculo interno debe operar sobre estos enteros.
 */
export function toMinor(decimalAmount: number): number {
  if (!Number.isFinite(decimalAmount)) return 0;
  return Math.round(decimalAmount * 100);
}

export function fromMinor(minorAmount: number): number {
  return minorAmount / 100;
}

const formatterCache = new Map<Currency, Intl.NumberFormat>();

function getFormatter(currency: Currency): Intl.NumberFormat {
  if (!formatterCache.has(currency)) {
    formatterCache.set(
      currency,
      new Intl.NumberFormat("es-UY", { maximumFractionDigits: 0 })
    );
  }
  return formatterCache.get(currency)!;
}

export function formatMoney(minorAmount: number, currency: Currency): string {
  const symbol = currency === "USD" ? "US$" : "$U";
  const value = Math.round(fromMinor(minorAmount));
  return `${symbol} ${getFormatter(currency).format(value)}`;
}

/** Parsea el string de un input numérico a unidades mínimas. Devuelve null si es inválido. */
export function parseAmountInput(raw: string): number | null {
  const n = parseFloat(raw.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return toMinor(n);
}
