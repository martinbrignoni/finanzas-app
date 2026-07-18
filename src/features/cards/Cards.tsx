import { useState } from "react";
import { CreditCard, Pencil, Trash2, Plus, Landmark, ShoppingBag } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Modal, Field, TextInput, Select, Segment, PrimaryButton, IconBtn } from "../../components/ui";
import { ReceiptField, ReceiptButton } from "../../components/ReceiptField";
import { formatMoney, parseAmountInput, fromMinor } from "../../lib/money";
import { currentMonthKey, monthsBetween, todayISO } from "../../lib/dates";
import { accountLabel } from "../../lib/accounts";
import type { Card, Installment, Currency, FinanceData, CardPayment, Account, Bank, Transaction } from "../../types";

/**
 * Deuda real de la tarjeta: cuotas restantes (proyección) + gastos de pago
 * único cargados a la tarjeta, menos los pagos ya registrados. A diferencia
 * de una proyección pura, esto sí se reduce cuando registrás un pago.
 */
function cardDebt(
  cardId: string,
  installments: Installment[],
  transactions: Transaction[],
  cardPayments: CardPayment[],
  mk: string
): Record<Currency, number> {
  const debt: Record<Currency, number> = { UYU: 0, USD: 0 };
  installments.filter((i) => i.cardId === cardId).forEach((inst) => {
    const passed = monthsBetween(inst.startMonth, mk);
    const remaining = Math.max(0, Math.min(inst.numInstallments, inst.numInstallments - Math.max(0, passed)));
    debt[inst.currency] += remaining * inst.installmentAmountMinor;
  });
  transactions.filter((t) => t.type === "gasto" && t.cardId === cardId).forEach((t) => {
    debt[t.currency] += t.amountMinor;
  });
  cardPayments.filter((p) => p.cardId === cardId).forEach((p) => {
    debt[p.currency] -= p.amountMinor;
  });
  return debt;
}

/** Cuota (por moneda) que vence este mes puntualmente para una tarjeta, para sugerir el monto de pago. */
function dueForCardInMonth(cardId: string, installments: Installment[], mk: string): Record<Currency, number> {
  const due: Record<Currency, number> = { UYU: 0, USD: 0 };
  installments.filter((i) => i.cardId === cardId).forEach((inst) => {
    const idx = monthsBetween(inst.startMonth, mk);
    if (idx >= 0 && idx < inst.numInstallments) due[inst.currency] += inst.installmentAmountMinor;
  });
  return due;
}

