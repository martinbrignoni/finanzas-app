import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, ArrowUpRight, ArrowDownRight, Repeat, Download } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Modal, Field, TextInput, Select, Combobox, Segment, PrimaryButton, IconBtn, CurrencyPill } from "../../components/ui";
import { CategoryPicker } from "../../components/CategoryPicker";
import { categoryFullPath } from "../../lib/categories";
import { CategoryModal } from "./Categories";
import { ContactModal } from "../contacts/Contacts";
import { formatMoney, parseAmountInput, fromMinor, ivaIncluidoEn } from "../../lib/money";
import { formatDateDMY, todayISO } from "../../lib/dates";
import { accountSelectLabel } from "../../lib/accounts";
import { cardLabel } from "../../lib/cards";
import { contactKind, IVA_CONTACT_NAME } from "../../lib/contacts";
import { exportRecurringRulesToExcel } from "../../lib/excelExport";
import type { Account, AppUser, Bank, Card, Category, Contact, Currency, RecurrencePeriod, RecurringRule, TransactionType } from "../../types";
import { RECURRENCE_PERIOD_LABELS } from "../../types";

/**
 * Movimientos que se repiten solos (suscripciones, sueldo, alquiler...): acá
 * se los da de alta, se pausan sin perder el historial ya generado, o se
 * edita el monto para las próximas ocurrencias (las ya generadas en
 * Movimientos no cambian retroactivamente).
 */
