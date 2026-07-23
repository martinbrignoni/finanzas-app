import * as XLSX from "xlsx";
import { fromMinor } from "./money";
import { accountBalance } from "./accounts";
import { categoryFullPath } from "./categories";
import type { Bank, Account, Transaction, Transfer, CardPayment, ContactEntry, Category, Installment } from "../types";
import type { ExchangeRateRow } from "./exchangeRates";
import { contactEntryAccountImpact } from "./contacts";

/** Nombres de hoja de Excel: máx 31 caracteres, sin : \ / ? * [ ] */
function sheetName(raw: string): string {
  return raw.replace(/[:\\/?*[\]]/g, "-").slice(0, 31) || "Cuenta";
}

export function exportBankToExcel(
  bank: Bank,
  accounts: Account[],
  transactions: Transaction[],
  transfers: Transfer[] = [],
  cardPayments: CardPayment[] = [],
  contactEntries: ContactEntry[] = []
): void {
  const wb = XLSX.utils.book_new();

  const summary = accounts.map((acc) => ({
    Cuenta: acc.name,
    Moneda: acc.currency,
    "Saldo inicial": fromMinor(acc.initialBalanceMinor),
    "Saldo actual": fromMinor(accountBalance(acc, transactions, transfers, cardPayments, undefined, contactEntries)),
  }));
  const summarySheet = XLSX.utils.json_to_sheet(summary);
  XLSX.utils.book_append_sheet(wb, summarySheet, "Resumen");

  const usedNames = new Set<string>(["Resumen"]);
  accounts.forEach((acc) => {
    const accTx = transactions
      .filter((t) => t.accountId === acc.id)
      .map((t) => ({
        Fecha: t.date,
        Tipo: t.type === "ingreso" ? "Ingreso" : "Gasto",
        Categoría: t.category ?? "",
        Nota: t.note ?? "",
        Monto: fromMinor(t.amountMinor) * (t.type === "gasto" ? -1 : 1),
        Moneda: t.currency,
      }));

    const accTransfersOut = transfers
      .filter((tr) => tr.fromAccountId === acc.id)
      .map((tr) => ({
        Fecha: tr.date,
        Tipo: "Transferencia enviada",
        Categoría: "",
        Nota: tr.note ?? "",
        Monto: -fromMinor(tr.fromAmountMinor),
        Moneda: acc.currency,
      }));

    const accTransfersIn = transfers
      .filter((tr) => tr.toAccountId === acc.id)
      .map((tr) => ({
        Fecha: tr.date,
        Tipo: "Transferencia recibida",
        Categoría: "",
        Nota: tr.note ?? "",
        Monto: fromMinor(tr.toAmountMinor),
        Moneda: acc.currency,
      }));

    const accCardPayments = cardPayments
      .filter((p) => p.accountId === acc.id)
      .map((p) => ({
        Fecha: p.date,
        Tipo: "Pago tarjeta",
        Categoría: "",
        Nota: p.note ?? "",
        Monto: -fromMinor(p.amountMinor),
        Moneda: p.currency,
      }));

    const accContactEntries = contactEntries
      .filter((e) => e.accountId === acc.id)
      .map((e) => ({
        Fecha: e.date,
        Tipo: "Personas",
        Categoría: "",
        Nota: e.description,
        Monto: fromMinor(contactEntryAccountImpact(e)),
        Moneda: e.currency,
      }));

    const accRows = [...accTx, ...accTransfersOut, ...accTransfersIn, ...accCardPayments, ...accContactEntries].sort((a, b) => a.Fecha.localeCompare(b.Fecha));

    let name = sheetName(acc.name);
    let suffix = 2;
    while (usedNames.has(name)) {
      name = sheetName(`${acc.name} (${suffix})`);
      suffix++;
    }
    usedNames.add(name);

    const sheet = XLSX.utils.json_to_sheet(accRows.length ? accRows : [{ Fecha: "", Tipo: "", Categoría: "", Nota: "Sin movimientos", Monto: "", Moneda: "" }]);
    XLSX.utils.book_append_sheet(wb, sheet, name);
  });

  const today = new Date().toISOString().slice(0, 10);
  const filename = `${bank.name.replace(/[^a-zA-Z0-9-_ ]/g, "")}_${today}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Exporta todos los movimientos (gastos/ingresos y compras en cuotas) de una
 * categoría puntual a un Excel de una sola hoja, ordenados por fecha.
 */
export function exportCategoryToExcel(
  category: Category,
  categories: Category[],
  transactions: Transaction[],
  installments: Installment[]
): void {
  const fullPath = categoryFullPath(category, categories);

  const txRows = transactions
    .filter((t) => t.category === fullPath)
    .map((t) => ({
      Fecha: t.date,
      Tipo: t.type === "ingreso" ? "Ingreso" : "Gasto",
      Nota: t.note ?? "",
      Monto: fromMinor(t.amountMinor) * (t.type === "gasto" ? -1 : 1),
      Moneda: t.currency,
    }));

  const instRows = installments
    .filter((i) => i.category === fullPath)
    .map((i) => ({
      Fecha: i.date ?? `${i.startMonth}-01`,
      Tipo: `Compra en cuotas (${i.numInstallments})`,
      Nota: [i.description, i.note].filter(Boolean).join(" · "),
      Monto: -fromMinor(i.totalAmountMinor),
      Moneda: i.currency,
    }));

  const rows = [...txRows, ...instRows].sort((a, b) => a.Fecha.localeCompare(b.Fecha));

  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(
    rows.length ? rows : [{ Fecha: "", Tipo: "", Nota: "Sin movimientos", Monto: "", Moneda: "" }]
  );
  XLSX.utils.book_append_sheet(wb, sheet, sheetName(category.name));

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${category.name.replace(/[^a-zA-Z0-9-_ ]/g, "")}_movimientos_${today}.xlsx`);
}

/** Exporta el histórico completo de cotizaciones (una hoja por moneda) a un Excel. */
export function exportExchangeRatesToExcel(porMoneda: Record<string, ExchangeRateRow[]>): void {
  const wb = XLSX.utils.book_new();

  Object.entries(porMoneda).forEach(([moneda, filas]) => {
    const rows = filas.map((f) => ({
      "Fecha aplicable": f.rate_date,
      "Fecha publicación BCU": f.published_date,
      Venta: f.sell,
      "Arbitraje vs USD": f.arbitrage ?? "",
    }));
    const sheet = XLSX.utils.json_to_sheet(
      rows.length ? rows : [{ "Fecha aplicable": "", "Fecha publicación BCU": "", Venta: "", "Arbitraje vs USD": "" }]
    );
    XLSX.utils.book_append_sheet(wb, sheet, moneda.slice(0, 31));
  });

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Cotizaciones_BCU_${today}.xlsx`);
}
