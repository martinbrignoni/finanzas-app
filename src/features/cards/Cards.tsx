import { useState } from "react";
import { CreditCard, Pencil, Trash2, Plus } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Modal, Field, TextInput, Segment, PrimaryButton, IconBtn } from "../../components/ui";
import { formatMoney, parseAmountInput } from "../../lib/money";
import { currentMonthKey, monthsBetween } from "../../lib/dates";
import type { Card, Installment, Currency, FinanceData } from "../../types";

function debtForCard(cardId: string, installments: Installment[], mk: string): Record<Currency, number> {
  const debt: Record<Currency, number> = { UYU: 0, USD: 0 };
  installments.filter((i) => i.cardId === cardId).forEach((inst) => {
    const passed = monthsBetween(inst.startMonth, mk);
    const remaining = Math.max(0, Math.min(inst.numInstallments, inst.numInstallments - Math.max(0, passed)));
    debt[inst.currency] += remaining * inst.installmentAmountMinor;
  });
  return debt;
}

export function Cards({
  data,
  canEdit,
  onAddCard,
  onEditCard,
  onDeleteCard,
  onAddInstallment,
  onDeleteInstallment,
}: {
  data: FinanceData;
  canEdit: boolean;
  onAddCard: () => void;
  onEditCard: (c: Card) => void;
  onDeleteCard: (id: string) => void;
  onAddInstallment: (cardId: string) => void;
  onDeleteInstallment: (id: string) => void;
}) {
  const mk = currentMonthKey();
  return (
    <div className="pb-24">
      <h1 className="text-2xl mb-4 font-display" style={{ color: C.text }}>Tarjetas y cuotas</h1>

      {data.cards.length === 0 && (
        <div className="rounded-xl p-6 text-center text-sm mb-4" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textMuted }}>
          Todavía no agregaste tarjetas.
        </div>
      )}

      <div className="space-y-3 mb-4">
        {data.cards.map((card) => {
          const debt = debtForCard(card.id, data.installments, mk);
          const purchases = data.installments.filter((i) => i.cardId === card.id);
          return (
            <div key={card.id} className="rounded-2xl p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: C.surface3 }}>
                    <CreditCard size={16} color={C.usd} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: C.text }}>{card.name}</div>
                    <div className="text-xs" style={{ color: C.textFaint }}>Cierre {card.closingDay} · Vence {card.dueDay}</div>
                  </div>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <IconBtn label="Editar tarjeta" onClick={() => onEditCard(card)}><Pencil size={15} /></IconBtn>
                    <IconBtn label="Eliminar tarjeta" danger onClick={() => onDeleteCard(card.id)}><Trash2 size={15} /></IconBtn>
                  </div>
                )}
              </div>

              <div className="flex gap-4 mb-3 text-xs font-mono" style={{ color: C.textMuted }}>
                <span>Deuda pendiente:</span>
                <span style={{ color: C.uyu }}>{formatMoney(debt.UYU, "UYU")}</span>
                <span style={{ color: C.usd }}>{formatMoney(debt.USD, "USD")}</span>
              </div>

              {purchases.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {purchases.map((p) => {
                    const passed = monthsBetween(p.startMonth, mk);
                    const cuotaActual = Math.min(Math.max(passed + 1, 1), p.numInstallments);
                    const finished = passed >= p.numInstallments;
                    return (
                      <div key={p.id} className="flex items-center justify-between text-xs rounded-lg px-2.5 py-2" style={{ background: C.surface2 }}>
                        <div>
                          <div style={{ color: C.text }}>{p.description}</div>
                          <div style={{ color: C.textFaint }}>{finished ? "Pagada" : `Cuota ${cuotaActual}/${p.numInstallments}`}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono" style={{ color: C.textMuted }}>{formatMoney(p.installmentAmountMinor, p.currency)}</span>
                          {canEdit && <IconBtn label="Eliminar cuota" danger onClick={() => onDeleteInstallment(p.id)}><Trash2 size={13} /></IconBtn>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {canEdit && (
                <button
                  onClick={() => onAddInstallment(card.id)}
                  className="w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1"
                  style={{ border: `1px dashed ${C.borderLight}`, color: C.textMuted }}
                >
                  <Plus size={13} /> Agregar compra en cuotas
                </button>
              )}
            </div>
          );
        })}
      </div>

      {canEdit && (
        <button
          onClick={onAddCard}
          className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
          style={{ background: C.surface2, border: `1px dashed ${C.borderLight}`, color: C.textMuted }}
        >
          <Plus size={16} /> Agregar tarjeta
        </button>
      )}
    </div>
  );
}

