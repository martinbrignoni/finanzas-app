import * as XLSX from "xlsx";
import { fromMinor } from "./money";
import { formatDateDMY, todayISO } from "./dates";
import { monthlyRateOf, annualNominalRateOf, type AmortizationRow, type LoanSummary } from "./mortgage";
import type { MortgageLoan } from "../types";

/**
 * Exporta un préstamo hipotecario/personal completo a un Excel con:
 * - Parametros: los datos base del préstamo tal como están cargados en la app.
 * - Resumen: estado actual (a hoy), calculado por el mismo motor que usa la app.
 * - Cronograma: la tabla de amortización completa (histórico + proyectado).
 * - Amortizaciones: las amortizaciones extraordinarias ya registradas.
 * - Simulador: una hoja con FÓRMULAS vivas de Excel (no valores fijos) para
 *   simular UNA amortización extraordinaria futura más, sin tener que volver
 *   a esta app — reproduce el mismo cálculo que `lib/mortgage.ts`, ver el
 *   detalle de cada camino más abajo.
 *
 * Las hojas Parametros/Resumen/Cronograma/Amortizaciones son un volcado de
 * datos (fuente de verdad: el motor de cálculo de la app, `buildSchedule` +
 * `loanSummary`); la hoja Simulador es la única con fórmulas recalculables.
 */
export function exportMortgageLoanToExcel(loan: MortgageLoan, schedule: AmortizationRow[], summary: LoanSummary): void {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, buildParametrosSheet(loan), "Parametros");
  XLSX.utils.book_append_sheet(wb, buildResumenSheet(summary), "Resumen");
  XLSX.utils.book_append_sheet(wb, buildCronogramaSheet(schedule), "Cronograma");
  if (loan.prepayments.length > 0) {
    XLSX.utils.book_append_sheet(wb, buildAmortizacionesSheet(loan), "Amortizaciones");
  }
  XLSX.utils.book_append_sheet(wb, buildSimuladorSheet(loan, schedule, summary), "Simulador");

  const today = todayISO();
  const filename = `${loan.name.replace(/[^a-zA-Z0-9-_ ]/g, "")}_${today}.xlsx`;
  XLSX.writeFile(wb, filename);
}

const SYSTEM_LABELS: Record<string, string> = { frances: "Francés", aleman: "Alemán", americano: "Americano" };

function buildParametrosSheet(loan: MortgageLoan): XLSX.WorkSheet {
  const rows = [
    { Parámetro: "Nombre", Valor: loan.name },
    { Parámetro: "Moneda", Valor: loan.currency },
    { Parámetro: "Capital original", Valor: fromMinor(loan.principalMinor) },
    { Parámetro: "Tasa anual (%)", Valor: loan.annualRatePct },
    { Parámetro: "Tipo de tasa", Valor: (loan.rateType ?? "nominal") === "effective" ? "TEA (efectiva)" : "TNA (nominal)" },
    { Parámetro: "Plazo (meses)", Valor: loan.termMonths },
    { Parámetro: "Sistema de amortización", Valor: SYSTEM_LABELS[loan.system ?? "frances"] },
    { Parámetro: "Convención de días", Valor: (loan.dayCountConvention ?? "monthly") === "actual365" ? "Días corridos (año 365)" : "Meses iguales" },
    { Parámetro: "Fecha de la 1ª cuota", Valor: formatDateDMY(loan.startDate) },
    { Parámetro: "Fecha de solicitud/desembolso", Valor: loan.requestDate ? formatDateDMY(loan.requestDate) : "" },
    { Parámetro: "Cuotas de gracia", Valor: loan.gracePeriodMonths ?? 0 },
    { Parámetro: "Ajuste de cuota (reconciliación)", Valor: loan.paymentAdjustmentMinor ? fromMinor(loan.paymentAdjustmentMinor) : 0 },
    { Parámetro: "Nota", Valor: loan.note ?? "" },
  ];
  return XLSX.utils.json_to_sheet(rows);
}

