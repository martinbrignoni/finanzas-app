import { CalendarClock, Plus } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { formatMoney } from "../../lib/money";
import { currentMonthKey, monthKeyOf, monthLabel, monthsBetween } from "../../lib/dates";
import type { FinanceData, Currency } from "../../types";

export function Dashboard({ data, canAddTransaction, onAdd }: { data: FinanceData; canAddTransaction: boolean; onAdd: () => void }) {
  const mk = currentMonthKey();
  const monthTx = data.transactions.filter((t) => monthKeyOf(t.date) === mk);

  const sums: Record<Currency, { in: number; out: number }> = {
    UYU: { in: 0, out: 0 },
    USD: { in: 0, out: 0 },
  };
  monthTx.forEach((t) => {
    const bucket = sums[t.currency];
    if (t.type === "ingreso") bucket.in += t.amountMinor;
    else bucket.out += t.amountMinor;
  });

  const dueThisMonth = data.installments
    .map((inst) => {
      const idx = monthsBetween(inst.startMonth, mk);
      if (idx < 0 || idx >= inst.numInstallments) return null;
      const card = data.cards.find((c) => c.id === inst.cardId);
      return { ...inst, cuotaNum: idx + 1, cardName: card ? card.name : "—" };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const cuotasSum: Record<Currency, number> = { UYU: 0, USD: 0 };
  dueThisMonth.forEach((d) => { cuotasSum[d.currency] += d.installmentAmountMinor; });

  const balance = (cur: Currency) => sums[cur].in - sums[cur].out - cuotasSum[cur];

  return (
    <div className="pb-24">
      <h2 className="text-xs uppercase tracking-widest mb-1" style={{ color: C.textFaint }}>Libro mayor · {monthLabel(mk)}</h2>
      <h1 className="text-2xl mb-4 font-display" style={{ color: C.text }}>Tu resumen del mes</h1>

      <div className="rounded-2xl overflow-hidden mb-5" style={{ border: `1px solid ${C.border}`, background: C.surface }}>
        <div className="grid grid-cols-2">
          {(["UYU", "USD"] as Currency[]).map((cur, i) => (
            <div key={cur} className="p-4" style={{ borderLeft: i === 1 ? `1px solid ${C.border}` : "none" }}>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="w-2 h-2 rounded-full" style={{ background: cur === "USD" ? C.usd : C.uyu }} />
                <span className="text-xs font-semibold" style={{ color: C.textMuted }}>{cur}</span>
              </div>
              <div className="text-xl font-mono font-semibold mb-3" style={{ color: balance(cur) >= 0 ? C.positive : C.negative }}>
                {formatMoney(balance(cur), cur)}
              </div>
              <div className="space-y-1 text-xs font-mono" style={{ color: C.textMuted }}>
                <div className="flex justify-between"><span>Ingresos</span><span style={{ color: C.positive }}>+{formatMoney(sums[cur].in, cur)}</span></div>
                <div className="flex justify-between"><span>Gastos</span><span style={{ color: C.negative }}>-{formatMoney(sums[cur].out, cur)}</span></div>
                {cuotasSum[cur] > 0 && <div className="flex justify-between"><span>Cuotas</span><span style={{ color: C.negative }}>-{formatMoney(cuotasSum[cur], cur)}</span></div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <h3 className="text-sm font-semibold mb-2" style={{ color: C.text }}>Vencimientos de este mes</h3>
      {dueThisMonth.length === 0 ? (
        <div className="rounded-xl p-4 text-sm mb-5" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textMuted }}>
          No tenés cuotas pendientes este mes.
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden mb-5" style={{ border: `1px solid ${C.border}` }}>
          {dueThisMonth.map((d, i) => (
            <div key={d.id} className="p-3 flex items-center justify-between" style={{ background: C.surface, borderTop: i ? `1px solid ${C.border}` : "none" }}>
              <div className="flex items-center gap-2">
                <CalendarClock size={16} color={C.textMuted} />
                <div>
                  <div className="text-sm" style={{ color: C.text }}>{d.description}</div>
                  <div className="text-xs" style={{ color: C.textFaint }}>{d.cardName} · cuota {d.cuotaNum}/{d.numInstallments}</div>
                </div>
              </div>
              <div className="font-mono text-sm" style={{ color: C.text }}>{formatMoney(d.installmentAmountMinor, d.currency)}</div>
            </div>
          ))}
        </div>
      )}

      {canAddTransaction && (
        <button
          onClick={onAdd}
          className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
          style={{ background: C.surface2, border: `1px dashed ${C.borderLight}`, color: C.textMuted }}
        >
          <Plus size={16} /> Registrar movimiento
        </button>
      )}
    </div>
  );
}
