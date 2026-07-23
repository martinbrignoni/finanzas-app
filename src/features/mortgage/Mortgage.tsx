import { useState } from "react";
import { Building2, Plus, Pencil, Trash2, ChevronRight, Scissors } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Modal, Field, TextInput, Segment, PrimaryButton, IconBtn } from "../../components/ui";
import { formatMoney, parseAmountInput, fromMinor } from "../../lib/money";
import { formatDateDMY, todayISO } from "../../lib/dates";
import { buildSchedule, loanSummary } from "../../lib/mortgage";
import type { MortgageLoan, MortgagePrepayment, Currency } from "../../types";

export function Mortgage({
  loans,
  canEdit,
  onAddLoan,
  onEditLoan,
  onDeleteLoan,
  onAddPrepayment,
  onDeletePrepayment,
}: {
  loans: MortgageLoan[];
  canEdit: boolean;
  onAddLoan: () => void;
  onEditLoan: (loan: MortgageLoan) => void;
  onDeleteLoan: (id: string) => void;
  onAddPrepayment: (loanId: string) => void;
  onDeletePrepayment: (loanId: string, prepaymentId: string) => void;
}) {
  const [viewLoanId, setViewLoanId] = useState<string | null>(null);
  const viewLoan = loans.find((l) => l.id === viewLoanId) ?? null;

  return (
    <div className="pb-24">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-display" style={{ color: C.text }}>Hipoteca</h1>
        {canEdit && (
          <button
            onClick={onAddLoan}
            aria-label="Nuevo préstamo"
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text }}
          >
            <Plus size={18} />
          </button>
        )}
      </div>

      {loans.length === 0 && (
        <div className="rounded-xl p-6 text-center text-sm mb-4" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textMuted }}>
          Todavía no cargaste ningún préstamo hipotecario. Agregá uno para calcular la cuota por sistema francés, ver el detalle de amortización y registrar pagos extraordinarios.
        </div>
      )}

      <div className="space-y-2 mb-4">
        {loans.map((loan) => {
          const schedule = buildSchedule(loan);
          const summary = loanSummary(schedule);
          return (
            <button
              key={loan.id}
              onClick={() => setViewLoanId(loan.id)}
              className="w-full text-left rounded-xl p-3.5"
              style={{ background: C.surface, border: `1px solid ${C.border}` }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: C.surface3 }}>
                    <Building2 size={16} color={C.usd} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: C.text }}>{loan.name}</div>
                    <div className="text-[10px]" style={{ color: C.textFaint }}>
                      {summary.isPaidOff ? "Saldado" : `Cuota ${schedule.length - summary.remainingInstallments + 1} de ${summary.totalInstallments}`}
                    </div>
                  </div>
                </div>
                <ChevronRight size={16} color={C.textFaint} />
              </div>
              {summary.isPaidOff ? (
                <p className="text-xs" style={{ color: C.positive }}>Préstamo saldado</p>
              ) : (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <span style={{ color: C.textMuted }}>
                    Cuota: <span className="font-mono" style={{ color: C.text }}>{formatMoney(summary.currentPaymentMinor, loan.currency)}</span>
                  </span>
                  <span style={{ color: C.textMuted }}>
                    Saldo: <span className="font-mono" style={{ color: C.text }}>{formatMoney(summary.balanceMinor, loan.currency)}</span>
                  </span>
                  {summary.nextDueDate && (
                    <span style={{ color: C.textMuted }}>
                      Próx.: <span style={{ color: C.text }}>{formatDateDMY(summary.nextDueDate)}</span>
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {canEdit && (
        <button
          onClick={onAddLoan}
          className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
          style={{ background: C.surface2, border: `1px dashed ${C.borderLight}`, color: C.textMuted }}
        >
          <Plus size={16} /> Nuevo préstamo
        </button>
      )}

      {viewLoan && (
        <LoanDetailModal
          loan={viewLoan}
          canEdit={canEdit}
          onEditLoan={() => onEditLoan(viewLoan)}
          onDeleteLoan={() => { onDeleteLoan(viewLoan.id); setViewLoanId(null); }}
          onAddPrepayment={() => onAddPrepayment(viewLoan.id)}
          onDeletePrepayment={(prepaymentId) => onDeletePrepayment(viewLoan.id, prepaymentId)}
          onClose={() => setViewLoanId(null)}
        />
      )}
    </div>
  );
}

function LoanDetailModal({
  loan,
  canEdit,
  onEditLoan,
  onDeleteLoan,
  onAddPrepayment,
  onDeletePrepayment,
  onClose,
}: {
  loan: MortgageLoan;
  canEdit: boolean;
  onEditLoan: () => void;
  onDeleteLoan: () => void;
  onAddPrepayment: () => void;
  onDeletePrepayment: (prepaymentId: string) => void;
  onClose: () => void;
}) {
  const schedule = buildSchedule(loan);
  const summary = loanSummary(schedule);
  const sortedPrepayments = [...loan.prepayments].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Modal title={loan.name} onClose={onClose}>
      <div className="rounded-lg p-3 mb-4 space-y-1.5" style={{ background: C.surface2, border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: C.textMuted }}>Cuota actual</span>
          <span className="font-mono font-semibold" style={{ color: C.text }}>{formatMoney(summary.currentPaymentMinor, loan.currency)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: C.textMuted }}>Saldo de capital</span>
          <span className="font-mono" style={{ color: C.text }}>{formatMoney(summary.balanceMinor, loan.currency)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: C.textMuted }}>Cuotas restantes</span>
          <span style={{ color: C.text }}>{summary.remainingInstallments} de {summary.totalInstallments}</span>
        </div>
        {summary.nextDueDate && (
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: C.textMuted }}>Próximo vencimiento</span>
            <span style={{ color: C.text }}>{formatDateDMY(summary.nextDueDate)}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm pt-1.5" style={{ borderTop: `1px solid ${C.border}` }}>
          <span style={{ color: C.textMuted }}>Interés total del préstamo</span>
          <span className="font-mono" style={{ color: C.negative }}>{formatMoney(summary.totalInterestMinor, loan.currency)}</span>
        </div>
        {summary.totalPrepaidMinor > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: C.textMuted }}>Amortizado extra</span>
            <span className="font-mono" style={{ color: C.positive }}>{formatMoney(summary.totalPrepaidMinor, loan.currency)}</span>
          </div>
        )}
      </div>

      {loan.note && <p className="text-xs mb-3" style={{ color: C.textFaint }}>{loan.note}</p>}

      {canEdit && (
        <div className="flex gap-2 mb-3">
          <button
            onClick={onEditLoan}
            className="flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1"
            style={{ border: `1px solid ${C.border}`, color: C.textMuted }}
          >
            <Pencil size={13} /> Editar préstamo
          </button>
          <button
            onClick={onDeleteLoan}
            className="flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1"
            style={{ border: `1px solid ${C.border}`, color: C.negative }}
          >
            <Trash2 size={13} /> Eliminar
          </button>
        </div>
      )}

      {canEdit && !summary.isPaidOff && (
        <button
          onClick={onAddPrepayment}
          className="w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 mb-4"
          style={{ border: `1px dashed ${C.borderLight}`, color: C.textMuted }}
        >
          <Scissors size={13} /> Nueva amortización extraordinaria
        </button>
      )}

      {sortedPrepayments.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold mb-1.5" style={{ color: C.textMuted }}>Amortizaciones registradas</p>
          <div className="space-y-1.5">
            {sortedPrepayments.map((p) => (
              <div key={p.id} className="rounded-lg p-2.5 flex items-center justify-between" style={{ background: C.surface2, border: `1px solid ${C.border}` }}>
                <div>
                  <div className="text-xs" style={{ color: C.text }}>
                    {formatDateDMY(p.date)} · <span className="font-mono">{formatMoney(p.amountMinor, loan.currency)}</span>
                  </div>
                  <div className="text-[10px]" style={{ color: C.textFaint }}>
                    {p.strategy === "reduceInstallment" ? "Bajó la cuota" : "Bajó el plazo"}
                    {p.note ? ` · ${p.note}` : ""}
                  </div>
                </div>
                {canEdit && (
                  <IconBtn label="Eliminar amortización" danger onClick={() => onDeletePrepayment(p.id)}>
                    <Trash2 size={13} />
                  </IconBtn>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs font-semibold mb-1.5" style={{ color: C.textMuted }}>Tabla de amortización</p>
      <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
        <div className="max-h-[40vh] overflow-y-auto">
          <table className="w-full text-xs">
            <thead style={{ background: C.surface2 }}>
              <tr style={{ color: C.textFaint }}>
                <th className="text-left py-1.5 px-2 font-medium">#</th>
                <th className="text-left py-1.5 px-2 font-medium">Vence</th>
                <th className="text-right py-1.5 px-2 font-medium">Cuota</th>
                <th className="text-right py-1.5 px-2 font-medium">Interés</th>
                <th className="text-right py-1.5 px-2 font-medium">Capital</th>
                <th className="text-right py-1.5 px-2 font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((row) => (
                <tr
                  key={row.number}
                  style={{
                    opacity: row.isPast ? 0.55 : 1,
                    background: row.extraPaymentMinor ? "rgba(111,191,139,0.15)" : "transparent",
                    borderTop: `1px solid ${C.border}`,
                  }}
                >
                  <td className="py-1.5 px-2" style={{ color: C.textFaint }}>{row.number}</td>
                  <td className="py-1.5 px-2" style={{ color: C.text }}>{formatDateDMY(row.dueDate)}</td>
                  <td className="py-1.5 px-2 text-right font-mono" style={{ color: C.text }}>{formatMoney(row.paymentMinor, loan.currency)}</td>
                  <td className="py-1.5 px-2 text-right font-mono" style={{ color: C.negative }}>{formatMoney(row.interestMinor, loan.currency)}</td>
                  <td className="py-1.5 px-2 text-right font-mono" style={{ color: C.positive }}>{formatMoney(row.principalMinor, loan.currency)}</td>
                  <td className="py-1.5 px-2 text-right font-mono" style={{ color: C.text }}>{formatMoney(row.balanceMinor, loan.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {schedule.some((r) => r.extraPaymentMinor) && (
        <p className="text-[10px] mt-1.5" style={{ color: C.textFaint }}>Las filas resaltadas incluyen una amortización extraordinaria aplicada junto con esa cuota.</p>
      )}
    </Modal>
  );
}

export function LoanModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: MortgageLoan;
  onSave: (loan: MortgageLoan) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? "UYU");
  const [principal, setPrincipal] = useState(initial ? String(fromMinor(initial.principalMinor)) : "");
  const [annualRate, setAnnualRate] = useState(initial ? String(initial.annualRatePct) : "");
  const [termUnit, setTermUnit] = useState<"years" | "months">(
    initial && initial.termMonths % 12 === 0 ? "years" : "months"
  );
  const [termValue, setTermValue] = useState(
    initial ? String(termUnit === "years" ? initial.termMonths / 12 : initial.termMonths) : ""
  );
  const [startDate, setStartDate] = useState(initial?.startDate ?? todayISO());
  const [note, setNote] = useState(initial?.note ?? "");
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    if (!name.trim()) return setError("Ingresá un nombre para el préstamo.");
    const principalAmount = parseAmountInput(principal);
    if (principalAmount === null || principalAmount === 0) return setError("Ingresá un monto de préstamo válido, mayor a cero.");
    const rate = parseFloat(annualRate.replace(",", "."));
    if (!Number.isFinite(rate) || rate < 0) return setError("Ingresá una tasa anual válida.");
    const termNum = parseFloat(termValue.replace(",", "."));
    if (!Number.isFinite(termNum) || termNum <= 0) return setError("Ingresá un plazo válido.");
    const termMonths = Math.round(termUnit === "years" ? termNum * 12 : termNum);
    if (termMonths <= 0) return setError("Ingresá un plazo válido.");
    if (!startDate) return setError("Elegí la fecha de la primera cuota.");

    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      principalMinor: principalAmount,
      currency,
      annualRatePct: rate,
      termMonths,
      startDate,
      prepayments: initial?.prepayments ?? [],
      note: note.trim() || undefined,
    });
  };

  return (
    <Modal title={initial ? "Editar préstamo" : "Nuevo préstamo"} onClose={onClose}>
      <Field label="Nombre">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Hipoteca BROU" />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monto del préstamo">
          {(id) => <TextInput id={id} type="number" inputMode="decimal" min="0" step="0.01" value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="0" />}
        </Field>
        <Field label="Moneda">
          {() => <Segment value={currency} onChange={setCurrency} options={[{ value: "UYU", label: "UYU" }, { value: "USD", label: "USD" }]} />}
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tasa anual (%)">
          {(id) => <TextInput id={id} type="number" inputMode="decimal" min="0" step="0.01" value={annualRate} onChange={(e) => setAnnualRate(e.target.value)} placeholder="Ej. 4.5" />}
        </Field>
        <Field label="Plazo">
          {(id) => <TextInput id={id} type="number" inputMode="decimal" min="0" step="1" value={termValue} onChange={(e) => setTermValue(e.target.value)} placeholder="Ej. 20" />}
        </Field>
      </div>
      <Field label="Unidad del plazo">
        {() => (
          <Segment
            value={termUnit}
            onChange={setTermUnit}
            options={[{ value: "years", label: "Años" }, { value: "months", label: "Meses" }]}
          />
        )}
      </Field>
      <Field label="Fecha de la primera cuota">{(id) => <TextInput id={id} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />}</Field>
      <p className="text-xs -mt-2 mb-3" style={{ color: C.textFaint }}>Las siguientes cuotas vencen el mismo día de cada mes.</p>
      <Field label="Nota (opcional)">{(id) => <TextInput id={id} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>
    </Modal>
  );
}

export function PrepaymentModal({
  loanId,
  loan,
  initial,
  onSave,
  onClose,
}: {
  loanId: string;
  loan: MortgageLoan;
  initial?: MortgagePrepayment;
  onSave: (loanId: string, prepayment: MortgagePrepayment) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [amount, setAmount] = useState(initial ? String(fromMinor(initial.amountMinor)) : "");
  const [strategy, setStrategy] = useState<"reduceInstallment" | "reduceTerm">(initial?.strategy ?? "reduceInstallment");
  const [note, setNote] = useState(initial?.note ?? "");
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    const amountMinor = parseAmountInput(amount);
    if (amountMinor === null || amountMinor === 0) return setError("Ingresá un monto válido, mayor a cero.");
    if (!date) return setError("Elegí una fecha.");

    onSave(loanId, {
      id: initial?.id ?? crypto.randomUUID(),
      date,
      amountMinor,
      strategy,
      note: note.trim() || undefined,
    });
  };

  return (
    <Modal title={initial ? "Editar amortización" : "Nueva amortización extraordinaria"} onClose={onClose}>
      <p className="text-xs mb-3" style={{ color: C.textFaint }}>
        Se aplica sobre el saldo del préstamo junto con la primera cuota que venza a partir de esta fecha. Elegí si preferís bajar el valor de la cuota o el plazo restante: no se puede hacer las dos cosas con el mismo pago.
      </p>
      <Field label="Fecha">{(id) => <TextInput id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
      <Field label={`Monto (${loan.currency})`}>
        {(id) => <TextInput id={id} type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />}
      </Field>
      <Field label="¿Qué preferís bajar?">
        {() => (
          <Segment
            value={strategy}
            onChange={setStrategy}
            options={[{ value: "reduceInstallment", label: "Bajar cuota" }, { value: "reduceTerm", label: "Bajar plazo" }]}
          />
        )}
      </Field>
      <p className="text-xs -mt-2 mb-3" style={{ color: C.textFaint }}>
        {strategy === "reduceInstallment"
          ? "El plazo restante no cambia, pero las próximas cuotas bajan de valor."
          : "La cuota no cambia, pero el préstamo se termina de pagar antes."}
      </p>
      <Field label="Nota (opcional)">{(id) => <TextInput id={id} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>
    </Modal>
  );
}
