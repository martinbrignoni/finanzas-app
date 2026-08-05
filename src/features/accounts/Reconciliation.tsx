import { useMemo, useRef, useState } from "react";
import { Upload, Download, Check, ChevronDown, ChevronUp, AlertTriangle, Pencil } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Modal, PrimaryButton, Segment, Field, IconBtn } from "../../components/ui";
import { formatMoney } from "../../lib/money";
import { formatDateDMY, formatDateTimeDMY, todayISO } from "../../lib/dates";
import { parseReconciliationFile, reconcileAccount, type ReconciliationResult, type StatementLine } from "../../lib/reconciliation";
import { type AccountLedgerEntry, ledgerEntryLabel } from "../../lib/accounts";
import { canEditOwnRecord } from "../../lib/permissions";
import { exportReconciliationToExcel } from "../../lib/excelExport";
import type { Account, AppUser, Card, Contact, Transaction, Transfer, CardPayment } from "../../types";

function EntryRow({
  label,
  date,
  amountMinor,
  currency,
  onEdit,
}: {
  label: string;
  date: string;
  amountMinor: number;
  currency: Account["currency"];
  /** Si el movimiento se puede editar, abre el modal correspondiente (transacción/transferencia/pago de tarjeta) desde acá mismo. */
  onEdit?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <div className="min-w-0">
        <div className="truncate" style={{ color: C.text }}>{label}</div>
        <div style={{ color: C.textFaint }}>{formatDateDMY(date)}</div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="font-mono" style={{ color: amountMinor >= 0 ? C.positive : C.negative }}>
          {amountMinor >= 0 ? "+" : "-"}{formatMoney(Math.abs(amountMinor), currency)}
        </span>
        {onEdit && (
          <IconBtn label="Editar movimiento" onClick={onEdit}>
            <Pencil size={12} />
          </IconBtn>
        )}
      </div>
    </div>
  );
}

