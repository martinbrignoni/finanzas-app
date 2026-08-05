import * as XLSX from "xlsx";
import { toMinor } from "./money";
import { daysBetween } from "./dates";
import type { AccountLedgerEntry } from "./accounts";

/**
 * Conciliación de cuentas contra un archivo externo (excel exportado de
 * homebanking, o uno armado a mano con los movimientos del período — no hace
 * falta que sea el estado de cuenta oficial y cerrado, sirve igual como
 * chequeo intermedio). El archivo puede traer varias cuentas/tarjetas, cada
 * una en su propia hoja identificada por nombre (ver
 * `Account.reconciliationSheetName`).
 *
 * Formato de cada hoja: una fila de encabezados y después una fila por
 * movimiento, con estas columnas (el orden no importa, se buscan por
 * nombre; si no se reconoce ningún encabezado, se usa el orden A, B, C):
 * - Fecha (cualquier formato de fecha reconocible por Excel, o texto tipo
 *   "05/08/2026").
 * - Descripción (texto libre, opcional).
 * - Monto (positivo = entra a la cuenta, negativo = sale) — o, en su
 *   defecto, dos columnas separadas "Débito" y "Crédito" (montos siempre
 *   positivos en cada una).
 */

export interface StatementLine {
  date: string; // YYYY-MM-DD
  description: string;
  /** Con signo: positivo = entra a la cuenta, negativo = sale. */
  amountMinor: number;
}

export interface ReconciliationMatch {
  ledgerEntry: AccountLedgerEntry;
  statementLine: StatementLine;
  /** Diferencia de días entre la fecha propia y la del archivo (0 = mismo día). */
  daysDiff: number;
}

export interface ReconciliationSuggestion {
  ledgerEntry: AccountLedgerEntry;
  statementLine: StatementLine;
  /** Monto del archivo menos el propio (con signo, en unidades mínimas). */
  amountDiffMinor: number;
  daysDiff: number;
}

export interface ReconciliationResult {
  matched: ReconciliationMatch[];
  suggested: ReconciliationSuggestion[];
  /** Movimientos cargados en la app que no aparecen en el archivo. */
  unmatchedInApp: AccountLedgerEntry[];
  /** Filas del archivo que no tienen un movimiento propio equivalente. */
  unmatchedInFile: StatementLine[];
}

const DATE_HEADERS = ["fecha", "date"];
const DESC_HEADERS = ["descripcion", "detalle", "concepto", "description", "glosa"];
// Columnas más débiles como pista de descripción: a veces la columna "Descripción"
// existe pero viene vacía en la práctica (visto en un export de BROU, donde el texto
// real del movimiento vive en "Tipo Movimiento" y no en "Descripción"). Se usan solo
// como respaldo, fila por fila, cuando la(s) columna(s) de mayor prioridad están
// vacías para esa fila puntual — no se elige una sola columna fija.
const DESC_FALLBACK_HEADERS = ["tipo movimiento", "tipo de movimiento", "movimiento"];
// Último recurso: un número de referencia es mejor que nada, pero se prueba después de todo lo demás.
const DESC_WEAK_HEADERS = ["referencia"];
const AMOUNT_HEADERS = ["monto", "importe", "amount", "valor"];
const DEBIT_HEADERS = ["debito", "debe", "egreso", "cargo", "debit"];
const CREDIT_HEADERS = ["credito", "haber", "ingreso", "abono", "credit"];

const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");

function normalizeHeader(h: unknown): string {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_RE, "");
}

function normalizeSheetName(name: string): string {
  return normalizeHeader(name);
}

