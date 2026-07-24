import { useEffect, useState } from "react";
import { Building2, Plus, Pencil, Trash2, ChevronRight, Scissors } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Modal, Field, TextInput, Segment, PrimaryButton, IconBtn } from "../../components/ui";
import { formatMoney, parseAmountInput, fromMinor, toMinor } from "../../lib/money";
import { formatDateDMY, todayISO, daysBetween, addMonthsToDate } from "../../lib/dates";
import { buildSchedule, loanSummary, formatMortgageAmount, formatUiAmount, convertUsdReference } from "../../lib/mortgage";
import { fetchRateForDate } from "../../lib/exchangeRates";
import type { MortgageLoan, MortgagePrepayment, MortgageCurrency, AmortizationSystem } from "../../types";

const SYSTEM_LABELS: Record<AmortizationSystem, string> = {
  frances: "Sistema francés",
  aleman: "Sistema alemán",
  americano: "Sistema americano",
};

const SYSTEM_OPTIONS: { value: AmortizationSystem; label: string }[] = [
  { value: "frances", label: "Francés" },
  { value: "aleman", label: "Alemán" },
  { value: "americano", label: "Americano" },
];

const CURRENCY_OPTIONS: { value: MortgageCurrency; label: string }[] = [
  { value: "UYU", label: "UYU" },
  { value: "USD", label: "USD" },
  { value: "UI", label: "UI" },
];

function currencyColor(currency: MortgageCurrency): string {
  if (currency === "USD") return C.usd;
  if (currency === "UYU") return C.uyu;
  return C.textMuted;
}