function Section({ title, count, tone, defaultOpen, children }: { title: string; count: number; tone: "positive" | "warning" | "negative"; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const color = tone === "positive" ? C.positive : tone === "warning" ? C.uyu : C.negative;
  return (
    <div className="rounded-xl mb-2" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between p-3">
        <span className="text-sm font-semibold" style={{ color }}>{title} ({count})</span>
        {open ? <ChevronUp size={16} color={C.textFaint} /> : <ChevronDown size={16} color={C.textFaint} />}
      </button>
      {open && count > 0 && <div className="px-3 pb-3 space-y-2.5">{children}</div>}
    </div>
  );
}

/**
 * Conciliación de una cuenta contra un Excel/CSV subido (estado de cuenta
 * oficial, o simplemente un archivo con los movimientos hasta la fecha —
 * ver `lib/reconciliation.ts`). Compara contra TODO el historial propio
 * (`ledgerEntries`) todavía no conciliado, sin pedir un período: el matching
 * es por monto y fecha cercana, no hace falta acotarlo a un mes.
 */
export function ReconciliationModal({
  account,
  ledgerEntries,
  cards,
  contacts,
  canEdit,
  activeUser,
  onUpdateAccount,
  onEditTransaction,
  onEditTransfer,
  onEditCardPayment,
  onMarkReconciled,
  onClose,
}: {
  account: Account;
  /** Historial completo de la cuenta (`accountLedger(...)`, sin filtrar por fecha). Al cambiar (ej. al editar un movimiento) se vuelve a comparar solo, sin perder el archivo ya subido. */
  ledgerEntries: AccountLedgerEntry[];
  cards: Card[];
  contacts: Contact[];
  canEdit: boolean;
  /** Perfil activo: junto con canEdit, decide si se puede editar cada movimiento puntual (ver `canEditOwnRecord`). */
  activeUser: AppUser | null;
  /** Para guardar/limpiar `Account.reconciliationDraft` (el archivo provisorio queda cargado entre visitas hasta que se reemplaza o se sube el oficial). */
  onUpdateAccount: (id: string, partial: Partial<Account>) => void;
  onEditTransaction: (t: Transaction) => void;
  onEditTransfer: (t: Transfer) => void;
  onEditCardPayment: (p: CardPayment) => void;
  onMarkReconciled: (entry: AccountLedgerEntry, reconciledAt: string | undefined) => void;
  onClose: () => void;
}) {
  // Si había un archivo provisorio cargado de una vuelta anterior (`Account.reconciliationDraft`),
  // arranca directamente con eso en vez de pedir subir de nuevo — ver onUpdateAccount abajo.
  const [fileName, setFileName] = useState<string | null>(account.reconciliationDraft?.fileName ?? null);
  const [uploadedAt, setUploadedAt] = useState<string | null>(account.reconciliationDraft?.uploadedAt ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Solo se guardan las líneas ya parseadas del archivo; el resultado (`result`) se recalcula
  // con `useMemo` cada vez que cambian `ledgerEntries` — así, si se edita un movimiento desde acá
  // mismo (o se marca conciliado), la comparación se actualiza sola sin tener que resubir el archivo.
  const [parsedLines, setParsedLines] = useState<StatementLine[] | null>(account.reconciliationDraft?.lines ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Por defecto "provisorio": un archivo armado a mano o exportado a mitad de mes sirve para
  // detectar partidas pendientes de cargar, pero no debería marcar nada como conciliado — eso
  // se reserva para cuando se sube el estado de cuenta oficial, ya cerrado (ver charla con el
  // usuario: quiere que "conciliado" refleje el cierre formal, no cualquier chequeo intermedio).
  const [mode, setMode] = useState<"provisorio" | "oficial">("provisorio");

  const sheetName = account.reconciliationSheetName?.trim() || account.name;

  const result: ReconciliationResult | null = useMemo(
    () => (parsedLines ? reconcileAccount(ledgerEntries, parsedLines) : null),
    [ledgerEntries, parsedLines]
  );

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setParsedLines(null);
    setFileName(file.name);
    try {
      const lines = await parseReconciliationFile(file, sheetName);
      if (lines.length === 0) {
        setError("No encontré movimientos con fecha y monto válidos en esa hoja. Revisá el formato (Fecha, Descripción, Monto).");
        return;
      }
      setParsedLines(lines);
      const now = new Date().toISOString();
      setUploadedAt(now);
      // Provisorio: se guarda para que quede cargado la próxima vez que se abra esta cuenta,
      // hasta que se suba otro archivo o el estado oficial. Oficial: ya se cerró esa vuelta,
      // no tiene sentido seguir arrastrándolo.
      onUpdateAccount(account.id, {
        reconciliationDraft: mode === "provisorio" ? { fileName: file.name, uploadedAt: now, lines } : undefined,
      });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
    } finally {
      setBusy(false);
    }
  };

  // Una vez marcado, el movimiento sale de `remainingEntries` en `reconcileAccount` (ver
  // lib/reconciliation.ts) y desaparece solo de la lista en el próximo render — no hace falta
  // llevar un estado separado de "confirmado" acá.
  const confirmEntry = (entry: AccountLedgerEntry) => onMarkReconciled(entry, todayISO());
  const confirmAllMatches = () => {
    if (!result) return;
    result.matched.forEach((m) => confirmEntry(m.ledgerEntry));
  };

  // Editar desde acá mismo: igual criterio que en "Movimientos de esta cuenta" (no aplica a
  // Personas, que se edita desde esa sección). Al guardar, `ledgerEntries` cambia y el `useMemo`
  // de arriba recalcula solo — no hace falta cerrar y volver a subir el archivo.
  const recordOf = (entry: AccountLedgerEntry) => entry.transaction ?? entry.cardPayment ?? entry.transfer;
  const editableEntry = (entry: AccountLedgerEntry) => {
    if (!canEdit || entry.kind === "contact-entry") return undefined;
    const record = recordOf(entry);
    if (!record || !canEditOwnRecord(activeUser, record)) return undefined;
    return () => {
      if (entry.kind === "transaction" && entry.transaction) onEditTransaction(entry.transaction);
      else if ((entry.kind === "transfer-out" || entry.kind === "transfer-in") && entry.transfer) onEditTransfer(entry.transfer);
      else if (entry.kind === "card-payment" && entry.cardPayment) onEditCardPayment(entry.cardPayment);
    };
  };

  return (
    <Modal title={`Conciliar · ${account.name}`} onClose={onClose}>
      <p className="text-xs mb-3" style={{ color: C.textMuted }}>
        Subí un Excel o CSV con los movimientos de esta cuenta. Va a buscar la hoja "<strong style={{ color: C.text }}>{sheetName}</strong>"
        {" "}(configurable en Editar cuenta). Columnas esperadas: Fecha, Descripción, Monto (positivo = entra, negativo = sale) — o Débito/Crédito por separado.
      </p>

      <div className="mb-3">
        <Field label="Tipo de archivo">
          {() => (
            <Segment
              value={mode}
              onChange={setMode}
              options={[
                { value: "provisorio", label: "Provisorio (solo revisar)" },
                { value: "oficial", label: "Estado oficial (marca conciliado)" },
              ]}
            />
          )}
        </Field>
        <p className="text-xs" style={{ color: C.textFaint }}>
          {mode === "provisorio"
            ? "Para un archivo intermedio, armado a mano o descargado a mitad de mes: te muestra qué falta cargar, pero no marca nada como conciliado."
            : "Para el estado de cuenta ya cerrado del banco: acá sí podés marcar movimientos como conciliados."}
        </p>
      </div>

      <label
        className="w-full py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer mb-3"
        style={{ border: `1px dashed ${C.borderLight}`, color: C.textMuted }}
      >
        {busy ? "Leyendo..." : <><Upload size={14} /> {fileName ? "Cambiar archivo" : "Subir archivo para conciliar"}</>}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </label>
      {fileName && !error && (
        <p className="text-xs mb-3" style={{ color: C.textFaint }}>
          Archivo: {fileName}{uploadedAt ? ` · cargado el ${formatDateTimeDMY(uploadedAt)}` : ""}
        </p>
      )}
      {error && <p className="text-xs mb-3" style={{ color: C.negative }}>{error}</p>}

      {result && (
        <>
          <button
            type="button"
            onClick={() => exportReconciliationToExcel(account, cards, contacts, result)}
            className="w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 mb-3"
            style={{ border: `1px solid ${C.border}`, color: C.text }}
          >
            <Download size={13} /> Descargar conciliación en Excel
          </button>

          <Section title="Concilian" count={result.matched.length} tone="positive" defaultOpen={result.matched.length > 0 && result.matched.length <= 10}>
            {mode === "oficial" && result.matched.length > 0 && (
              <button
                type="button"
                onClick={confirmAllMatches}
                className="text-xs font-semibold flex items-center gap-1 mb-1"
                style={{ color: C.usd }}
              >
                <Check size={13} /> Marcar todos como conciliados
              </button>
            )}
            {result.matched.map((m, i) => (
              <div key={i} className="rounded-lg p-2" style={{ background: C.surface2 }}>
                <EntryRow
                  label={ledgerEntryLabel(m.ledgerEntry, cards, contacts)}
                  date={m.ledgerEntry.date}
                  amountMinor={m.ledgerEntry.amountMinor}
                  currency={account.currency}
                  onEdit={editableEntry(m.ledgerEntry)}
                />
                <div className="text-[10px] mt-1" style={{ color: C.textFaint }}>
                  Banco: {m.statementLine.description || "(sin descripción)"} · {formatDateDMY(m.statementLine.date)}
                </div>
                {mode === "oficial" && (
                  <button type="button" onClick={() => confirmEntry(m.ledgerEntry)} className="text-[10px] font-semibold mt-1" style={{ color: C.usd }}>
                    Marcar conciliado
                  </button>
                )}
              </div>
            ))}
          </Section>

          <Section title="Posibles diferencias" count={result.suggested.length} tone="warning" defaultOpen>
            {result.suggested.map((s, i) => (
              <div key={i} className="rounded-lg p-2" style={{ background: "rgba(217,164,65,0.1)" }}>
                <EntryRow
                  label={ledgerEntryLabel(s.ledgerEntry, cards, contacts)}
                  date={s.ledgerEntry.date}
                  amountMinor={s.ledgerEntry.amountMinor}
                  currency={account.currency}
                  onEdit={editableEntry(s.ledgerEntry)}
                />
                <div className="text-[10px] mt-1" style={{ color: C.uyu }}>
                  Banco: {s.statementLine.description || "(sin descripción)"} · {formatDateDMY(s.statementLine.date)} · {formatMoney(Math.abs(s.statementLine.amountMinor), account.currency)}
                  {s.amountDiffMinor !== 0 && <> · diferencia {s.amountDiffMinor >= 0 ? "+" : "-"}{formatMoney(Math.abs(s.amountDiffMinor), account.currency)}</>}
                  {s.daysDiff > 0 ? ` · ${s.daysDiff}d de diferencia` : ""}
                </div>
                {mode === "oficial" && (
                  <button type="button" onClick={() => confirmEntry(s.ledgerEntry)} className="text-[10px] font-semibold mt-1" style={{ color: C.usd }}>
                    Es el mismo, marcar conciliado
                  </button>
                )}
              </div>
            ))}
          </Section>

          <Section title="En el banco, no cargado en la app" count={result.unmatchedInFile.length} tone="negative">
            {result.unmatchedInFile.map((line, i) => (
              <EntryRow key={i} label={line.description || "(sin descripción)"} date={line.date} amountMinor={line.amountMinor} currency={account.currency} />
            ))}
          </Section>

          <Section title="Cargado en la app, no aparece en el banco" count={result.unmatchedInApp.length} tone="negative">
            {result.unmatchedInApp.map((entry, i) => (
              <EntryRow
                key={i}
                label={ledgerEntryLabel(entry, cards, contacts)}
                date={entry.date}
                amountMinor={entry.amountMinor}
                currency={account.currency}
                onEdit={editableEntry(entry)}
              />
            ))}
          </Section>

          {result.matched.length === 0 && result.suggested.length === 0 && result.unmatchedInFile.length === 0 && result.unmatchedInApp.length === 0 && (
            <p className="text-xs text-center py-3" style={{ color: C.textMuted }}>No quedó nada para mostrar: ya estaba todo conciliado.</p>
          )}
        </>
      )}

      {!result && !error && !busy && (
        <div className="rounded-lg p-3 flex items-start gap-2 text-xs" style={{ background: C.surface2, color: C.textMuted }}>
          <AlertTriangle size={14} className="shrink-0 mt-0.5" color={C.textFaint} />
          <span>Los movimientos ya marcados como conciliados en una vuelta anterior no se vuelven a mostrar acá.</span>
        </div>
      )}

      <PrimaryButton onClick={onClose}>Listo</PrimaryButton>
    </Modal>
  );
}
