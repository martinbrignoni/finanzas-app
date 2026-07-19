import { supabase } from "./supabaseClient";

export type ExchangeRateCurrency = "USD" | "EUR" | "ARS" | "BRL" | "UI" | "UR";

export interface ExchangeRateRow {
  currency: ExchangeRateCurrency;
  rate_date: string; // YYYY-MM-DD
  published_date: string;
  sell: number;
  arbitrage: number | null;
}

/**
 * Cotización aplicable para una fecha: la última fila con rate_date <= la
 * fecha pedida (por si esa fecha exacta no está cargada todavía, por ejemplo
 * un día futuro, o para UR que solo tiene un registro por mes).
 */
export async function fetchRateForDate(currency: ExchangeRateCurrency, date: string): Promise<ExchangeRateRow | null> {
  const { data, error } = await supabase
    .from("exchange_rates")
    .select("currency, rate_date, published_date, sell, arbitrage")
    .eq("currency", currency)
    .lte("rate_date", date)
    .order("rate_date", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0] as ExchangeRateRow;
}

/** Las cotizaciones más recientes (una fila por moneda), para mostrar de un vistazo. */
export async function fetchLatestRates(currencies: ExchangeRateCurrency[]): Promise<Record<string, ExchangeRateRow | null>> {
  const entries = await Promise.all(currencies.map(async (c) => [c, await fetchRateForDate(c, "9999-12-31")] as const));
  return Object.fromEntries(entries);
}

/** Histórico de una moneda, más reciente primero. */
export async function fetchRateHistory(currency: ExchangeRateCurrency, limit = 30): Promise<ExchangeRateRow[]> {
  const { data, error } = await supabase
    .from("exchange_rates")
    .select("currency, rate_date, published_date, sell, arbitrage")
    .eq("currency", currency)
    .order("rate_date", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as ExchangeRateRow[];
}

/**
 * Trae TODO el histórico guardado de una moneda (paginado, porque Supabase
 * limita cuántas filas devuelve por pedido). Pensado para exportar, no para
 * mostrar en pantalla.
 */
export async function fetchAllRateHistory(currency: ExchangeRateCurrency): Promise<ExchangeRateRow[]> {
  const PAGINA = 1000;
  const resultado: ExchangeRateRow[] = [];
  let desde = 0;
  while (true) {
    const { data, error } = await supabase
      .from("exchange_rates")
      .select("currency, rate_date, published_date, sell, arbitrage")
      .eq("currency", currency)
      .order("rate_date", { ascending: true })
      .range(desde, desde + PAGINA - 1);
    if (error || !data || data.length === 0) break;
    resultado.push(...(data as ExchangeRateRow[]));
    if (data.length < PAGINA) break;
    desde += PAGINA;
  }
  return resultado;
}

/** Todo el histórico guardado, de todas las monedas. */
export async function fetchAllRatesAllCurrencies(currencies: ExchangeRateCurrency[]): Promise<Record<string, ExchangeRateRow[]>> {
  const entries = await Promise.all(currencies.map(async (c) => [c, await fetchAllRateHistory(c)] as const));
  return Object.fromEntries(entries);
}