export function RecurringRulesSettings({
  rules,
  accounts,
  banks,
  cards,
  contacts,
  users,
  canEdit,
  onAdd,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  rules: RecurringRule[];
  accounts: Account[];
  banks: Bank[];
  cards: Card[];
  contacts: Contact[];
  users: AppUser[];
  canEdit: boolean;
  onAdd: () => void;
  onEdit: (r: RecurringRule) => void;
  onToggleActive: (r: RecurringRule) => void;
  onDelete: (id: string) => void;
}) {
  const paymentLabel = (r: RecurringRule): string | null => {
    if (r.type === "gasto" && r.cardId) return cardLabel(cards.find((c) => c.id === r.cardId), banks);
    if (r.accountId) {
      const acc = accounts.find((a) => a.id === r.accountId);
      return acc ? accountSelectLabel(acc, banks) : "cuenta eliminada";
    }
    return null;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs" style={{ color: C.textMuted }}>
          Se generan solos en Movimientos, llegada la fecha, cada vez que abrís la app.
        </p>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {rules.length > 0 && (
            <IconBtn label="Exportar reglas recurrentes a Excel" onClick={() => exportRecurringRulesToExcel(rules, accounts, banks, cards, contacts, users)}>
              <Download size={16} />
            </IconBtn>
          )}
          {canEdit && (
            <button
              onClick={onAdd}
              aria-label="Nueva regla recurrente"
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text }}
            >
              <Plus size={18} />
            </button>
          )}
        </div>
      </div>

      {rules.length === 0 && (
        <div className="rounded-xl p-6 text-center text-sm" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textMuted }}>
          Todavía no cargaste movimientos recurrentes.
        </div>
      )}

      <div className="space-y-2">
        {rules.map((r) => {
          const pay = paymentLabel(r);
          return (
            <div key={r.id} className="rounded-xl p-3" style={{ background: C.surface, border: `1px solid ${C.border}`, opacity: r.active ? 1 : 0.6 }}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: r.type === "ingreso" ? "rgba(111,191,139,0.15)" : "rgba(217,119,106,0.15)" }}
                  >
                    {r.type === "ingreso" ? <ArrowUpRight size={16} color={C.positive} /> : <ArrowDownRight size={16} color={C.negative} />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm truncate" style={{ color: C.text }}>
                      {r.description}
                      {r.category ? ` · ${r.category}` : ""}
                    </div>
                    <div className="text-xs flex items-center gap-1 flex-wrap" style={{ color: C.textFaint }}>
                      <Repeat size={11} />
                      <span>{RECURRENCE_PERIOD_LABELS[r.period]}</span>
                      <span>· Próximo: {formatDateDMY(r.nextDueDate)}</span>
                      {pay && <span>· {pay}</span>}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-sm" style={{ color: r.type === "ingreso" ? C.positive : C.negative }}>
                    {r.type === "ingreso" ? "+" : "-"}{formatMoney(r.amountMinor, r.currency)}
                  </div>
                  <CurrencyPill currency={r.currency} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                {canEdit ? (
                  <Segment
                    value={r.active ? "on" : "off"}
                    onChange={() => onToggleActive(r)}
                    options={[{ value: "on", label: "Activa" }, { value: "off", label: "Pausada" }]}
                  />
                ) : (
                  <span className="text-xs" style={{ color: C.textFaint }}>{r.active ? "Activa" : "Pausada"}</span>
                )}
                {canEdit && (
                  <div className="flex gap-1">
                    <IconBtn label="Editar regla recurrente" onClick={() => onEdit(r)}><Pencil size={14} /></IconBtn>
                    <IconBtn label="Eliminar regla recurrente" danger onClick={() => onDelete(r.id)}><Trash2 size={14} /></IconBtn>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type PaymentMethod = "ninguno" | "cuenta" | "tarjeta" | "persona";

interface FormState {
  type: TransactionType;
  description: string;
  amount: string;
  currency: Currency;
  category: string;
  note: string;
  period: RecurrencePeriod;
  nextDueDate: string;
  paymentMethod: PaymentMethod;
  accountId: string;
  cardId: string;
  /**
   * "¿IVA Compras?" (Gasto) o "¿IVA Ventas?" (Ingreso), igual que en Nuevo
   * Movimiento: cada ocurrencia que se genere queda registrada por la
   * diferencia (neto de IVA) y, aparte, se acredita el IVA en Personas
   * contra Gustavo Brignoni (ver `lib/recurring.ts`).
   */
  ivaChecked: boolean;
  ivaAmount: string;
  /** Persona o concepto como medio de pago (ver `RecurringRule.personaContactId`). */
  contactId: string;
  personaAmount: string;
  active: boolean;
}

export function RecurringRuleModal({
  initial,
  accounts,
  banks,
  cards,
  categories,
  contacts,
  onSave,
  onSaveCategory,
  onSaveContact,
  onClose,
}: {
  initial?: RecurringRule;
  accounts: Account[];
  banks: Bank[];
  cards: Card[];
  categories: Category[];
  contacts: Contact[];
  onSave: (r: RecurringRule) => void;
  onSaveCategory: (c: Category) => void;
  /** Crear una persona o concepto nuevo (sin salir del modal de recurrente). */
  onSaveContact: (c: Contact) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => ({
    type: initial?.type ?? "gasto",
    description: initial?.description ?? "",
    amount: initial ? String(fromMinor(initial.amountMinor)) : "",
    currency: initial?.currency ?? "UYU",
    category: initial?.category ?? "",
    note: initial?.note ?? "",
    period: initial?.period ?? "mensual",
    nextDueDate: initial?.nextDueDate ?? todayISO(),
    paymentMethod: initial?.personaContactId ? "persona" : initial?.cardId ? "tarjeta" : initial?.accountId ? "cuenta" : "ninguno",
    accountId: initial?.accountId ?? "",
    cardId: initial?.cardId ?? "",
    ivaChecked: !!initial?.ivaAmountMinor,
    ivaAmount: initial?.ivaAmountMinor ? String(fromMinor(initial.ivaAmountMinor)) : "",
    contactId: initial?.personaContactId ?? contacts[0]?.id ?? "",
    personaAmount: initial?.personaAmountMinor ? String(fromMinor(initial.personaAmountMinor)) : "",
    active: initial?.active ?? true,
  }));
  const [error, setError] = useState<string | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);

  const eligibleAccounts = accounts.filter((a) => a.currency === form.currency);
  const selectedContact = contacts.find((c) => c.id === form.contactId);

  // Sugiere el IVA (tasa básica, 22%) contenido en el monto, mientras el
  // usuario no haya tocado el campo a mano (igual que en Nuevo Movimiento).
  const [ivaAutoSuggested, setIvaAutoSuggested] = useState(true);
  useEffect(() => {
    if (!form.ivaChecked || !ivaAutoSuggested) return;
    const amountNum = parseFloat(form.amount.replace(",", "."));
    if (!Number.isFinite(amountNum) || amountNum <= 0) return;
    setForm((f) => ({ ...f, ivaAmount: String(ivaIncluidoEn(amountNum)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.ivaChecked, form.amount, ivaAutoSuggested]);

  const handleSave = () => {
    if (!form.description.trim()) return setError("Ingresá una descripción (ej. Netflix, Sueldo).");
    const amountMinor = parseAmountInput(form.amount);
    if (amountMinor === null || amountMinor === 0) return setError("Ingresá un monto válido, mayor a cero.");
    if (!form.nextDueDate) return setError("Elegí la próxima fecha.");
    if (form.type === "gasto" && form.paymentMethod === "tarjeta" && !form.cardId) return setError("Elegí una tarjeta.");

    let ivaAmountMinor: number | undefined;
    if (form.ivaChecked) {
      const parsedIva = parseAmountInput(form.ivaAmount);
      if (parsedIva === null || parsedIva <= 0) return setError("Ingresá un monto de IVA válido, mayor a cero.");
      if (parsedIva >= amountMinor) return setError("El IVA no puede ser mayor o igual al monto total.");
      ivaAmountMinor = parsedIva;
    }

    let personaContactId: string | undefined;
    let personaAmountMinor: number | undefined;
    if (form.paymentMethod === "persona") {
      if (!form.contactId) return setError("Elegí una persona o concepto.");
      personaContactId = form.contactId;
      const raw = form.personaAmount.trim();
      if (raw) {
        const parsed = parseAmountInput(raw);
        if (parsed === null || parsed <= 0) return setError("Ingresá un monto válido para la persona, mayor a cero.");
        if (parsed > amountMinor) return setError("El monto a cargo de la persona no puede ser mayor al total.");
        personaAmountMinor = parsed;
      }
    }

    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      type: form.type,
      description: form.description.trim(),
      amountMinor,
      currency: form.currency,
      category: form.category || undefined,
      note: form.note.trim() || undefined,
      accountId: form.paymentMethod === "cuenta" ? form.accountId || undefined : undefined,
      cardId: form.type === "gasto" && form.paymentMethod === "tarjeta" ? form.cardId || undefined : undefined,
      ivaAmountMinor,
      personaContactId,
      personaAmountMinor,
      period: form.period,
      nextDueDate: form.nextDueDate,
      active: form.active,
      createdByUserId: initial?.createdByUserId,
    });
  };

  return (
    <Modal title={initial ? "Editar recurrente" : "Nuevo recurrente"} onClose={onClose}>
      <Field label="Tipo">
        {() => (
          <Segment
            value={form.type}
            onChange={(v) => setForm((f) => ({ ...f, type: v, category: "", paymentMethod: v === "ingreso" ? (f.paymentMethod === "tarjeta" ? "ninguno" : f.paymentMethod) : f.paymentMethod }))}
            options={[{ value: "gasto", label: "Gasto" }, { value: "ingreso", label: "Ingreso" }]}
          />
        )}
      </Field>

      <Field label="Descripción">
        {(id) => (
          <TextInput
            id={id}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder={form.type === "ingreso" ? "ej. Sueldo" : "ej. Netflix"}
            autoFocus
          />
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Monto">
          {(id) => <TextInput id={id} type="text" inputMode="decimal" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0" />}
        </Field>
        <Field label="Moneda">
          {() => <Segment value={form.currency} onChange={(v) => setForm((f) => ({ ...f, currency: v }))} options={[{ value: "UYU", label: "UYU" }, { value: "USD", label: "USD" }]} />}
        </Field>
      </div>

      <CategoryPicker
        categories={categories}
        type={form.type}
        value={form.category}
        onChange={(name) => setForm((f) => ({ ...f, category: name }))}
        allowEmpty
      />
      <div className="flex justify-end -mt-1 mb-3">
        <button type="button" onClick={() => setShowCategoryModal(true)} className="text-xs font-semibold" style={{ color: C.usd }}>
          + Nueva categoría
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Periodicidad">
          {() => (
            <Select value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value as RecurrencePeriod }))}>
              <option value="diaria">Diaria</option>
              <option value="semanal">Semanal</option>
              <option value="mensual">Mensual</option>
              <option value="trimestral">Trimestral</option>
              <option value="anual">Anual</option>
            </Select>
          )}
        </Field>
        <Field label={initial ? "Próxima fecha" : "Primera fecha"}>
          {(id) => <TextInput id={id} type="date" value={form.nextDueDate} onChange={(e) => setForm((f) => ({ ...f, nextDueDate: e.target.value }))} />}
        </Field>
      </div>

      <Field label="Nota (opcional)">
        {(id) => <TextInput id={id} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Detalle..." />}
      </Field>

      <Field label={form.type === "ingreso" ? "¿IVA Ventas?" : "¿IVA Compras?"}>
        {() => (
          <Segment
            value={form.ivaChecked ? "si" : "no"}
            onChange={(v) => {
              setIvaAutoSuggested(true);
              setForm((f) => ({ ...f, ivaChecked: v === "si", ivaAmount: v === "si" ? f.ivaAmount : "" }));
            }}
            options={[
              { value: "no", label: "No" },
              { value: "si", label: "Sí" },
            ]}
          />
        )}
      </Field>
      {form.ivaChecked && (
        <>
          <Field label={`IVA de esta ${form.type === "ingreso" ? "venta" : "compra"} (${form.currency})`}>
            {(id) => (
              <TextInput
                id={id}
                type="text"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={form.ivaAmount}
                onChange={(e) => {
                  setIvaAutoSuggested(false);
                  setForm((f) => ({ ...f, ivaAmount: e.target.value }));
                }}
                placeholder="0"
              />
            )}
          </Field>
          <p className="text-xs -mt-2 mb-3" style={{ color: C.textFaint }}>
            Sugerido con IVA tasa básica (22%) sobre el monto de arriba; editalo si corresponde otra tasa. Cada ocurrencia queda registrada por la diferencia (neto de IVA); el IVA se acredita aparte en Personas:{" "}
            {form.type === "ingreso"
              ? `le vas a quedar debiendo ese importe a ${IVA_CONTACT_NAME} (débito a remitir).`
              : `${IVA_CONTACT_NAME} te va a quedar debiendo ese importe (crédito recuperable).`}
          </p>
        </>
      )}

      <Field label="Medio de pago">
        {() => (
          <Segment
            value={form.paymentMethod}
            onChange={(v) => setForm((f) => ({ ...f, paymentMethod: v, accountId: "", cardId: "" }))}
            options={
              form.type === "gasto"
                ? [
                    { value: "ninguno" as const, label: "Sin asignar" },
                    { value: "cuenta" as const, label: "Cuenta" },
                    { value: "tarjeta" as const, label: "Tarjeta" },
                    ...(contacts.length > 0 ? [{ value: "persona" as const, label: "Persona" }] : []),
                  ]
                : [
                    { value: "ninguno" as const, label: "Sin asignar" },
                    { value: "cuenta" as const, label: "Cuenta" },
                    ...(contacts.length > 0 ? [{ value: "persona" as const, label: "Persona" }] : []),
                  ]
            }
          />
        )}
      </Field>
      {form.paymentMethod === "cuenta" && (
        <Field label="Cuenta">
          {(id) =>
            eligibleAccounts.length === 0 ? (
              <p className="text-xs" style={{ color: C.textFaint }}>No tenés cajas en {form.currency}. Creá una en Cuentas.</p>
            ) : (
              <Combobox
                id={id}
                value={form.accountId}
                placeholder="Elegí una cuenta"
                onChange={(accountId) => setForm((f) => ({ ...f, accountId }))}
                options={eligibleAccounts.map((a) => ({ value: a.id, label: accountSelectLabel(a, banks) }))}
              />
            )
          }
        </Field>
      )}
      {form.paymentMethod === "tarjeta" && (
        <Field label="Tarjeta">
          {(id) =>
            cards.length === 0 ? (
              <p className="text-xs" style={{ color: C.textFaint }}>No tenés tarjetas creadas. Creá una en Tarjetas.</p>
            ) : (
              <Combobox
                id={id}
                value={form.cardId}
                placeholder="Elegí una tarjeta"
                onChange={(cardId) => setForm((f) => ({ ...f, cardId }))}
                options={cards.map((c) => ({ value: c.id, label: cardLabel(c, banks) }))}
              />
            )
          }
        </Field>
      )}
      {form.paymentMethod === "persona" && (
        <>
          {contacts.length === 0 ? (
            <p className="text-xs mb-3" style={{ color: C.textFaint }}>
              Todavía no tenés personas ni conceptos cargados. Creá uno con el botón de abajo.
            </p>
          ) : (
            <Field label="Persona o concepto">
              {(id) => (
                <Combobox
                  id={id}
                  value={form.contactId}
                  placeholder="Elegí a quién o qué"
                  onChange={(contactId) => setForm((f) => ({ ...f, contactId }))}
                  options={[...contacts]
                    .sort((a, b) => (contactKind(a) === contactKind(b) ? 0 : contactKind(a) === "persona" ? -1 : 1))
                    .map((c) => ({ value: c.id, label: c.name, group: contactKind(c) === "concepto" ? "Conceptos" : "Personas" }))}
                />
              )}
            </Field>
          )}
          <div className="flex justify-end -mt-1 mb-3">
            <button type="button" onClick={() => setShowContactModal(true)} className="text-xs font-semibold" style={{ color: C.usd }}>
              + Nueva persona o concepto
            </button>
          </div>
          <Field
            label={
              form.type === "ingreso"
                ? `¿Cuánto te va a deber ${selectedContact?.name ?? "esta persona"}? (opcional)`
                : `¿Cuánto pone ${selectedContact?.name ?? "esta persona"}? (opcional)`
            }
          >
            {(id) => (
              <TextInput
                id={id}
                type="text"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={form.personaAmount}
                onChange={(e) => setForm((f) => ({ ...f, personaAmount: e.target.value }))}
                placeholder={`Todo (${form.amount || "0"})`}
              />
            )}
          </Field>
          <p className="text-xs -mt-2 mb-3" style={{ color: C.textFaint }}>
            {form.type === "ingreso"
              ? `Cada ocurrencia queda categorizada como ingreso completo, aunque todavía no la cobres. Si dejás este campo vacío, se asume que ${selectedContact?.name ?? "esta persona"} debe el 100%. Se registra en Personas a favor tuyo; cuando cobres de verdad, registralo como Transferencia > Personas contra la cuenta del banco.`
              : `Cada ocurrencia queda categorizada como gasto completo. Si dejás este campo vacío, se asume que ${selectedContact?.name ?? "esta persona"} pone el 100%. Se registra además un movimiento en Personas por ese importe (le quedás debiendo).`}
          </p>
        </>
      )}

      <Field label="Estado">
        {() => (
          <Segment
            value={form.active ? "on" : "off"}
            onChange={(v) => setForm((f) => ({ ...f, active: v === "on" }))}
            options={[{ value: "on", label: "Activa" }, { value: "off", label: "Pausada" }]}
          />
        )}
      </Field>

      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>

      {showCategoryModal && (
        <CategoryModal
          categories={categories}
          defaultType={form.type}
          onSave={(c) => {
            onSaveCategory(c);
            setForm((f) => ({ ...f, category: categoryFullPath(c, [...categories, c]) }));
            setShowCategoryModal(false);
          }}
          onClose={() => setShowCategoryModal(false)}
        />
      )}
      {showContactModal && (
        <ContactModal
          contacts={contacts}
          onSave={(c) => {
            onSaveContact(c);
            setForm((f) => ({ ...f, contactId: c.id }));
            setShowContactModal(false);
          }}
          onClose={() => setShowContactModal(false)}
        />
      )}
    </Modal>
  );
}
