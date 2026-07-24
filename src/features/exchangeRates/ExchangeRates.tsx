import { useEffect, useState } from "react";
import { RefreshCw, FileSpreadsheet } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Segment } from "../../components/ui";
import { formatDateDMY } from "../../lib/dates";
import { fetchLatestRates, fetchRateHistory, fetchAllRatesAllCurrencies, type ExchangeRateCurrency, type ExchangeRateRow } from "../../lib/exchangeRates";
import { exportExchangeRatesToExcel } from "../../lib/excelExport";

const MONEDAS: { id: ExchangeRateCurrency; label: string; decimals: number }[] = [
  { id: "USD", label: "Dólar (billete, venta)", decimals: 3 },
  { id: "EUR", label: "Euro", decimals: 2 },
  { id: "ARS", label: "Peso argentino", decimals: 3 },
  { id: "BRL", label: "Real", decimals: 2 },
  { id: "UI", label: "Unidad Indexada", decimals: 4 },
  { id: "UR", label: "Unidad Reajustable", decimals: 2 },
];

function fmt(n: number, decimals: number): string {
  return new Intl.NumberFormat("es-UY", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
}

export function ExchangeRates() {
  const [latest, setLatest] = useState<Record<string, ExchangeRateRow | null> | null>(null);
  const [selected, setSelected] = useState<ExchangeRateCurrency>("USD");
  const [historia, setHistoria] = useState<ExchangeRateRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const cargarTodo = () => {
    setLoading(true);
    fetchLatestRates(MONEDAS.map((m) => m.id))
      .then(setLatest)
      .finally(() => setLoading(false));
  };

  const exportar = async () => {
    setExporting(true);
    try {
      const porMoneda = await fetchAllRatesAllCurrencies(MONEDAS.map((m) => m.id));
      exportExchangeRatesToExcel(porMoneda);
    } finally {
      setExporting(false);
    }
  };

  useEffect(cargarTodo, []);

  useEffect(() => {
    setHistoria(null);
    fetchRateHistory(selected, 30).then(setHistoria);
  }, [selected]);

  return (
    <div className="pb-24">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xs uppercase tracking-widest" style={{ color: C.textFaint }}>Fuente: BCU</h2>
        <div className="flex items-center gap-3">
          <button onClick={exportar} aria-label="Exportar histórico a Excel" style={{ color: C.textFaint }} disabled={exporting}>
            <FileSpreadsheet size={15} className={exporting ? "animate-pulse" : ""} />
          </button>
          <button onClick={cargarTodo} aria-label="Actualizar" style={{ color: C.textFaint }} disabled={loading}>
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>
      <h1 className="text-2xl mb-4 font-display" style={{ color: C.text }}>Cotizaciones</h1>

      <div className="grid grid-cols-2 gap-2 mb-5">
        {MONEDAS.map((m) => {
          const row = latest?.[m.id];
          return (
            <button
              key={m.id}
              onClick={() => setSelected(m.id)}
              className="rounded-xl p-3 text-left"
              style={{
                background: C.surface,
                border: `1px solid ${selected === m.id ? C.usd : C.border}`,
              }}
            >
              <div className="text-[11px] mb-1" style={{ color: C.textMuted }}>{m.label}</div>
              {row ? (
                <>
                  <div className="font-mono text-base font-semibold" style={{ color: C.text }}>{fmt(row.sell, m.decimals)}</div>
                  {row.arbitrage != null && (
                    <>
                      <div className="text-[10px] font-mono" style={{ color: C.textFaint }}>arb. {fmt(row.arbitrage, 4)} vs USD</div>
                      <div className="text-[10px] font-mono" style={{ color: C.textFaint }}>1 USD = {fmt(1 / row.arbitrage, 2)} {m.id}</div>
                    </>
                  )}
                  <div className="text-[10px] mt-0.5" style={{ color: C.textFaint }}>
                    {m.id === "UR" ? "mes " : "al "}{formatDateDMY(row.rate_date)}
                  </div>
                </>
              ) : (
                <div className="text-xs" style={{ color: C.textFaint }}>{loading ? "Cargando..." : "Sin datos"}</div>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Segment
          value={selected}
          onChange={setSelected}
          options={MONEDAS.map((m) => ({ value: m.id, label: m.id }))}
        />
      </div>

      <h3 className="text-sm font-semibold mb-2" style={{ color: C.text }}>
        Histórico · {MONEDAS.find((m) => m.id === selected)?.label}
      </h3>
      {historia === null ? (
        <p className="text-xs" style={{ color: C.textFaint }}>Cargando...</p>
      ) : historia.length === 0 ? (
        <p className="text-xs" style={{ color: C.textFaint }}>Todavía no hay cotizaciones guardadas para esta moneda.</p>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
          {historia.map((row, i) => {
            const decimals = MONEDAS.find((m) => m.id === selected)?.decimals ?? 2;
            return (
              <div
                key={row.rate_date}
                className="px-3 py-2 text-sm"
                style={{ background: C.surface, borderTop: i ? `1px solid ${C.border}` : "none" }}
              >
                <div className="flex items-center justify-between">
                  <span style={{ color: C.textMuted }}>
                    {selected === "UR" ? formatDateDMY(row.rate_date).slice(3) : formatDateDMY(row.rate_date)}
                  </span>
                  <span className="font-mono" style={{ color: C.text }}>{fmt(row.sell, decimals)}</span>
                </div>
                {row.arbitrage != null && (
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-[10px] font-mono" style={{ color: C.textFaint }}>arb. {fmt(row.arbitrage, 4)} vs USD</span>
                    <span className="text-[10px] font-mono" style={{ color: C.textFaint }}>1 USD = {fmt(1 / row.arbitrage, 2)} {selected}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