function buildResumenSheet(summary: LoanSummary): XLSX.WorkSheet {
  const rows = [
    { Concepto: "Cuota actual", Valor: fromMinor(summary.currentPaymentMinor) },
    { Concepto: "Saldo de capital (a hoy)", Valor: fromMinor(summary.balanceMinor) },
    { Concepto: "Cuotas restantes", Valor: summary.remainingInstallments },
    { Concepto: "Total de cuotas (incl. liquidaciones de amortización)", Valor: summary.totalInstallments },
    { Concepto: "Próximo vencimiento", Valor: summary.nextDueDate ? formatDateDMY(summary.nextDueDate) : "" },
    { Concepto: "Interés total del préstamo (pagado + a pagar)", Valor: fromMinor(summary.totalInterestMinor) },
    { Concepto: "Amortizado extra (histórico)", Valor: fromMinor(summary.totalPrepaidMinor) },
    { Concepto: "Interés pendiente de vencer", Valor: fromMinor(summary.remainingInterestMinor) },
    { Concepto: "Capital pendiente de vencer", Valor: fromMinor(summary.remainingPrincipalMinor) },
    { Concepto: "¿Préstamo saldado?", Valor: summary.isPaidOff ? "Sí" : "No" },
    { Concepto: "Generado el", Valor: formatDateDMY(todayISO()) },
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 42 }, { wch: 16 }];
  return ws;
}

