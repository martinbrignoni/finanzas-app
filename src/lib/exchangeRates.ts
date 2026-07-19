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
