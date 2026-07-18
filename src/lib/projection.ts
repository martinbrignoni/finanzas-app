import { addMonths, currentMonthKey, monthLabel, monthShortLabel, monthKeyOf, monthsBetween } from "./dates";
import type { FinanceData, Currency } from "../types";

export interface ProjectionMonth {
  mk: string;
  label: string;
  shortLabel: string;
  UYU: number; // flujo neto proyectado, en unidades mínimas
  USD: number;
  cuotasUYU: number;
  cuotasUSD: number;
}

function average(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

/** Cuota (en unidades mínimas) que vence en el mes `targetMonth`, por moneda. */
export function installmentsDueInMonth(data: FinanceData, targetMonth: string): Record<Currency, number> {
  const dues: Record<Currency, number> = { UYU: 0, USD: 0 };
  data.installments.forEach((inst) => {
    const idx = monthsBetween(inst.startMonth, targetMonth);
    if (idx >= 0 && idx < inst.numInstallments) {
      dues[inst.currency] += inst.installmentAmountMinor;
    }
  });
  return dues;
}

export function buildProjection(data: FinanceData, monthsAhead = 6, lookbackMonths = 3): ProjectionMonth[] {
  const mk = currentMonthKey();
  const pastMonths = Array.from({ length: lookbackMonths }, (_, i) => addMonths(mk, -(i + 1)));

  const inSums: Record<Currency, number[]> = { UYU: [], USD: [] };
  const outSums: Record<Currency, number[]> = { UYU: [], USD: [] };

  pastMonths.forEach((pm) => {
    const tx = data.transactions.filter((t) => monthKeyOf(t.date) === pm);
    (["UYU", "USD"] as Currency[]).forEach((cur) => {
      inSums[cur].push(tx.filter((t) => t.currency === cur && t.type === "ingreso").reduce((s, t) => s + t.amountMinor, 0));
      outSums[cur].push(tx.filter((t) => t.currency === cur && t.type === "gasto").reduce((s, t) => s + t.amountMinor, 0));
    });
  });

  const avgIn: Record<Currency, number> = { UYU: average(inSums.UYU), USD: average(inSums.USD) };
  const avgOut: Record<Currency, number> = { UYU: average(outSums.UYU), USD: average(outSums.USD) };

  const months: ProjectionMonth[] = [];
  for (let i = 0; i < monthsAhead; i++) {
    const fm = addMonths(mk, i);
    const cuotas = installmentsDueInMonth(data, fm);
    months.push({
      mk: fm,
      label: monthLabel(fm),
      shortLabel: monthShortLabel(fm),
      UYU: Math.round(avgIn.UYU - avgOut.UYU - cuotas.UYU),
      USD: Math.round(avgIn.USD - avgOut.USD - cuotas.USD),
      cuotasUYU: cuotas.UYU,
      cuotasUSD: cuotas.USD,
    });
  }
  return months;
}