export function Cards({
  data,
  canEdit,
  canEditMovements,
  onAddCard,
  onEditCard,
  onDeleteCard,
  onAddInstallment,
  onEditInstallment,
  onDeleteInstallment,
  onAddCardPayment,
  onEditCardPayment,
  onDeleteCardPayment,
  onAddCardExpense,
  onEditTransaction,
  onDeleteTransaction,
}: {
  data: FinanceData;
  canEdit: boolean;
  /** Permiso para editar/eliminar los gastos con tarjeta (viven en Movimientos). */
  canEditMovements: boolean;
  onAddCard: () => void;
  onEditCard: (c: Card) => void;
  onDeleteCard: (id: string) => void;
  onAddInstallment: (cardId: string) => void;
  onEditInstallment: (i: Installment) => void;
  onDeleteInstallment: (id: string) => void;
  onAddCardPayment: (cardId: string) => void;
  onEditCardPayment: (p: CardPayment) => void;
  onDeleteCardPayment: (id: string) => void;
  onAddCardExpense: (cardId: string) => void;
  onEditTransaction: (t: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
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
          const debt = cardDebt(card.id, data.installments, data.transactions, data.cardPayments, mk);
          const purchases = data.installments.filter((i) => i.cardId === card.id);
          const expenses = data.transactions
            .filter((t) => t.type === "gasto" && t.cardId === card.id)
            .sort((a, b) => b.date.localeCompare(a.date));
          const payments = data.cardPayments
            .filter((p) => p.cardId === card.id)
            .sort((a, b) => b.date.localeCompare(a.date));
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
                <span style={{ color: C.uyu }}>{formatMoney(Math.max(0, debt.UYU), "UYU")}</span>
                <span style={{ color: C.usd }}>{formatMoney(Math.max(0, debt.USD), "USD")}</span>
              </div>

              {purchases.length > 0 && (
                <div className="space-y-1.5 mb-3">
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
                          {canEdit && (
                            <>
                              <IconBtn label="Editar cuota" onClick={() => onEditInstallment(p)}><Pencil size={13} /></IconBtn>
                              <IconBtn label="Eliminar cuota" danger onClick={() => onDeleteInstallment(p.id)}><Trash2 size={13} /></IconBtn>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {canEdit && (
                <button
                  onClick={() => onAddInstallment(card.id)}
                  className="w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 mb-3"
                  style={{ border: `1px dashed ${C.borderLight}`, color: C.textMuted }}
                >
                  <Plus size={13} /> Agregar compra en cuotas
                </button>
              )}

              <div className="text-xs font-semibold mb-1.5" style={{ color: C.textMuted }}>Gastos con tarjeta</div>
              {expenses.length === 0 ? (
                <p className="text-xs mb-2" style={{ color: C.textFaint }}>Todavía no cargaste gastos de pago único con esta tarjeta.</p>
              ) : (
                <div className="space-y-1.5 mb-2">
                  {expenses.map((t) => (
                    <div key={t.id} className="flex items-center justify-between text-xs rounded-lg px-2.5 py-2" style={{ background: C.surface2 }}>
                      <div className="flex items-center gap-2">
                        <ShoppingBag size={13} color={C.textFaint} />
                        <div>
                          <div style={{ color: C.text }}>{t.category}{t.note ? ` · ${t.note}` : ""}</div>
                          <div style={{ color: C.textFaint }}>{t.date}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono" style={{ color: C.negative }}>-{formatMoney(t.amountMinor, t.currency)}</span>
                        <ReceiptButton path={t.receiptPath} />
                        {canEditMovements && (
                          <>
                            <IconBtn label="Editar gasto" onClick={() => onEditTransaction(t)}><Pencil size={13} /></IconBtn>
                            <IconBtn label="Eliminar gasto" danger onClick={() => onDeleteTransaction(t.id)}><Trash2 size={13} /></IconBtn>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {canEditMovements && (
                <button
                  onClick={() => onAddCardExpense(card.id)}
                  className="w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 mb-3"
                  style={{ border: `1px dashed ${C.borderLight}`, color: C.textMuted }}
                >
                  <Plus size={13} /> Agregar gasto con tarjeta
                </button>
              )}

              <div className="text-xs font-semibold mb-1.5" style={{ color: C.textMuted }}>Pagos registrados</div>
              {payments.length === 0 ? (
                <p className="text-xs mb-2" style={{ color: C.textFaint }}>Todavía no registraste pagos de esta tarjeta.</p>
              ) : (
                <div className="space-y-1.5 mb-2">
                  {payments.map((p) => {
                    const account = data.accounts.find((a) => a.id === p.accountId);
                    return (
                      <div key={p.id} className="flex items-center justify-between text-xs rounded-lg px-2.5 py-2" style={{ background: C.surface2 }}>
                        <div className="flex items-center gap-2">
                          <Landmark size={13} color={C.textFaint} />
                          <div>
                            <div style={{ color: C.text }}>{accountLabel(account, data.banks)}{p.note ? ` · ${p.note}` : ""}</div>
                            <div style={{ color: C.textFaint }}>{p.date}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono" style={{ color: C.negative }}>-{formatMoney(p.amountMinor, p.currency)}</span>
                          <ReceiptButton path={p.receiptPath} />
                          {canEdit && (
                            <>
                              <IconBtn label="Editar pago" onClick={() => onEditCardPayment(p)}><Pencil size={13} /></IconBtn>
                              <IconBtn label="Eliminar pago" danger onClick={() => onDeleteCardPayment(p.id)}><Trash2 size={13} /></IconBtn>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {canEdit && (
                <button
                  onClick={() => onAddCardPayment(card.id)}
                  className="w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1"
                  style={{ border: `1px dashed ${C.borderLight}`, color: C.textMuted }}
                >
                  <Plus size={13} /> Registrar pago
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

export function InstallmentModal({ cardId, initial, onSave, onClose }: { cardId: string; initial?: Installment; onSave: (i: Installment) => void; onClose: () => void }) {
  const [description, setDescription] = useState(initial?.description ?? "");
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? "UYU");
  const [totalAmount, setTotalAmount] = useState(initial ? String(fromMinor(initial.totalAmountMinor)) : "");
  const [numInstallments, setNumInstallments] = useState(initial ? String(initial.numInstallments) : "1");
  const [startMonth, setStartMonth] = useState(initial?.startMonth ?? currentMonthKey());
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
      id: initial?.id ?? crypto.randomUUID(),
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
    <Modal title={initial ? "Editar compra en cuotas" : "Nueva compra en cuotas"} onClose={onClose}>
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

export function CardPaymentModal({
  cardId,
  initial,
  cards,
  accounts,
  banks,
  installments,
  onSave,
  onClose,
}: {
  cardId: string;
  initial?: CardPayment;
  cards: Card[];
  accounts: Account[];
  banks: Bank[];
  installments: Installment[];
  onSave: (p: CardPayment) => void;
  onClose: () => void;
}) {
  const [movementId] = useState(() => initial?.id ?? crypto.randomUUID());
  const [selectedCardId, setSelectedCardId] = useState(initial?.cardId ?? cardId);
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? "UYU");
  const [accountId, setAccountId] = useState(initial?.accountId ?? "");
  const [amount, setAmount] = useState(initial ? String(fromMinor(initial.amountMinor)) : "");
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [note, setNote] = useState(initial?.note ?? "");
  const [receiptPath, setReceiptPath] = useState<string | undefined>(initial?.receiptPath);
  const [error, setError] = useState<string | null>(null);

  const eligibleAccounts = accounts.filter((a) => a.currency === currency);
  const dueThisMonth = dueForCardInMonth(selectedCardId, installments, currentMonthKey());
  const card = cards.find((c) => c.id === selectedCardId);

  const handleSave = () => {
    if (!card) return setError("Elegí una tarjeta.");
    const amountMinor = parseAmountInput(amount);
    if (amountMinor === null || amountMinor === 0) return setError("Ingresá un monto válido, mayor a cero.");
    if (!accountId) return setError("Elegí desde qué cuenta se paga.");
    if (!date) return setError("Elegí una fecha.");

    onSave({
      id: movementId,
      cardId: selectedCardId,
      accountId,
      date,
      amountMinor,
      currency,
      note: note.trim() || undefined,
      receiptPath,
    });
  };

  return (
    <Modal title={initial ? "Editar pago de tarjeta" : "Registrar pago de tarjeta"} onClose={onClose}>
      <Field label="Tarjeta">
        {(id) => (
          <Select id={id} value={selectedCardId} onChange={(e) => setSelectedCardId(e.target.value)}>
            {cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monto">
          {(id) => <TextInput id={id} type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />}
        </Field>
        <Field label="Moneda">
          {() => <Segment value={currency} onChange={(v) => { setCurrency(v); setAccountId(""); }} options={[{ value: "UYU", label: "UYU" }, { value: "USD", label: "USD" }]} />}
        </Field>
      </div>

      {(dueThisMonth.UYU > 0 || dueThisMonth.USD > 0) && (
        <p className="text-xs mb-3" style={{ color: C.textMuted }}>
          Vencimiento de {card?.name ?? "esta tarjeta"} este mes: {dueThisMonth.UYU > 0 && <span className="font-mono">{formatMoney(dueThisMonth.UYU, "UYU")}</span>}
          {dueThisMonth.UYU > 0 && dueThisMonth.USD > 0 && " · "}
          {dueThisMonth.USD > 0 && <span className="font-mono">{formatMoney(dueThisMonth.USD, "USD")}</span>}
        </p>
      )}

      <Field label="Cuenta de origen">
        {(id) =>
          eligibleAccounts.length === 0 ? (
            <p className="text-xs" style={{ color: C.textFaint }}>No tenés cajas en {currency}. Creá una en Cuentas.</p>
          ) : (
            <Select id={id} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Elegí una cuenta</option>
              {eligibleAccounts.map((a) => <option key={a.id} value={a.id}>{accountLabel(a, banks)}</option>)}
            </Select>
          )
        }
      </Field>
      <Field label="Fecha">
        {(id) => <TextInput id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
      </Field>
      <Field label="Nota (opcional)">
        {(id) => <TextInput id={id} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Pago mínimo, pago total..." />}
      </Field>
      <ReceiptField movementId={movementId} path={receiptPath} onChange={setReceiptPath} />
      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>
    </Modal>
  );
}