function MortgageCurrencyPill({ currency }: { currency: MortgageCurrency }) {
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color: "#0A1413", background: currencyColor(currency) }}>
      {currency}
    </span>
  );
}

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
          Todavía no cargaste ningún préstamo. Agregá uno para calcular la cuota (sistema francés, alemán o americano), ver el detalle de amortización y registrar pagos extraordinarios.
        </div>
      )}

      <div className="space-y-2 mb-4">
        {loans.map((loan) => {
          const schedule = buildSchedule(loan);
          const summary = loanSummary(schedule);
          const system = loan.system ?? "frances";
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
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold" style={{ color: C.text }}>{loan.name}</span>
                      <MortgageCurrencyPill currency={loan.currency} />
                    </div>
                    <div className="text-[10px]" style={{ color: C.textFaint }}>
                      {SYSTEM_LABELS[system]}
                      {summary.isPaidOff
                        ? " · Saldado"
                        : ` · Cuota ${schedule.length - summary.remainingInstallments + 1} de ${summary.totalInstallments}`}
                    </div>
                  </div>
                </div>
                <ChevronRight size={16} color={C.textFaint} />
              </div>
              {!summary.isPaidOff && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <span style={{ color: C.textMuted }}>
                    Cuota: <span className="font-mono" style={{ color: C.text }}>{formatMortgageAmount(summary.currentPaymentMinor, loan.currency)}</span>
                  </span>
                  <span style={{ color: C.textMuted }}>
                    Saldo: <span className="font-mono" style={{ color: C.text }}>{formatMortgageAmount(summary.balanceMinor, loan.currency)}</span>
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
  const system = loan.system ?? "frances";
  const sortedPrepayments = [...loan.prepayments].sort((a, b) => b.date.localeCompare(a.date));
  const graceMonths = loan.gracePeriodMonths ?? 0;
  const graceEndDate = graceMonths > 0 ? addMonthsToDate(loan.startDate, graceMonths) : null;
  const hasUsdInfo = loan.propertyValueUsdMinor != null || loan.requestedAmountUsdMinor != null;
  const conversion = loan.requestedAmountUsdMinor != null
    ? convertUsdReference(loan.requestedAmountUsdMinor, loan.referenceUsdToUyuRate, loan.referenceUiRate)
    : null;

  return (
    <Modal title={loan.name} onClose={onClose}>
      <div className="flex items-center gap-1.5 mb-3">
        <MortgageCurrencyPill currency={loan.currency} />
        <span className="text-xs" style={{ color: C.textFaint }}>{SYSTEM_LABELS[system]}</span>
      </div>

      <div className="rounded-lg p-3 mb-4 space-y-1.5" style={{ background: C.surface2, border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: C.textMuted }}>Cuota actual</span>
          <span className="font-mono font-semibold" style={{ color: C.text }}>{formatMortgageAmount(summary.currentPaymentMinor, loan.currency)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: C.textMuted }}>Saldo de capital</span>
          <span className="font-mono" style={{ color: C.text }}>{formatMortgageAmount(summary.balanceMinor, loan.currency)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: C.textMuted }}>Cuotas restantes</span>
          <span style={{ color: C.text }}>{summary.remainingInstallments} de {summary.totalInstallments}</span>
        </div>
        {loan.requestDate && (
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: C.textMuted }}>Solicitado</span>
            <span style={{ color: C.text }}>{formatDateDMY(loan.requestDate)} · {daysBetween(loan.requestDate, loan.startDate)} días antes de la 1ª cuota</span>
          </div>
        )}
        {(loan.gracePeriodMonths ?? 0) > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: C.textMuted }}>Período de gracia</span>
            <span style={{ color: C.text }}>
              {loan.gracePeriodMonths} {loan.gracePeriodMonths === 1 ? "cuota" : "cuotas"} · {loan.graceType === "capitalized" ? "sin pagos (capitaliza)" : "solo interés"}
            </span>
          </div>
        )}
        {summary.nextDueDate && (
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: C.textMuted }}>Próximo vencimiento</span>
            <span style={{ color: C.text }}>{formatDateDMY(summary.nextDueDate)}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm pt-1.5" style={{ borderTop: `1px solid ${C.border}` }}>
          <span style={{ color: C.textMuted }}>Interés total del préstamo</span>
          <span className="font-mono" style={{ color: C.negative }}>{formatMortgageAmount(summary.totalInterestMinor, loan.currency)}</span>
        </div>
        {summary.totalPrepaidMinor > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: C.textMuted }}>Amortizado extra</span>
            <span className="font-mono" style={{ color: C.positive }}>{formatMortgageAmount(summary.totalPrepaidMinor, loan.currency)}</span>
          </div>
        )}
      </div>

      {hasUsdInfo && (
        <div className="rounded-lg p-3 mb-4 space-y-1.5" style={{ background: C.surface2, border: `1px solid ${C.border}` }}>
          <p className="text-xs font-semibold mb-1" style={{ color: C.textMuted }}>Datos informativos (no afectan el cálculo)</p>
          {loan.propertyValueUsdMinor != null && (
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: C.textMuted }}>Valor de la propiedad</span>
              <span className="font-mono" style={{ color: C.text }}>{formatMoney(loan.propertyValueUsdMinor, "USD")}</span>
            </div>
          )}
          {loan.requestedAmountUsdMinor != null && (
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: C.textMuted }}>Importe solicitado</span>
              <span className="font-mono" style={{ color: C.text }}>{formatMoney(loan.requestedAmountUsdMinor, "USD")}</span>
            </div>
          )}
          {conversion && (
            <div className="pt-1" style={{ borderTop: `1px solid ${C.border}` }}>
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: C.textFaint }}>≈ en pesos (TC {loan.referenceUsdToUyuRate})</span>
                <span className="font-mono" style={{ color: C.textFaint }}>{formatMoney(toMinor(conversion.amountUyu), "UYU")}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: C.textFaint }}>≈ en UI (cotiz. {loan.referenceUiRate})</span>
                <span className="font-mono" style={{ color: C.textFaint }}>{formatUiAmount(conversion.amountUi)}</span>
              </div>
            </div>
          )}
        </div>
      )}

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
                    {formatDateDMY(p.date)} · <span className="font-mono">{formatMortgageAmount(p.amountMinor, loan.currency)}</span>
                  </div>
                  <div className="text-[10px]" style={{ color: C.textFaint }}>
                    {system === "americano" || (graceEndDate && p.date < graceEndDate)
                      ? "Redujo el saldo"
                      : p.strategy === "reduceInstallment" ? "Bajó la cuota" : "Bajó el plazo"}
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
                    background: row.extraPaymentMinor
                      ? "rgba(111,191,139,0.15)"
                      : row.isGrace
                      ? "rgba(217,164,65,0.12)"
                      : "transparent",
                    borderTop: `1px solid ${C.border}`,
                  }}
                >
                  <td className="py-1.5 px-2" style={{ color: C.textFaint }}>{row.number}{row.isGrace ? " (g)" : ""}</td>
                  <td className="py-1.5 px-2" style={{ color: C.text }}>{formatDateDMY(row.dueDate)}</td>
                  <td className="py-1.5 px-2 text-right font-mono" style={{ color: C.text }}>{formatMortgageAmount(row.paymentMinor, loan.currency)}</td>
                  <td className="py-1.5 px-2 text-right font-mono" style={{ color: C.negative }}>{formatMortgageAmount(row.interestMinor, loan.currency)}</td>
                  <td className="py-1.5 px-2 text-right font-mono" style={{ color: C.positive }}>{formatMortgageAmount(row.principalMinor, loan.currency)}</td>
                  <td className="py-1.5 px-2 text-right font-mono" style={{ color: C.text }}>{formatMortgageAmount(row.balanceMinor, loan.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {(schedule.some((r) => r.extraPaymentMinor) || schedule.some((r) => r.isGrace)) && (
        <p className="text-[10px] mt-1.5" style={{ color: C.textFaint }}>
          {schedule.some((r) => r.isGrace) && "Las filas marcadas \"(g)\" y en amarillo son cuotas de gracia. "}
          {schedule.some((r) => r.extraPaymentMinor) && "Las filas en verde incluyen una amortización extraordinaria aplicada junto con esa cuota."}
        </p>
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
  const [currency, setCurrency] = useState<MortgageCurrency>(initial?.currency ?? "UYU");
  const [system, setSystem] = useState<AmortizationSystem>(initial?.system ?? "frances");
  const [principal, setPrincipal] = useState(initial ? String(fromMinor(initial.principalMinor)) : "");
  const [annualRate, setAnnualRate] = useState(initial ? String(initial.annualRatePct) : "");
  const [termUnit, setTermUnit] = useState<"years" | "months">(
    initial && initial.termMonths % 12 === 0 ? "years" : "months"
  );
  const [termValue, setTermValue] = useState(
    initial ? String(termUnit === "years" ? initial.termMonths / 12 : initial.termMonths) : ""
  );
  const [startDate, setStartDate] = useState(initial?.startDate ?? todayISO());
  const [requestDate, setRequestDate] = useState(initial?.requestDate ?? "");
  const [note, setNote] = useState(initial?.note ?? "");

  const [hasGrace, setHasGrace] = useState((initial?.gracePeriodMonths ?? 0) > 0);
  const [gracePeriodValue, setGracePeriodValue] = useState(initial?.gracePeriodMonths ? String(initial.gracePeriodMonths) : "");
  const [graceType, setGraceType] = useState<"interestOnly" | "capitalized">(initial?.graceType ?? "interestOnly");

  const [showUsdInfo, setShowUsdInfo] = useState(!!(initial?.propertyValueUsdMinor || initial?.requestedAmountUsdMinor));
  const [propertyValueUsd, setPropertyValueUsd] = useState(initial?.propertyValueUsdMinor ? String(fromMinor(initial.propertyValueUsdMinor)) : "");
  const [requestedAmountUsd, setRequestedAmountUsd] = useState(initial?.requestedAmountUsdMinor ? String(fromMinor(initial.requestedAmountUsdMinor)) : "");
  const [rateUyu, setRateUyu] = useState(initial?.referenceUsdToUyuRate ? String(initial.referenceUsdToUyuRate) : "");
  const [rateUi, setRateUi] = useState(initial?.referenceUiRate ? String(initial.referenceUiRate) : "");
  const [rateUyuAuto, setRateUyuAuto] = useState(() => !initial?.referenceUsdToUyuRate);
  const [rateUiAuto, setRateUiAuto] = useState(() => !initial?.referenceUiRate);
  const [error, setError] = useState<string | null>(null);

  // Sugiere el TC USD->UYU y la cotización de la UI de la fecha del préstamo
  // (BCU, desde Cotizaciones), mientras el usuario no las haya editado a mano.
  useEffect(() => {
    if (!showUsdInfo || !startDate) return;
    let cancelado = false;
    if (rateUyuAuto) {
      fetchRateForDate("USD", startDate).then((row) => {
        if (!cancelado && row) setRateUyu(String(row.sell));
      });
    }
    if (rateUiAuto) {
      fetchRateForDate("UI", startDate).then((row) => {
        if (!cancelado && row) setRateUi(String(row.sell));
      });
    }
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUsdInfo, startDate, rateUyuAuto, rateUiAuto]);

  const requestedAmountUsdMinor = parseAmountInput(requestedAmountUsd);
  const rateUyuNum = parseFloat(rateUyu.replace(",", "."));
  const rateUiNum = parseFloat(rateUi.replace(",", "."));
  const conversion = requestedAmountUsdMinor
    ? convertUsdReference(requestedAmountUsdMinor, rateUyuNum, rateUiNum)
    : null;

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
    if (requestDate && requestDate > startDate) return setError("La fecha de solicitud no puede ser posterior a la de la primera cuota.");
    let gracePeriodMonths: number | undefined;
    if (hasGrace) {
      const graceNum = Math.round(parseFloat(gracePeriodValue.replace(",", ".")));
      if (!Number.isFinite(graceNum) || graceNum <= 0) return setError("Ingresá una cantidad válida de cuotas de gracia.");
      gracePeriodMonths = graceNum;
    }

    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      principalMinor: principalAmount,
      currency,
      system,
      annualRatePct: rate,
      termMonths,
      startDate,
      requestDate: requestDate || undefined,
      gracePeriodMonths,
      graceType: hasGrace ? graceType : undefined,
      prepayments: initial?.prepayments ?? [],
      note: note.trim() || undefined,
      propertyValueUsdMinor: showUsdInfo ? parseAmountInput(propertyValueUsd) ?? undefined : undefined,
      requestedAmountUsdMinor: showUsdInfo ? requestedAmountUsdMinor ?? undefined : undefined,
      referenceUsdToUyuRate: showUsdInfo && Number.isFinite(rateUyuNum) && rateUyuNum > 0 ? rateUyuNum : undefined,
      referenceUiRate: showUsdInfo && Number.isFinite(rateUiNum) && rateUiNum > 0 ? rateUiNum : undefined,
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
          {() => <Segment value={currency} onChange={setCurrency} options={CURRENCY_OPTIONS} />}
        </Field>
      </div>
      <Field label="Sistema de amortización">
        {() => <Segment value={system} onChange={setSystem} options={SYSTEM_OPTIONS} />}
      </Field>
      <p className="text-xs -mt-2 mb-3" style={{ color: C.textFaint }}>
        {system === "frances" && "Cuota fija; el interés baja y la amortización de capital sube mes a mes."}
        {system === "aleman" && "Amortización de capital fija; la cuota total baja mes a mes."}
        {system === "americano" && "Solo se pagan intereses durante el plazo; el capital se cancela entero en la última cuota."}
      </p>
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
      <Field label="Fecha de solicitud / desembolso (opcional)">
        {(id) => <TextInput id={id} type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} />}
      </Field>
      {requestDate && startDate && (
        <p className="text-xs -mt-2 mb-3" style={{ color: C.textFaint }}>
          {daysBetween(requestDate, startDate)} días hasta la primera cuota
          {Math.abs(daysBetween(requestDate, startDate) - 30) <= 3 ? " (≈ 1 mes, el caso más común)." : "."}
        </p>
      )}

      <Field label="¿Tiene período de gracia?">
        {() => (
          <Segment
            value={hasGrace ? "on" : "off"}
            onChange={(v) => setHasGrace(v === "on")}
            options={[{ value: "off", label: "No" }, { value: "on", label: "Sí" }]}
          />
        )}
      </Field>
      {hasGrace && (
        <div className="rounded-lg p-3 mb-3" style={{ background: C.surface2, border: `1px solid ${C.border}` }}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cuotas de gracia">
              {(id) => <TextInput id={id} type="number" inputMode="decimal" min="1" step="1" value={gracePeriodValue} onChange={(e) => setGracePeriodValue(e.target.value)} placeholder="Ej. 6" />}
            </Field>
            <Field label="Durante la gracia">
              {() => (
                <Segment
                  value={graceType}
                  onChange={setGraceType}
                  options={[{ value: "interestOnly", label: "Solo interés" }, { value: "capitalized", label: "Sin pagos" }]}
                />
              )}
            </Field>
          </div>
          <p className="text-[11px]" style={{ color: C.textFaint }}>
            {graceType === "interestOnly"
              ? "Pagás solo el interés durante esas cuotas; el saldo no baja. La amortización regular (el plazo de arriba) arranca después."
              : "No pagás nada durante esas cuotas; el interés se suma al saldo, que va a ser más alto cuando arranque la amortización regular."}
          </p>
        </div>
      )}
      <Field label="Nota (opcional)">{(id) => <TextInput id={id} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>

      <Field label="¿Agregar datos informativos en USD?">
        {() => (
          <Segment
            value={showUsdInfo ? "on" : "off"}
            onChange={(v) => setShowUsdInfo(v === "on")}
            options={[{ value: "off", label: "No" }, { value: "on", label: "Sí" }]}
          />
        )}
      </Field>
      {showUsdInfo && (
        <div className="rounded-lg p-3 mb-3" style={{ background: C.surface2, border: `1px solid ${C.border}` }}>
          <p className="text-[11px] mb-2" style={{ color: C.textFaint }}>
            Dato de referencia, no afecta el cálculo de la cuota (que se hace en la moneda del préstamo).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor de la propiedad (USD)">
              {(id) => <TextInput id={id} type="number" inputMode="decimal" min="0" step="0.01" value={propertyValueUsd} onChange={(e) => setPropertyValueUsd(e.target.value)} placeholder="0" />}
            </Field>
            <Field label="Importe solicitado (USD)">
              {(id) => <TextInput id={id} type="number" inputMode="decimal" min="0" step="0.01" value={requestedAmountUsd} onChange={(e) => setRequestedAmountUsd(e.target.value)} placeholder="0" />}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="TC USD → UYU">
              {(id) => (
                <TextInput
                  id={id}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.001"
                  value={rateUyu}
                  onChange={(e) => { setRateUyu(e.target.value); setRateUyuAuto(false); }}
                  placeholder="Ej. 40.5"
                />
              )}
            </Field>
            <Field label="Cotización UI">
              {(id) => (
                <TextInput
                  id={id}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.0001"
                  value={rateUi}
                  onChange={(e) => { setRateUi(e.target.value); setRateUiAuto(false); }}
                  placeholder="Ej. 5.85"
                />
              )}
            </Field>
          </div>
          <p className="text-[10px] -mt-1 mb-1" style={{ color: C.textFaint }}>
            Sugeridas automáticamente según la fecha de la primera cuota (Cotizaciones), pero se pueden editar.
          </p>
          {conversion && (
            <div className="text-xs mt-2 pt-2" style={{ borderTop: `1px solid ${C.border}`, color: C.textMuted }}>
              Importe solicitado ≈ {formatMoney(toMinor(conversion.amountUyu), "UYU")} · {formatUiAmount(conversion.amountUi)}
            </div>
          )}
        </div>
      )}

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
  const isAmerican = (loan.system ?? "frances") === "americano";

  const handleSave = () => {
    const amountMinor = parseAmountInput(amount);
    if (amountMinor === null || amountMinor === 0) return setError("Ingresá un monto válido, mayor a cero.");
    if (!date) return setError("Elegí una fecha.");

    onSave(loanId, {
      id: initial?.id ?? crypto.randomUUID(),
      date,
      amountMinor,
      strategy: isAmerican ? "reduceInstallment" : strategy,
      note: note.trim() || undefined,
    });
  };

  return (
    <Modal title={initial ? "Editar amortización" : "Nueva amortización extraordinaria"} onClose={onClose}>
      <p className="text-xs mb-3" style={{ color: C.textFaint }}>
        Se aplica sobre el saldo del préstamo junto con la primera cuota que venza a partir de esta fecha.
        {!isAmerican && " Elegí si preferís bajar el valor de la cuota o el plazo restante: no se puede hacer las dos cosas con el mismo pago."}
      </p>
      <Field label="Fecha">{(id) => <TextInput id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
      <Field label={`Monto (${loan.currency})`}>
        {(id) => <TextInput id={id} type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />}
      </Field>
      {isAmerican ? (
        <p className="text-xs mb-3" style={{ color: C.textFaint }}>
          En el sistema americano no hay amortización de capital programada: cualquier pago extra siempre reduce el saldo y, con él, el interés de las próximas cuotas.
        </p>
      ) : (
        <>
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
        </>
      )}
      <Field label="Nota (opcional)">{(id) => <TextInput id={id} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>
    </Modal>
  );
}