export function CardModal({ initial, onSave, onClose }: { initial?: Card; onSave: (c: Card) => void; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [closingDay, setClosingDay] = useState(String(initial?.closingDay ?? 20));
  const [dueDay, setDueDay] = useState(String(initial?.dueDay ?? 5));
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    const cd = parseInt(closingDay), dd = parseInt(dueDay);
    if (!name.trim()) return setError("Ingresá un nombre para la tarjeta.");
    if (!Number.isInteger(cd) || cd < 1 || cd > 31 || !Number.isInteger(dd) || dd < 1 || dd > 31) {
      return setError("Los días deben estar entre 1 y 31.");
    }
    onSave({ id: initial?.id ?? crypto.randomUUID(), name: name.trim(), closingDay: cd, dueDay: dd });
  };

  return (
    <Modal title={initial ? "Editar tarjeta" : "Nueva tarjeta"} onClose={onClose}>
      <Field label="Nombre">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Visa, Santander..." />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Día de cierre">{(id) => <TextInput id={id} type="number" min={1} max={31} value={closingDay} onChange={(e) => setClosingDay(e.target.value)} />}</Field>
        <Field label="Día de vencimiento">{(id) => <TextInput id={id} type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} />}</Field>
      </div>
      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>
    </Modal>
  );
}

export function InstallmentModal({ cardId, onSave, onClose }: { cardId: string; onSave: (i: Installment) => void; onClose: () => void }) {
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState<Currency>("UYU");
  const [totalAmount, setTotalAmount] = useState("");
  const [numInstallments, setNumInstallments] = useState("1");
  const [startMonth, setStartMonth] = useState(currentMonthKey());
  const [error, setError] = useState<string | null>(null);

  const totalMinorPreview = parseAmountInput(totalAmount) ?? 0;
  const n = Math.max(1, parseInt(numInstallments) || 1);
  const previewInstallment = totalMinorPreview ? Math.round(totalMinorPreview / n) : 0;

  const handleSave = () => {
    const totalAmountMinor = parseAmountInput(totalAmount);
    if (!description.trim()) return setError("Ingresá una descripción.");
    if (totalAmountMinor === null || totalAmountMinor === 0) return setError("Ingresá un monto total válido.");
    if (n < 1) return setError("La cantidad de cuotas debe ser al menos 1.");

    onSave({
      id: crypto.randomUUID(),
      cardId,
      description: description.trim(),
      currency,
      totalAmountMinor,
      numInstallments: n,
      startMonth,
      installmentAmountMinor: Math.round(totalAmountMinor / n),
    });
  };

  return (
    <Modal title="Nueva compra en cuotas" onClose={onClose}>
      <Field label="Descripción">{(id) => <TextInput id={id} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Heladera, notebook..." />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monto total">{(id) => <TextInput id={id} type="number" min="0" step="0.01" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} placeholder="0" />}</Field>
        <Field label="Moneda">{() => <Segment value={currency} onChange={setCurrency} options={[{ value: "UYU", label: "UYU" }, { value: "USD", label: "USD" }]} />}</Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cantidad de cuotas">{(id) => <TextInput id={id} type="number" min="1" value={numInstallments} onChange={(e) => setNumInstallments(e.target.value)} />}</Field>
        <Field label="Primer mes">{(id) => <TextInput id={id} type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />}</Field>
      </div>
      <div className="text-xs mb-2" style={{ color: C.textMuted }}>
        Cuota estimada: <span className="font-mono" style={{ color: C.text }}>{formatMoney(previewInstallment, currency)}</span>
      </div>
      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>
    </Modal>
  );
}
