import { useState } from "react";
import { RotateCcw, CreditCard as CreditCardIcon, Repeat, Building2 } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Select } from "../../components/ui";
import { formatMoney } from "../../lib/money";
import { currentMonthKey, monthKeyOf, monthLabel, monthsBetween, addMonths, capitalize, formatDateDMY } from "../../lib/dates";
import { cardLabel, cardsDueInMonth } from "../../lib/cards";
import { upcomingRecurringExpensesInMonth } from "../../lib/recurring";
import { mortgageDueInMonth, formatMortgageAmount } from "../../lib/mortgage";
import { isMinuchiRootCategory, isMinuchiCategoryPath, categoryDisplayName } from "../../lib/categories";
import type { FinanceData, Currency, Transaction } from "../../types";

/** Ventana de meses seleccionables: un año para atrás y un año para adelante del mes actual, más reciente primero. */
function selectableMonths(): string[] {
  const mk = currentMonthKey();
  return Array.from({ length: 25 }, (_, i) => addMonths(mk, 12 - i));
}

/** Una fila de "Vencimientos de este mes", ya sea de una tarjeta, un gasto recurrente o una cuota hipotecaria. */
interface DueRow {
  key: string;
  date: string;
  kind: "card" | "recurring" | "mortgage";
  title: string;
  subtitle: string;
  amountLabel: string;
}

/** Total por moneda, desglosado por categoría, para el resumen aparte de MINUCHI. */
interface MinuchiCategoryRow {
  label: string;
  UYU: number;
  USD: number;
}

/** Junta montos por nombre de categoría (ya resuelto a texto), sumando por moneda. */
function sumByCategory(txs: { category?: string; amountMinor: number; currency: Currency }[], categories: FinanceData["categories"]): MinuchiCategoryRow[] {
  const map = new Map<string, MinuchiCategoryRow>();
  txs.forEach((t) => {
    const label = categoryDisplayName(t.category, categories) || "Sin categorizar";
    const row = map.get(label) ?? { label, UYU: 0, USD: 0 };
    row[t.currency] += t.amountMinor;
    map.set(label, row);
  });
  return Array.from(map.values()).sort((a, b) => (b.UYU + b.USD) - (a.UYU + a.USD));
}

