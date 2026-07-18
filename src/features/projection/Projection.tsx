import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { theme as C } from "../../styles/theme";
import { formatMoney } from "../../lib/money";
import { buildProjection, type ProjectionMonth } from "../../lib/projection";
import type { FinanceData, Currency } from "../../types";

function ProjectionChart({ title, dataKey, months }: { title: string; dataKey: Currency; months: ProjectionMonth[] }) {
  return (
    <div className="rounded-xl p-3 mb-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      <div className="text-xs font-semibold mb-2" style={{ color: C.textMuted }}>{title}</div>
      <div style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={months} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
            <XAxis dataKey="shortLabel" tick={{ fill: C.textFaint, fontSize: 11 }} axisLine={{ stroke: C.border }} tickLine={false} />
            <YAxis tick={{ fill: C.textFaint, fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: C.text }}
              formatter={(v: number) => [formatMoney(v, dataKey), "Flujo neto"]}
            />
            <Bar dataKey={dataKey} radius={[4, 4, 0, 0]} fill={dataKey === "USD" ? C.usd : C.uyu} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function Projection({ data }: { data: FinanceData }) {
  const months = useMemo(() => buildProjection(data, 6), [data]);
  const hasHistory = months.some((m) => m.UYU !== 0 || m.USD !== 0);

  return (
    <div className="pb-24">
      <h1 className="text-2xl mb-1 font-display" style={{ color: C.text }}>Proyección</h1>
      <p className="text-xs mb-4" style={{ color: C.textFaint }}>
        Próximos 6 meses, según tu promedio de los últimos 3 meses y tus cuotas pendientes.
      </p>

      {!hasHistory && (
        <div className="rounded-xl p-4 text-sm mb-4" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textMuted }}>
          Cargá algunos movimientos para que la proyección tenga datos de base.
        </div>
      )}

      <ProjectionChart title="Flujo neto proyectado · UYU" dataKey="UYU" months={months} />
      <ProjectionChart title="Flujo neto proyectado · USD" dataKey="USD" months={months} />

      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
        {months.map((m, i) => (
          <div key={m.mk} className="p-3 flex items-center justify-between text-xs" style={{ background: C.surface, borderTop: i ? `1px solid ${C.border}` : "none" }}>
            <span style={{ color: C.text }}>{m.label}</span>
            <div className="flex gap-3 font-mono">
              <span style={{ color: m.UYU >= 0 ? C.positive : C.negative }}>{formatMoney(m.UYU, "UYU")}</span>
              <span style={{ color: m.USD >= 0 ? C.positive : C.negative }}>{formatMoney(m.USD, "USD")}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