/** Convierte una celda de fecha (Date de Excel, número serial, o texto DD/MM/AAAA) a YYYY-MM-DD. */
function parseFlexibleDate(raw: unknown): string | null {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, "0");
    const d = String(raw.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

/**
 * Convierte una celda de monto a unidades mínimas. `null` si no es un monto
 * válido. Admite negativos. Los exports de bancos uruguayos suelen traer el
 * importe como texto con formato "2.167,50" (punto = miles, coma = decimal),
 * a veces indistinguible de un texto con miles separados por coma y punto
 * decimal (formato US) si no se mira con cuidado — se detecta por patrón.
 */
function parseFlexibleAmount(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? toMinor(raw) : null;
  let s = String(raw ?? "").trim().replace(/\s/g, "");
  if (!s) return null;

  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    // Formato uruguayo/es: punto = separador de miles, coma = decimal (ej. "2.167,50", "1.500").
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    // Formato US: coma = separador de miles, punto = decimal (ej. "2,167.50").
    s = s.replace(/,/g, "");
  } else {
    // Sin separador de miles: una coma sola se interpreta como decimal (ej. "819,00").
    s = s.replace(",", ".");
  }

  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return toMinor(n);
}

interface HeaderLayout {
  headerRowIndex: number;
  dateCol: number;
  /** Columnas candidatas a descripción, en orden de preferencia — se usa la primera con contenido en cada fila. */
  descCols: number[];
  amountCol: number | null;
  debitCol: number | null;
  creditCol: number | null;
}

const HEADER_SCAN_ROWS = 40;

/**
 * Los exports de homebanking suelen traer un bloque de título/metadata
 * arriba de la tabla (nombre del titular, tipo de cuenta, moneda, período,
 * etc.) antes de la fila real de encabezados — y esa fila no siempre empieza
 * en la columna A. Se escanean las primeras filas buscando una que tenga
 * columnas reconocibles de fecha + (monto, o débito y crédito).
 */
function findHeaderLayout(grid: unknown[][]): HeaderLayout | null {
  for (let r = 0; r < Math.min(grid.length, HEADER_SCAN_ROWS); r++) {
    const row = grid[r];
    if (!row) continue;
    let dateCol = -1;
    let amountCol = -1;
    let debitCol = -1;
    let creditCol = -1;
    const primaryDescCols: number[] = [];
    const fallbackDescCols: number[] = [];
    const weakDescCols: number[] = [];
    for (let c = 0; c < row.length; c++) {
      const h = normalizeHeader(row[c]);
      if (!h) continue;
      if (dateCol === -1 && DATE_HEADERS.includes(h)) dateCol = c;
      else if (amountCol === -1 && AMOUNT_HEADERS.includes(h)) amountCol = c;
      else if (debitCol === -1 && DEBIT_HEADERS.includes(h)) debitCol = c;
      else if (creditCol === -1 && CREDIT_HEADERS.includes(h)) creditCol = c;
      else if (DESC_HEADERS.includes(h)) primaryDescCols.push(c);
      else if (DESC_FALLBACK_HEADERS.includes(h)) fallbackDescCols.push(c);
      else if (DESC_WEAK_HEADERS.includes(h)) weakDescCols.push(c);
    }
    if (dateCol !== -1 && (amountCol !== -1 || (debitCol !== -1 && creditCol !== -1))) {
      return {
        headerRowIndex: r,
        dateCol,
        descCols: [...primaryDescCols, ...fallbackDescCols, ...weakDescCols],
        amountCol: amountCol === -1 ? null : amountCol,
        debitCol: debitCol === -1 ? null : debitCol,
        creditCol: creditCol === -1 ? null : creditCol,
      };
    }
  }
  return null;
}

/**
 * Compras con tarjeta de débito suelen aparecer en el estado de cuenta como
 * dos líneas separadas el mismo día: el cargo y, a continuación, la
 * devolución de la reducción de IVA (Ley 17934 — "REDIVA", "REDUC. IVA LEY
 * 17934"). El usuario registra siempre el neto, así que se suman acá antes
 * de comparar: si no se hiciera esto, cada compra con IVA reducido aparecería
 * como "posible diferencia" más una línea suelta sin conciliar, en vez de
 * una sola línea que concilia limpio.
 */
const IVA_LAW_ADJUSTMENT_RE = /rediva|redu[c.]* ?iva|iva ley ?17934/i;