export function Dashboard({ data }: { data: FinanceData }) {
  const thisMonth = currentMonthKey();
  const [mk, setMk] = useState(thisMonth);
  const isCurrent = mk === thisMonth;
  const months = selectableMonths();
  const monthTx = data.transactions.filter((t) => monthKeyOf(t.date) === mk);

  // MINUCHI (el emprendimiento aparte, ver Configuración → Categorías) usa las
  // mismas cuentas/tarjetas de la casa, pero sus movimientos no cuentan como
  // ingreso/gasto propio: se sacan del resumen personal y se muestran en su
  // propia tarjeta más abajo, para no mezclar los números.
  const hasMinuchi = data.categories.some(isMinuchiRootCategory);
  const isMinuchiTx = (t: Transaction) => isMinuchiCategoryPath(t.category, data.categories);
  const personalTx = monthTx.filter((t) => !isMinuchiTx(t));
  const minuchiTx = monthTx.filter(isMinuchiTx);

  const sums: Record<Currency, { in: number; out: number }> = {
    UYU: { in: 0, out: 0 },
    USD: { in: 0, out: 0 },
  };
  personalTx.forEach((t) => {
    const bucket = sums[t.currency];
    if (t.type === "ingreso") bucket.in += t.amountMinor;
    else bucket.out += t.amountMinor;
  });

  const minuchiSums: Record<Currency, { in: number; out: number }> = {
    UYU: { in: 0, out: 0 },
    USD: { in: 0, out: 0 },
  };
  minuchiTx.forEach((t) => {
    const bucket = minuchiSums[t.currency];
    if (t.type === "ingreso") bucket.in += t.amountMinor;
    else bucket.out += t.amountMinor;
  });

  // Cuotas de tarjeta que vencen puntualmente este mes (para el resumen de
  // arriba: Ingresos/Gastos/Cuotas). Separado a propósito de "Vencimientos"
  // de abajo, que ahora muestra el saldo total de la tarjeta, no cuota por
  // cuota (ver `cardsDueInMonth`). Las cuotas de compras categorizadas como
  // MINUCHI van al gasto de MINUCHI, no al personal.
  const cuotasSum: Record<Currency, number> = { UYU: 0, USD: 0 };
  const minuchiCuotas: { category?: string; amountMinor: number; currency: Currency }[] = [];
  data.installments.forEach((inst) => {
    const idx = monthsBetween(inst.startMonth, mk);
    if (idx < 0 || idx >= inst.numInstallments) return;
    if (inst.category && isMinuchiCategoryPath(inst.category, data.categories)) {
      minuchiSums[inst.currency].out += inst.installmentAmountMinor;
      minuchiCuotas.push({ category: inst.category, amountMinor: inst.installmentAmountMinor, currency: inst.currency });
    } else {
      cuotasSum[inst.currency] += inst.installmentAmountMinor;
    }
  });

  const balance = (cur: Currency) => sums[cur].in - sums[cur].out - cuotasSum[cur];
  const minuchiIngresosPorCategoria = sumByCategory(minuchiTx.filter((t) => t.type === "ingreso"), data.categories);
  const minuchiGastosPorCategoria = sumByCategory([...minuchiTx.filter((t) => t.type === "gasto"), ...minuchiCuotas], data.categories);

  // --- Vencimientos de este mes: saldo de tarjetas que vencen, gastos
  // recurrentes que todavía no se cargaron, y cuota hipotecaria del período.
  // Cada uno desaparece solo una vez que el movimiento correspondiente queda
  // registrado en Movimientos (pago de tarjeta, gasto generado, o gasto
  // vinculado al préstamo) — ver los comentarios de cada función en lib/.
  const cardRows: DueRow[] = cardsDueInMonth(data.cards, data.installments, data.transactions, data.contactEntries, data.cardPayments, data.cardStatements, mk).map(
    (d) => {
      const card = data.cards.find((c) => c.id === d.cardId);
      return {
        key: `card-${d.cardId}-${d.currency}`,
        date: d.dueDate,
        kind: "card",
        title: cardLabel(card, data.banks),
        subtitle: `Saldo a pagar · vence ${formatDateDMY(d.dueDate)}`,
        amountLabel: formatMoney(d.amountMinor, d.currency),
      };
    }
  );

  const recurringRows: DueRow[] = upcomingRecurringExpensesInMonth(data.recurringRules, mk).map((r) => ({
    key: `recurring-${r.ruleId}-${r.date}`,
    date: r.date,
    kind: "recurring",
    title: r.label,
    subtitle: `Gasto recurrente · ${formatDateDMY(r.date)}`,
    amountLabel: formatMoney(r.amountMinor, r.currency),
  }));

  const mortgageRows: DueRow[] = mortgageDueInMonth(data.mortgageLoans, data.transactions, mk).map((m) => ({
    key: `mortgage-${m.loanId}`,
    date: m.dueDate,
    kind: "mortgage",
    title: m.loanName,
    subtitle: `Cuota hipotecaria · vence ${formatDateDMY(m.dueDate)}`,
    amountLabel: formatMortgageAmount(m.amountMinor, m.currency),
  }));

  const dueRows = [...cardRows, ...recurringRows, ...mortgageRows].sort((a, b) => a.date.localeCompare(b.date));

  const rowIcon = (kind: DueRow["kind"]) => {
    if (kind === "card") return <CreditCardIcon size={16} color={C.textMuted} />;
    if (kind === "recurring") return <Repeat size={16} color={C.textMuted} />;
    return <Building2 size={16} color={C.textMuted} />;
  };

  return (
    <div className="pb-24">
      <h2 className="text-xs uppercase tracking-widest mb-1" style={{ color: C.textFaint }}>Libro mayor</h2>
      <div className="flex items-center justify-between gap-2 mb-4">
        <h1 className="text-2xl font-display" style={{ color: C.text }}>{isCurrent ? "Tu resumen del mes" : capitalize(monthLabel(mk))}</h1>
        <div className="flex items-center gap-1.5 shrink-0">
          {!isCurrent && (
            <button onClick={() => setMk(thisMonth)} aria-label="Volver al mes actual" style={{ color: C.textFaint }}>
              <RotateCcw size={16} />
            </button>
          )}
          <div className="w-36">
            <Select aria-label="Filtrar por período" value={mk} onChange={(e) => setMk(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>{m === thisMonth ? "Mes actual" : capitalize(monthLabel(m))}</option>
              ))}
            </Select>
          </div>
        </div>
      </div>

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

      {hasMinuchi && (
        <div className="rounded-2xl overflow-hidden mb-5" style={{ border: `1px solid ${C.usd}55`, background: C.surface }}>
          <div className="p-4">
            <div className="flex items-baseline gap-1.5 mb-3">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.usd }}>MINUCHI</span>
              <span className="text-xs" style={{ color: C.textFaint }}>· emprendimiento aparte, no cuenta como tuyo arriba</span>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-1">
              {(["UYU", "USD"] as Currency[]).map((cur) => {
                const bucket = minuchiSums[cur];
                const result = bucket.in - bucket.out;
                if (bucket.in === 0 && bucket.out === 0) return <div key={cur} />;
                return (
                  <div key={cur}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2 h-2 rounded-full" style={{ background: cur === "USD" ? C.usd : C.uyu }} />
                      <span className="text-xs font-semibold" style={{ color: C.textMuted }}>{cur}</span>
                    </div>
                    <div className="text-lg font-mono font-semibold mb-2" style={{ color: result >= 0 ? C.positive : C.negative }}>
                      {formatMoney(result, cur)}
                    </div>
                    <div className="space-y-1 text-xs font-mono" style={{ color: C.textMuted }}>
                      <div className="flex justify-between"><span>Ingresos</span><span style={{ color: C.positive }}>+{formatMoney(bucket.in, cur)}</span></div>
                      <div className="flex justify-between"><span>Gastos</span><span style={{ color: C.negative }}>-{formatMoney(bucket.out, cur)}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>

            {minuchiIngresosPorCategoria.length === 0 && minuchiGastosPorCategoria.length === 0 ? (
              <p className="text-xs mt-1" style={{ color: C.textFaint }}>
                {isCurrent ? "Todavía no hay movimientos de MINUCHI este mes." : "No hubo movimientos de MINUCHI en este período."}
              </p>
            ) : (
              <div className="mt-3 pt-3 space-y-3" style={{ borderTop: `1px solid ${C.border}` }}>
                {([["Ingresos por categoría", minuchiIngresosPorCategoria, C.positive], ["Gastos por categoría", minuchiGastosPorCategoria, C.negative]] as [string, MinuchiCategoryRow[], string][]).map(
                  ([label, rows, color]) =>
                    rows.length > 0 && (
                      <div key={label}>
                        <div className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: C.textFaint }}>{label}</div>
                        <div className="space-y-1">
                          {rows.map((r) => (
                            <div key={r.label} className="flex items-center justify-between text-xs">
                              <span style={{ color: C.text }}>{r.label}</span>
                              <span className="font-mono" style={{ color }}>
                                {[r.UYU !== 0 ? formatMoney(r.UYU, "UYU") : null, r.USD !== 0 ? formatMoney(r.USD, "USD") : null].filter(Boolean).join(" · ")}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <h3 className="text-sm font-semibold mb-2" style={{ color: C.text }}>{isCurrent ? "Vencimientos de este mes" : `Vencimientos de ${monthLabel(mk)}`}</h3>
      {dueRows.length === 0 ? (
        <div className="rounded-xl p-4 text-sm mb-5" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textMuted }}>
          {isCurrent ? "No tenés vencimientos pendientes este mes." : "No hay vencimientos pendientes en este período."}
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden mb-5" style={{ border: `1px solid ${C.border}` }}>
          {dueRows.map((row, i) => (
            <div key={row.key} className="p-3 flex items-center justify-between" style={{ background: C.surface, borderTop: i ? `1px solid ${C.border}` : "none" }}>
              <div className="flex items-center gap-2">
                {rowIcon(row.kind)}
                <div>
                  <div className="text-sm" style={{ color: C.text }}>{row.title}</div>
                  <div className="text-xs" style={{ color: C.textFaint }}>{row.subtitle}</div>
                </div>
              </div>
              <div className="font-mono text-sm" style={{ color: C.negative }}>{row.amountLabel}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