function buildCronogramaSheet(schedule: AmortizationRow[]): XLSX.WorkSheet {
  const today = todayISO();
  const rows = schedule.map((r) => ({
    "N°": r.isPrepaymentSettlement ? "" : r.number,
    Vence: formatDateDMY(r.dueDate),
    Cuota: fromMinor(r.paymentMinor),
    Interés: fromMinor(r.interestMinor),
    Capital: fromMinor(r.principalMinor),
    "Amortización extra": r.extraPaymentMinor ? fromMinor(r.extraPaymentMinor) : "",
    Saldo: fromMinor(r.balanceMinor),
    Tipo: r.isPrepaymentSettlement ? "Liquidación de amortización" : r.isGrace ? "Gracia" : "Regular",
    "¿Vencida?": r.dueDate < today ? "Sí" : "No",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 6 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 24 }, { wch: 10 }];
  return ws;
}

function buildAmortizacionesSheet(loan: MortgageLoan): XLSX.WorkSheet {
  const sorted = [...loan.prepayments].sort((a, b) => a.date.localeCompare(b.date));
  const rows = sorted.map((p) => ({
    Fecha: formatDateDMY(p.date),
    Monto: fromMinor(p.amountMinor),
    Estrategia: p.strategy === "reduceInstallment" ? "Bajar cuota (mantiene plazo)" : "Bajar plazo (mantiene cuota)",
    Nota: p.note ?? "",
  }));
  return XLSX.utils.json_to_sheet(rows);
}

/** Formato de moneda genérico (sirve igual para UYU, USD o UI: la cifra es la misma, solo cambia lo que dice al lado). */
const MONEY_FMT = "#,##0.00";
const PCT_FMT = "0.000000%";
const DATE_FMT = "dd/mm/yyyy";

function setCell(ws: XLSX.WorkSheet, addr: string, value: unknown, opts?: { f?: string; z?: string; t?: XLSX.ExcelDataType }) {
  const cell: XLSX.CellObject = { v: value as string | number | boolean } as XLSX.CellObject;
  if (opts?.t) cell.t = opts.t;
  else if (value instanceof Date) cell.t = "d";
  else if (typeof value === "number") cell.t = "n";
  else cell.t = "s";
  if (opts?.f) cell.f = opts.f;
  if (opts?.z) cell.z = opts.z;
  ws[addr] = cell;
}

/**
 * Hoja "Simulador": a diferencia del resto (volcado de datos), ésta tiene
 * fórmulas VIVAS de Excel para poder simular una amortización extraordinaria
 * futura más sin volver a la app. Reproduce, con fórmulas, exactamente el
 * mismo cálculo que hace `lib/mortgage.ts`:
 *
 * - Sistema francés + días corridos (el caso real validado contra los vales
 *   de Santander): la cuota nueva ("bajar cuota") no tiene una fórmula de una
 *   sola celda porque cada período tiene una cantidad de días distinta — se
 *   arma una tabla auxiliar con `EDATE` (igual que en los modelos Excel
 *   previos ya validados) que calcula, período a período, el factor
 *   `1+(TNA/365)×días` y sus productos acumulados, y de ahí sale la fórmula
 *   cerrada `cuota = saldo × Π(factor) / Σ(productos parciales)`.
 * - Sistema francés + meses iguales: es la anualidad clásica, una sola
 *   fórmula (`saldo×i/(1-(1+i)^-n)`), sin tabla auxiliar.
 * - Alemán: amortización de capital fija = saldo/n; no depende de días.
 * - Americano: no hay distinción bajar-cuota/bajar-plazo (el capital vence
 *   entero al final); solo se recalcula el interés del próximo período.
 *
 * En todos los casos, "bajar plazo" (mantener la cuota, recalcular cuántas
 * cuotas faltan) usa la fórmula de logaritmos de la anualidad clásica —con
 * días corridos es una aproximación (asume meses iguales para estimar el
 * plazo), igual que hace `monthsForPayment` en el código de la app.
 */
function buildSimuladorSheet(loan: MortgageLoan, schedule: AmortizationRow[], summary: LoanSummary): XLSX.WorkSheet {
  const system = loan.system ?? "frances";
  const isActual365 = system === "frances" && (loan.dayCountConvention ?? "monthly") === "actual365";
  const i = monthlyRateOf(loan);
  const tna = annualNominalRateOf(loan);
  const nextRegular = schedule.find((r) => !r.isPrepaymentSettlement && r.dueDate >= todayISO());
  const germanFixedPortion = system === "aleman" ? fromMinor(nextRegular?.principalMinor ?? 0) : 0;

  const header: (string | number | null)[][] = [
    ["SIMULADOR — una amortización extraordinaria futura más"],
    ["Datos calculados por la app al momento de exportar (no se actualizan solos; volvé a descargar el Excel si cambian)."],
    [],
    ["Sistema", SYSTEM_LABELS[system]],
    ["Convención de días", isActual365 ? "Días corridos (año 365)" : "Meses iguales"],
    ["Moneda", loan.currency],
    ["Tasa mensual equivalente (i)", i],
    ["TNA equivalente (solo se usa con días corridos)", tna],
    ["Cuota actual", fromMinor(summary.currentPaymentMinor)],
    ["Saldo de capital a hoy", fromMinor(summary.balanceMinor)],
    ["Cuotas restantes a hoy", summary.remainingInstallments],
    ["Próximo vencimiento", summary.nextDueDate ? formatDateDMY(summary.nextDueDate) : ""],
    ["Amortización de capital fija actual (solo sistema alemán)", germanFixedPortion],
    [],
    ["COMPLETÁ ACÁ LA AMORTIZACIÓN HIPOTÉTICA (celdas en amarillo) →"],
    ["Fecha de la amortización", null], // B13
    ["Saldo de capital A ESA FECHA, antes de amortizar (mirá la hoja Cronograma, columna Saldo)", null], // B14
    ["Cuotas que quedarían desde esa fecha si NO amortizás (mirá Cronograma)", null], // B15
    ["Monto a amortizar", null], // B16
    [],
    ["Saldo nuevo (después de amortizar)", null], // B18
    [],
    ["RESULTADO — Bajar cuota (mantiene el plazo de la fila anterior)"],
    [isActual365 ? "Cuota nueva (días corridos, exacta)" : system === "aleman" ? "Amortización de capital fija nueva" : "Cuota nueva"],
    [],
    ["RESULTADO — Bajar plazo (mantiene la cuota actual)"],
    [system === "americano" ? "No aplica: el capital vence entero al final; la amortización solo baja el saldo y el interés de ahí en más." : "Plazo nuevo (meses, redondeado hacia arriba)"],
  ];

  const ws = XLSX.utils.aoa_to_sheet(header);
  ws["!cols"] = [{ wch: 62 }, { wch: 18 }];

  // NOTA: aoa_to_sheet numera filas 1-based igual que Excel: la fila del
  // array en índice k (0-based) queda en la fila k+1 de la hoja.
  setCell(ws, "B4", SYSTEM_LABELS[system]);
  setCell(ws, "B7", i, { z: PCT_FMT });
  setCell(ws, "B8", tna, { z: PCT_FMT });
  setCell(ws, "B9", fromMinor(summary.currentPaymentMinor), { z: MONEY_FMT });
  setCell(ws, "B10", fromMinor(summary.balanceMinor), { z: MONEY_FMT });
  setCell(ws, "B13", germanFixedPortion, { z: MONEY_FMT });

  const nextDueDateSerial = summary.nextDueDate ? isoToExcelSerial(summary.nextDueDate) : isoToExcelSerial(todayISO());
  setCell(ws, "B16", nextDueDateSerial, { z: DATE_FMT }); // Fecha de la amortización
  setCell(ws, "B17", fromMinor(summary.balanceMinor), { z: MONEY_FMT }); // Saldo a esa fecha (prefill = saldo a hoy)
  setCell(ws, "B18", summary.remainingInstallments, { z: "0" }); // Cuotas restantes desde esa fecha
  setCell(ws, "B19", 0, { z: MONEY_FMT }); // Monto a amortizar

  setCell(ws, "B21", 0, { z: MONEY_FMT, f: "B17-B19" }); // Saldo nuevo

  if (isActual365) {
    // --- Tabla auxiliar de días corridos (solo francés + actual365) ---
    // Fila 30 = ancla (k=0, la fecha de la amortización); filas 31..510 = k=1..480.
    const ANCHOR_ROW = 30;
    const FIRST_ROW = 31;
    const N = 480; // 40 años de margen: de sobra para cualquier plazo real.
    const LAST_ROW = FIRST_ROW + N - 1;

    setCell(ws, `A${ANCHOR_ROW}`, 0);
    setCell(ws, `B${ANCHOR_ROW}`, 0, { f: "B16", z: DATE_FMT });
    setCell(ws, `E${ANCHOR_ROW}`, 1);

    setCell(ws, "A28", "Tabla auxiliar (días corridos) — no tocar, la usan las fórmulas de arriba:");
    setCell(ws, "A29", "k");
    setCell(ws, "B29", "Fecha de vencimiento");
    setCell(ws, "C29", "Días del período");
    setCell(ws, "D29", "Factor (1+TNA/365×días)");
    setCell(ws, "E29", "Producto acumulado");
    setCell(ws, "F29", "Auxiliar (producto de factores posteriores)");

    for (let r = FIRST_ROW; r <= LAST_ROW; r++) {
      const prev = r - 1;
      setCell(ws, `A${r}`, 0, { f: `A${prev}+1` });
      setCell(ws, `B${r}`, 0, { f: `EDATE($B$16,A${r})`, z: DATE_FMT });
      setCell(ws, `C${r}`, 0, { f: `B${r}-B${prev}` });
      setCell(ws, `D${r}`, 0, { f: `1+($B$8/365)*C${r}` });
      setCell(ws, `E${r}`, 0, { f: `E${prev}*D${r}` });
      const isLast = r === LAST_ROW;
      setCell(ws, `F${r}`, 0, { f: isLast ? "1" : `IF(A${r}>=$B$18,1,F${r + 1}*D${r + 1})` });
    }

    setCell(ws, "B24", 0, {
      z: MONEY_FMT,
      f: `$B$21*INDEX($E$${FIRST_ROW}:$E$${LAST_ROW},$B$18)/SUMPRODUCT(($A$${FIRST_ROW}:$A$${LAST_ROW}<=$B$18)*$F$${FIRST_ROW}:$F$${LAST_ROW})`,
    });
    setCell(ws, "B27", 0, {
      z: "0",
      f: "ROUNDUP(-LN(1-B21*$B$7/$B$9)/LN(1+$B$7),0)",
    });
  } else if (system === "aleman") {
    setCell(ws, "B24", 0, { z: MONEY_FMT, f: "B21/B18" });
    setCell(ws, "B27", 0, { z: "0", f: "ROUNDUP(B21/$B$13,0)" });
  } else if (system === "americano") {
    setCell(ws, "B24", 0, { z: MONEY_FMT, f: "B21*$B$7" });
    // B27 queda como texto informativo (ya seteado en el header), sin fórmula.
  } else {
    // Francés, meses iguales: anualidad clásica de una sola fórmula.
    setCell(ws, "B24", 0, { z: MONEY_FMT, f: "B21*$B$7/(1-(1+$B$7)^-B18)" });
    setCell(ws, "B27", 0, { z: "0", f: "ROUNDUP(-LN(1-B21*$B$7/$B$9)/LN(1+$B$7),0)" });
  }

  // Referencia del rango usado (ayuda a Excel a recalcular bien el área con fórmulas).
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 520, c: 6 } });

  return ws;
}

/**
 * Convierte una fecha YYYY-MM-DD al número de serie de Excel (días desde el
 * 30/12/1899, la misma referencia que usa Excel — de ahí sale el "bug" del
 * año bisiesto 1900 de Lotus 1-2-3, irrelevante para cualquier fecha real de
 * un préstamo). Se calcula con `Date.UTC` de los dos lados para que no
 * dependa de la zona horaria de quien genera el archivo: escribir la fecha
 * como un número (con formato de fecha) en vez de un objeto `Date` de JS
 * evita un bug real que apareció al validar esta hoja — un objeto `Date`
 * podía llegar a serializarse con una fracción de segundo de menos y quedar
 * al día anterior después de que Excel/LibreOffice lo redondeara con
 * `EDATE`, corriendo TODOS los vencimientos de la tabla auxiliar un día.
 */
function isoToExcelSerial(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}