function mergeIvaLawAdjustments(lines: StatementLine[]): StatementLine[] {
  const result: StatementLine[] = [];
  for (const line of lines) {
    const prev = result[result.length - 1];
    if (prev && prev.date === line.date && IVA_LAW_ADJUSTMENT_RE.test(line.description) && !IVA_LAW_ADJUSTMENT_RE.test(prev.description)) {
      prev.amountMinor += line.amountMinor;
      continue;
    }
    result.push({ ...line });
  }
  return result;
}

/**
 * Lee la hoja `sheetName` (o la más parecida, si no hay coincidencia exacta)
 * de un archivo Excel/CSV y devuelve sus movimientos. Tira si el archivo no
 * tiene ninguna hoja parecida, o si no encuentra una fila de encabezados
 * usable en las primeras filas de la hoja.
 */
export async function parseReconciliationFile(file: File, sheetName: string): Promise<StatementLine[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

  const target = normalizeSheetName(sheetName);
  const actualName =
    workbook.SheetNames.find((n) => normalizeSheetName(n) === target) ??
    workbook.SheetNames.find((n) => normalizeSheetName(n).includes(target) || target.includes(normalizeSheetName(n)));

  if (!actualName) {
    throw new Error(
      `No encontré una hoja llamada "${sheetName}" en el archivo. Hojas disponibles: ${workbook.SheetNames.join(", ") || "(ninguna)"}.`
    );
  }

  const grid = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[actualName], { header: 1, defval: "", raw: true });
  const layout = findHeaderLayout(grid);
  if (!layout) {
    throw new Error(
      `No encontré una fila de encabezados reconocible en la hoja "${actualName}". Necesito al menos una columna de fecha y una de monto (o Débito/Crédito).`
    );
  }

  const lines: StatementLine[] = [];
  for (let r = layout.headerRowIndex + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    const date = parseFlexibleDate(row[layout.dateCol]);
    if (!date) continue; // fila sin fecha válida (ej. "SALDO ANTERIOR"/totales): se ignora

    let amountMinor: number | null = null;
    if (layout.amountCol !== null) {
      amountMinor = parseFlexibleAmount(row[layout.amountCol]);
    } else if (layout.debitCol !== null || layout.creditCol !== null) {
      const debit = layout.debitCol !== null ? parseFlexibleAmount(row[layout.debitCol]) : null;
      const credit = layout.creditCol !== null ? parseFlexibleAmount(row[layout.creditCol]) : null;
      if (debit !== null || credit !== null) {
        amountMinor = (credit !== null ? Math.abs(credit) : 0) - (debit !== null ? Math.abs(debit) : 0);
      }
    }
    if (amountMinor === null || amountMinor === 0) continue;

    let description = "";
    for (const c of layout.descCols) {
      const v = String(row[c] ?? "").trim();
      if (v) {
        description = v;
        break;
      }
    }
    lines.push({ date, description, amountMinor });
  }
  return mergeIvaLawAdjustments(lines);
}

const SUGGESTION_DATE_WINDOW_DAYS = 5;
const MATCH_DATE_WINDOW_DAYS = 15;

/**
 * Compara los movimientos propios (`ledgerEntries`, ya filtrados a los que
 * todavía no están conciliados) contra las filas del archivo (`lines`).
 *
 * 1) Concilian: mismo monto exacto Y mismo día exacto — sin nada para
 *    revisar, se dan por buenos solos.
 * 2) Sugerencias: todo lo que no calzó perfecto, para que el usuario decida.
 *    Se arma en dos niveles de confianza:
 *    a) Mismo monto exacto pero otro día (hasta `MATCH_DATE_WINDOW_DAYS` —
 *       el banco puede procesar un movimiento unos días después de la fecha
 *       real, sobre todo fin de mes/feriados): probablemente el mismo
 *       movimiento, pero como la fecha no coincide se muestra para que el
 *       usuario confirme (o corrija la fecha del suyo) en vez de asumirlo.
 *    b) Si no hay ninguno con el monto exacto, se busca el de monto más
 *       parecido dentro de `SUGGESTION_DATE_WINDOW_DAYS` — posible error de
 *       tipeo, redondeo, o algo para revisar y corregir a mano.
 * 3) El resto queda como "no concilia" en cada sentido: filas del archivo sin
 *    contraparte propia, y movimientos propios sin contraparte en el archivo.
 *
 * Es determinística y no muta nada (no marca `reconciledAt`; eso lo hace la
 * UI después de que el usuario confirma).
 */
