import * as XLSX from "xlsx";
import { fromMinor } from "./money";
import { accountBalance } from "./accounts";
import type { Bank, Account, Transaction } from "../types";

/** Nombres de hoja de Excel: máx 31 caracteres, sin : \ / ? * [ ] */
function sheetName(raw: string): string {
  return raw.replace(/[:\\/?*[\]]/g, "-").slice(0, 31) || "Cuenta";
}

export function exportBankToExcel(bank: Bank, accounts: Account[], transactions: Transaction[]): void {
  const wb = XLSX.utils.book_new();

  const summary = accounts.map((acc) => ({
    Cuenta: acc.name,
    Moneda: acc.currency,
    "Saldo inicial": fromMinor(acc.initialBalanceMinor),
    "Saldo actual": fromMinor(accountBalance(acc, transactions)),
  }));
  const summarySheet = XLSX.utils.json_to_sheet(summary);
  XLSX.utils.book_append_sheet(wb, summarySheet, "Resumen");

  const usedNames = new Set<string>(["Resumen"]);
  accounts.forEach((acc) => {
    const accTx = transactions
      .filter((t) => t.accountId === acc.id)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((t) => ({
        Fecha: t.date,
        Tipo: t.type === "ingreso" ? "Ingreso" : "Gasto",
        Categoría: t.category,
        Nota: t.note ?? "",
        Monto: fromMinor(t.amountMinor) * (t.type === "gasto" ? -1 : 1),
        Moneda: t.currency,
      }));

    let name = sheetName(acc.name);
    let suffix = 2;
    while (usedNames.has(name)) {
      name = sheetName(`${acc.name} (${suffix})`);
      suffix++;
    }
    usedNames.add(name);

    const sheet = XLSX.utils.json_to_sheet(accTx.length ? accTx : [{ Fecha: "", Tipo: "", Categoría: "", Nota: "Sin movimientos", Monto: "", Moneda: "" }]);
    XLSX.utils.book_append_sheet(wb, sheet, name);
  });

  const today = new Date().toISOString().slice(0, 10);
  const filename = `${bank.name.replace(/[^a-zA-Z0-9-_ ]/g, "")}_${today}.xlsx`;
  XLSX.writeFile(wb, filename);
}
