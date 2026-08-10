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
      new Intl.NumberFormat("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    );
  }
  return formatterCache.get(currency)!;
}

export function formatMoney(minorAmount: number, currency: Currency): string {
  const symbol = currency === "USD" ? "US$" : "$U";
  const value = fromMinor(minorAmount);
  return `${symbol} ${getFormatter(currency).format(value)}`;
}

/** Parsea el string de un input numérico a unidades mínimas. Devuelve null si es inválido. */
export function parseAmountInput(raw: string): number | null {
  const n = parseFloat(raw.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return toMinor(n);
}

/**
 * Parsea un decimal simple (no es plata, no usa unidades mínimas), ej. litros
 * cargados o kilómetros de odómetro. Devuelve `null` si `raw` no está vacío
 * pero no es un número válido; `undefined` si `raw` está vacío (campo opcional
 * sin cargar). Ver `MovementModal` (campos de combustible).
 */
export function parseDecimal(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = parseFloat(trimmed.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Tasa básica de IVA en Uruguay (22%), usada solo para sugerir un monto editable en "¿IVA Compras/Ventas?" (Nuevo Movimiento y Recurrentes). */
export const IVA_TASA_BASICA = 0.22;

/** IVA contenido en un monto que ya lo incluye (extracción), redondeado a centésimos. */
export function ivaIncluidoEn(amountGross: number): number {
  return Math.round(((amountGross * IVA_TASA_BASICA) / (1 + IVA_TASA_BASICA)) * 100) / 100;
}