export function reconcileAccount(ledgerEntries: AccountLedgerEntry[], lines: StatementLine[]): ReconciliationResult {
  const remainingEntries = ledgerEntries.filter((e) => !entryReconciledAt(e));
  const remainingLines = [...lines];

  const matched: ReconciliationMatch[] = [];
  const suggested: ReconciliationSuggestion[] = [];

  const removeEntry = (list: AccountLedgerEntry[], target: AccountLedgerEntry) => {
    const idx = list.indexOf(target);
    if (idx >= 0) list.splice(idx, 1);
  };
  const removeLine = (list: StatementLine[], target: StatementLine) => {
    const idx = list.indexOf(target);
    if (idx >= 0) list.splice(idx, 1);
  };

  // 1) Match exacto: mismo monto Y mismo día. Nada que revisar.
  for (const line of [...remainingLines]) {
    const best = remainingEntries.find((e) => e.amountMinor === line.amountMinor && daysBetween(e.date, line.date) === 0);
    if (!best) continue;
    matched.push({ ledgerEntry: best, statementLine: line, daysDiff: 0 });
    removeEntry(remainingEntries, best);
    removeLine(remainingLines, line);
  }

  // 2) Sugerencias: primero se prioriza el mismo monto exacto en otro día (más confiable);
  // si no hay, se busca el monto más parecido dentro de una ventana de fecha más chica.
  for (const line of [...remainingLines]) {
    const sameAmountCandidates = remainingEntries
      .filter((e) => e.amountMinor === line.amountMinor && Math.abs(daysBetween(e.date, line.date)) <= MATCH_DATE_WINDOW_DAYS)
      .sort((a, b) => Math.abs(daysBetween(a.date, line.date)) - Math.abs(daysBetween(b.date, line.date)));

    let best = sameAmountCandidates[0];
    let amountDiffMinor = 0;
    if (!best) {
      const closeAmountCandidates = remainingEntries
        .filter((e) => Math.abs(daysBetween(e.date, line.date)) <= SUGGESTION_DATE_WINDOW_DAYS)
        .sort((a, b) => Math.abs(a.amountMinor - line.amountMinor) - Math.abs(b.amountMinor - line.amountMinor));
      const candidate = closeAmountCandidates[0];
      if (!candidate) continue;
      const diff = line.amountMinor - candidate.amountMinor;
      const maxAmount = Math.max(Math.abs(candidate.amountMinor), Math.abs(line.amountMinor), 1);
      if (Math.abs(diff) / maxAmount > 0.5) continue; // demasiado distinto para ser un error menor, no sugerir
      best = candidate;
      amountDiffMinor = diff;
    }

    suggested.push({ ledgerEntry: best, statementLine: line, amountDiffMinor, daysDiff: Math.abs(daysBetween(best.date, line.date)) });
    removeEntry(remainingEntries, best);
    removeLine(remainingLines, line);
  }

  return { matched, suggested, unmatchedInApp: remainingEntries, unmatchedInFile: remainingLines };
}

/** `reconciledAt` del registro real detrás de un `AccountLedgerEntry` (vive en Transaction/Transfer/CardPayment/ContactEntry, no en el entry en sí). */
function entryReconciledAt(entry: AccountLedgerEntry): string | undefined {
  return entry.transaction?.reconciledAt ?? entry.transfer?.reconciledAt ?? entry.cardPayment?.reconciledAt ?? entry.contactEntry?.reconciledAt;
}
