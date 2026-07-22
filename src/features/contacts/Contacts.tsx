import { useState } from "react";
import { User, Plus, Pencil, Trash2, ChevronRight, Split, Landmark } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Modal, Field, TextInput, Select, Segment, PrimaryButton, IconBtn } from "../../components/ui";
import { ReceiptField, ReceiptButton } from "../../components/ReceiptField";
import { CategoryPicker, defaultLeafCategoryValue } from "../../components/CategoryPicker";
import { receiptPathsOf } from "../../lib/receipts";
import { formatMoney, parseAmountInput, fromMinor } from "../../lib/money";
import { formatDateDMY, todayISO } from "../../lib/dates";
import { contactBalance, contactCategories } from "../../lib/contacts";
import { accountLabel, accountSelectLabel, isAccountActive } from "../../lib/accounts";
import type { Contact, ContactEntry, Account, Bank, Currency, Category } from "../../types";

/** Resumen de saldo de una persona: "Te debe $X" (verde), "Le debés $X" (rojo), o "Saldado" si está en cero en todas las monedas. */
function BalanceSummary({ balance, size = "sm" }: { balance: Record<Currency, number>; size?: "sm" | "lg" }) {
  const parts = (["UYU", "USD"] as Currency[]).map((cur) => ({ cur, amt: balance[cur] })).filter((x) => x.amt !== 0);
  const textClass = size === "lg" ? "text-sm" : "text-xs";
  if (parts.length === 0) {
    return <span className={textClass} style={{ color: C.textFaint }}>Saldado</span>;
  }
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
      {parts.map(({ cur, amt }) => (
        <span key={cur} className={`font-mono ${textClass}`} style={{ color: amt > 0 ? C.positive : C.negative }}>
          {amt > 0 ? "Te debe " : "Le debés "}{formatMoney(Math.abs(amt), cur)}
        </span>
      ))}
    </div>
  );
}

export function Contacts({
  contacts,
  contactEntries,
  accounts,
  banks,
  canEdit,
  onAddContact,
  onEditContact,
  onDeleteContact,
  onAddEntry,
  onEditEntry,
  onDeleteEntry,
  onSplitExpense,
}: {
  contacts: Contact[];
  contactEntries: ContactEntry[];
  accounts: Account[];
  banks: Bank[];
  canEdit: boolean;
  onAddContact: () => void;
  onEditContact: (c: Contact) => void;
  onDeleteContact: (id: string) => void;
  onAddEntry: (contactId: string) => void;
  onEditEntry: (e: ContactEntry) => void;
  onDeleteEntry: (id: string) => void;
  onSplitExpense: () => void;
}) {
  const [viewContactId, setViewContactId] = useState<string | null>(null);
  const viewContact = contacts.find((c) => c.id === viewContactId) ?? null;
  const [filter, setFilter] = useState<string>("Todos");
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const usedCategories = Array.from(new Set(contacts.map((c) => c.category).filter((c): c is string => !!c)));
  const filterOptions = ["Todos", ...usedCategories];
  const filtered = filter === "Todos" ? contacts : contacts.filter((c) => c.category === filter);

  return (
    <div className="pb-24">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-display" style={{ color: C.text }}>Personas</h1>
        {canEdit && (
          <div className="relative">
            <button
              onClick={() => setAddMenuOpen((v) => !v)}
              aria-label="Agregar"
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text }}
            >
              <Plus size={18} />
            </button>
            {addMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setAddMenuOpen(false)} />
                <div
                  className="absolute right-0 top-11 z-40 rounded-lg overflow-hidden w-56"
                  style={{ background: C.surface, border: `1px solid ${C.border}` }}
                >
                  <button
                    onClick={() => { setAddMenuOpen(false); onAddContact(); }}
                    className="w-full text-left px-3 py-2.5 text-sm flex items-center gap-2"
                    style={{ color: C.text }}
                  >
                    <User size={14} /> Nueva persona
                  </button>
                  <button
                    onClick={() => { if (contacts.length === 0) return; setAddMenuOpen(false); onSplitExpense(); }}
                    disabled={contacts.length === 0}
                    className="w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 disabled:opacity-40"
                    style={{ color: C.text, borderTop: `1px solid ${C.border}` }}
                  >
                    <Split size={14} /> Dividir gasto
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {contacts.length === 0 && (
        <div className="rounded-xl p-6 text-center text-sm mb-4" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textMuted }}>
          Todavía no agregaste personas. Usalo para llevar la cuenta de lo que pagás por otros o pagan por vos.
        </div>
      )}

      {filterOptions.length > 1 && (
        <div className="mb-4 flex gap-1.5 flex-wrap">
          {filterOptions.map((opt) => (
            <button
              key={opt}
              onClick={() => setFilter(opt)}
              className="text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{
                background: filter === opt ? C.surface3 : C.surface2,
                border: `1px solid ${filter === opt ? C.borderLight : C.border}`,
                color: filter === opt ? C.text : C.textMuted,
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2 mb-4">
        {filtered.map((contact) => {
          const balance = contactBalance(contact, contactEntries);
          return (
            <button
              key={contact.id}
              onClick={() => setViewContactId(contact.id)}
              className="w-full text-left rounded-xl p-3.5"
              style={{ background: C.surface, border: `1px solid ${C.border}` }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: C.surface3 }}>
                    <User size={16} color={C.usd} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: C.text }}>{contact.name}</div>
                    {contact.category && <div className="text-[10px]" style={{ color: C.textFaint }}>{contact.category}</div>}
                  </div>
                </div>
                <ChevronRight size={16} color={C.textFaint} />
              </div>
              <BalanceSummary balance={balance} />
            </button>
          );
        })}
      </div>

      {canEdit && (
        <button
          onClick={onAddContact}
          className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
          style={{ background: C.surface2, border: `1px dashed ${C.borderLight}`, color: C.textMuted }}
        >
          <Plus size={16} /> Nueva persona
        </button>
      )}

      {viewContact && (
        <ContactLedgerModal
          contact={viewContact}
          entries={contactEntries.filter((e) => e.contactId === viewContact.id)}
          accounts={accounts}
          banks={banks}
          canEdit={canEdit}
          onAddEntry={() => onAddEntry(viewContact.id)}
          onEditEntry={onEditEntry}
          onDeleteEntry={onDeleteEntry}
          onEditContact={() => onEditContact(viewContact)}
          onDeleteContact={() => { onDeleteContact(viewContact.id); setViewContactId(null); }}
          onClose={() => setViewContactId(null)}
        />
      )}
    </div>
  );
}

function ContactLedgerModal({
  contact,
  entries,
  accounts,
  banks,
  canEdit,
  onAddEntry,
  onEditEntry,
  onDeleteEntry,
  onEditContact,
  onDeleteContact,
  onClose,
}: {
  contact: Contact;
  entries: ContactEntry[];
  accounts: Account[];
  banks: Bank[];
  canEdit: boolean;
  onAddEntry: () => void;
  onEditEntry: (e: ContactEntry) => void;
  onDeleteEntry: (id: string) => void;
  onEditContact: () => void;
  onDeleteContact: () => void;
  onClose: () => void;
}) {
  const balance = contactBalance(contact, entries);
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Modal title={contact.name} onClose={onClose}>
      {contact.category && <p className="text-xs mb-3" style={{ color: C.textFaint }}>{contact.category}</p>}

      <div className="rounded-lg p-3 mb-4" style={{ background: C.surface2, border: `1px solid ${C.border}` }}>
        <BalanceSummary balance={balance} size="lg" />
      </div>

      {canEdit && (
        <div className="flex gap-2 mb-3">
          <button
            onClick={onEditContact}
            className="flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1"
            style={{ border: `1px solid ${C.border}`, color: C.textMuted }}
          >
            <Pencil size={13} /> Editar persona
          </button>
          <button
            onClick={onDeleteContact}
            className="flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1"
            style={{ border: `1px solid ${C.border}`, color: C.negative }}
          >
            <Trash2 size={13} /> Eliminar
          </button>
        </div>
      )}

      {canEdit && (
        <button
          onClick={onAddEntry}
          className="w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 mb-4"
          style={{ border: `1px dashed ${C.borderLight}`, color: C.textMuted }}
        >
          <Plus size={13} /> Nuevo movimiento
        </button>
      )}

      {sorted.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: C.textMuted }}>Todavía no hay movimientos con {contact.name}.</p>
      ) : (
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {sorted.map((e) => {
            const account = accounts.find((a) => a.id === e.accountId);
            return (
              <div key={e.id} className="rounded-xl p-3" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm" style={{ color: C.text }}>{e.description}</div>
                    <div className="text-xs flex items-center gap-1" style={{ color: C.textFaint }}>
                      {formatDateDMY(e.date)}
                      {account && (
                        <>
                          <span>·</span>
                          <Landmark size={11} /> {accountLabel(account, banks)}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-sm" style={{ color: e.amountMinor >= 0 ? C.positive : C.negative }}>
                      {e.amountMinor >= 0 ? "+" : "-"}{formatMoney(Math.abs(e.amountMinor), e.currency)}
                    </span>
                    <ReceiptButton paths={receiptPathsOf(e)} />
                    {canEdit && (
                      <>
                        <IconBtn label="Editar movimiento" onClick={() => onEditEntry(e)}><Pencil size={13} /></IconBtn>
                        <IconBtn label="Eliminar movimiento" danger onClick={() => onDeleteEntry(e.id)}><Trash2 size={13} /></IconBtn>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

export function ContactModal({
  initial,
  contacts,
  onSave,
  onClose,
}: {
  initial?: Contact;
  contacts: Contact[];
  onSave: (c: Contact) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const categorySuggestions = contactCategories(contacts);

  const handleSave = () => {
    if (!name.trim()) return setError("Ingresá un nombre.");
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      category: category.trim() || undefined,
      note: note.trim() || undefined,
    });
  };

  return (
    <Modal title={initial ? "Editar persona" : "Nueva persona"} onClose={onClose}>
      <Field label="Nombre">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Juan Pérez" />}</Field>
      <Field label="Categoría (opcional)">
        {(id) => (
          <>
            <TextInput id={id} list="contact-category-suggestions" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Personas, Clientes, Familia..." />
            <datalist id="contact-category-suggestions">
              {categorySuggestions.map((c) => <option key={c} value={c} />)}
            </datalist>
          </>
        )}
      </Field>
      <Field label="Nota (opcional)">{(id) => <TextInput id={id} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>
    </Modal>
  );
}

export function ContactEntryModal({
  contactId,
  initial,
  contacts,
  accounts,
  banks,
  onSave,
  onClose,
}: {
  contactId: string;
  initial?: ContactEntry;
  contacts: Contact[];
  accounts: Account[];
  banks: Bank[];
  onSave: (e: ContactEntry) => void;
  onClose: () => void;
}) {
  const [selectedContactId, setSelectedContactId] = useState(initial?.contactId ?? contactId);
  const [favorMio, setFavorMio] = useState(initial ? initial.amountMinor >= 0 : true);
  const [amount, setAmount] = useState(initial ? String(fromMinor(Math.abs(initial.amountMinor))) : "");
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? "UYU");
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [description, setDescription] = useState(initial?.description ?? "");
  const [accountId, setAccountId] = useState(initial?.accountId ?? "");
  const [entryId] = useState(() => initial?.id ?? crypto.randomUUID());
  const [receiptPaths, setReceiptPaths] = useState<string[]>(receiptPathsOf(initial));
  const [error, setError] = useState<string | null>(null);

  const eligibleAccounts = accounts.filter((a) => a.currency === currency && (isAccountActive(a) || a.id === accountId));

  const handleSave = () => {
    if (!selectedContactId) return setError("Elegí una persona.");
    const amountAbs = parseAmountInput(amount);
    if (amountAbs === null || amountAbs === 0) return setError("Ingresá un monto válido, mayor a cero.");
    if (!description.trim()) return setError("Ingresá una descripción.");
    if (!date) return setError("Elegí una fecha.");

    onSave({
      id: entryId,
      contactId: selectedContactId,
      date,
      amountMinor: favorMio ? amountAbs : -amountAbs,
      currency,
      description: description.trim(),
      accountId: accountId || undefined,
      receiptPaths,
    });
  };

  return (
    <Modal title={initial ? "Editar movimiento" : "Nuevo movimiento"} onClose={onClose}>
      <Field label="Persona">
        {(id) => (
          <Select id={id} value={selectedContactId} onChange={(e) => setSelectedContactId(e.target.value)}>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}
      </Field>
      <Field label="Tipo de movimiento">
        {() => (
          <Segment
            value={favorMio ? "favor" : "contra"}
            onChange={(v) => setFavorMio(v === "favor")}
            options={[
              { value: "favor", label: "A favor mío" },
              { value: "contra", label: "A favor suyo" },
            ]}
          />
        )}
      </Field>
      <p className="text-xs -mt-2 mb-3" style={{ color: C.textFaint }}>
        {favorMio
          ? "Vos pusiste la plata (pagaste algo suyo, le prestaste, o le devolviste lo que le debías). Aumenta lo que te debe."
          : "Ella puso la plata (te pagó, te devolvió algo, o pagó algo tuyo). Disminuye lo que te debe."}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monto">
          {(id) => <TextInput id={id} type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />}
        </Field>
        <Field label="Moneda">
          {() => <Segment value={currency} onChange={(v) => { setCurrency(v); setAccountId(""); }} options={[{ value: "UYU", label: "UYU" }, { value: "USD", label: "USD" }]} />}
        </Field>
      </div>
      <Field label="Descripción">{(id) => <TextInput id={id} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Cena, nafta, adelanto..." />}</Field>
      <Field label="Fecha">{(id) => <TextInput id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
      <Field label="Cuenta vinculada (opcional)">
        {(id) =>
          eligibleAccounts.length === 0 ? (
            <p className="text-xs" style={{ color: C.textFaint }}>No tenés cajas en {currency}.</p>
          ) : (
            <Select id={id} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Sin vincular (no mueve ninguna cuenta)</option>
              {eligibleAccounts.map((a) => <option key={a.id} value={a.id}>{accountSelectLabel(a, banks)}</option>)}
            </Select>
          )
        }
      </Field>
      <p className="text-xs -mt-2 mb-3" style={{ color: C.textFaint }}>
        {accountId
          ? favorMio
            ? "Se va a descontar de esa cuenta (salió plata real)."
            : "Se va a sumar a esa cuenta (entró plata real)."
          : "Si no elegís cuenta, queda solo como registro informativo (ej. pagó algo directamente, sin pasar por tu plata)."}
      </p>
      <ReceiptField movementId={entryId} paths={receiptPaths} onChange={setReceiptPaths} />
      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>
    </Modal>
  );
}

/** Gasto propio (opcional) que se crea junto con la división, para que tu parte cuente como gasto real en Movimientos/Presupuestos. */
export interface SplitOwnExpense {
  category: string;
  amountMinor: number;
  currency: Currency;
  date: string;
  accountId?: string;
  note?: string;
}

export function SplitExpenseModal({
  contacts,
  accounts,
  banks,
  categories,
  onSave,
  onClose,
}: {
  contacts: Contact[];
  accounts: Account[];
  banks: Bank[];
  categories: Category[];
  onSave: (entries: ContactEntry[], ownExpense?: SplitOwnExpense) => void;
  onClose: () => void;
}) {
  const [description, setDescription] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>("UYU");
  const [date, setDate] = useState(todayISO());
  const [accountId, setAccountId] = useState("");
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [splitMode, setSplitMode] = useState<"equal" | "manual">("equal");
  const [manualAmounts, setManualAmounts] = useState<Record<string, string>>({});
  const [includeOwnShare, setIncludeOwnShare] = useState(false);
  const [ownCategory, setOwnCategory] = useState<string>(() => defaultLeafCategoryValue(categories, "gasto"));
  const [error, setError] = useState<string | null>(null);

  const eligibleAccounts = accounts.filter((a) => a.currency === currency);
  const totalMinor = parseAmountInput(totalAmount) ?? 0;
  const shareCount = selectedContactIds.length + (includeOwnShare ? 1 : 0);
  const equalShareMinor = shareCount > 0 ? Math.round(totalMinor / shareCount) : 0;
  const manualSum = selectedContactIds.reduce((sum, id) => sum + (parseAmountInput(manualAmounts[id] ?? "0") ?? 0), 0);
  const ownShareManual = totalMinor - manualSum;

  const toggleContact = (id: string) => {
    setSelectedContactIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSave = () => {
    if (!description.trim()) return setError("Ingresá una descripción del gasto.");
    if (totalMinor === 0) return setError("Ingresá un monto total válido.");
    if (!date) return setError("Elegí una fecha.");
    if (selectedContactIds.length === 0) return setError("Elegí al menos una persona para dividir el gasto.");
    if (splitMode === "manual" && includeOwnShare && ownShareManual < 0) {
      return setError("Las partes de las personas superan el monto total.");
    }

    const entries: ContactEntry[] = selectedContactIds.map((cId) => ({
      id: crypto.randomUUID(),
      contactId: cId,
      date,
      amountMinor: splitMode === "equal" ? equalShareMinor : parseAmountInput(manualAmounts[cId] ?? "0") ?? 0,
      currency,
      description: description.trim(),
      accountId: accountId || undefined,
    }));

    const ownAmountMinor = includeOwnShare
      ? splitMode === "equal"
        ? equalShareMinor
        : ownShareManual
      : 0;

    onSave(
      entries,
      includeOwnShare && ownAmountMinor > 0
        ? { category: ownCategory, amountMinor: ownAmountMinor, currency, date, accountId: accountId || undefined, note: description.trim() }
        : undefined
    );
  };

  return (
    <Modal title="Dividir gasto" onClose={onClose}>
      <Field label="Descripción">{(id) => <TextInput id={id} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Cena, alquiler, salidero..." />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monto total">
          {(id) => <TextInput id={id} type="number" inputMode="decimal" min="0" step="0.01" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} placeholder="0" />}
        </Field>
        <Field label="Moneda">
          {() => <Segment value={currency} onChange={(v) => { setCurrency(v); setAccountId(""); }} options={[{ value: "UYU", label: "UYU" }, { value: "USD", label: "USD" }]} />}
        </Field>
      </div>
      <Field label="Fecha">{(id) => <TextInput id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
      <Field label="Cuenta de origen (opcional)">
        {(id) =>
          eligibleAccounts.length === 0 ? (
            <p className="text-xs" style={{ color: C.textFaint }}>No tenés cajas en {currency}.</p>
          ) : (
            <Select id={id} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Sin vincular (no mueve ninguna cuenta)</option>
              {eligibleAccounts.map((a) => <option key={a.id} value={a.id}>{accountSelectLabel(a, banks)}</option>)}
            </Select>
          )
        }
      </Field>

      <Field label="¿Quiénes participan?">
        {() => (
          <div className="flex flex-wrap gap-1.5">
            {contacts.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleContact(c.id)}
                className="text-xs font-semibold px-3 py-1.5 rounded-full"
                style={{
                  background: selectedContactIds.includes(c.id) ? C.surface3 : C.surface2,
                  border: `1px solid ${selectedContactIds.includes(c.id) ? C.borderLight : C.border}`,
                  color: selectedContactIds.includes(c.id) ? C.text : C.textMuted,
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </Field>

      <Field label="¿Tu parte también es un gasto tuyo?">
        {() => (
          <Segment
            value={includeOwnShare ? "on" : "off"}
            onChange={(v) => setIncludeOwnShare(v === "on")}
            options={[{ value: "off", label: "No" }, { value: "on", label: "Sí" }]}
          />
        )}
      </Field>
      {includeOwnShare && <CategoryPicker categories={categories} type="gasto" value={ownCategory} onChange={setOwnCategory} />}

      <Field label="Cómo dividir">
        {() => (
          <Segment
            value={splitMode}
            onChange={setSplitMode}
            options={[{ value: "equal", label: "Partes iguales" }, { value: "manual", label: "Montos manuales" }]}
          />
        )}
      </Field>

      {selectedContactIds.length > 0 && (
        <div className="rounded-lg p-3 mb-3" style={{ background: C.surface2, border: `1px solid ${C.border}` }}>
          {splitMode === "equal" ? (
            <div className="space-y-1.5">
              {selectedContactIds.map((cId) => (
                <div key={cId} className="flex items-center justify-between text-xs">
                  <span style={{ color: C.text }}>{contacts.find((c) => c.id === cId)?.name}</span>
                  <span className="font-mono" style={{ color: C.textMuted }}>{formatMoney(equalShareMinor, currency)}</span>
                </div>
              ))}
              {includeOwnShare && (
                <div className="flex items-center justify-between text-xs pt-1.5" style={{ borderTop: `1px solid ${C.border}` }}>
                  <span style={{ color: C.textMuted }}>Tu parte</span>
                  <span className="font-mono" style={{ color: C.textMuted }}>{formatMoney(equalShareMinor, currency)}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {selectedContactIds.map((cId) => (
                <div key={cId} className="flex items-center gap-2">
                  <span className="text-xs flex-1" style={{ color: C.text }}>{contacts.find((c) => c.id === cId)?.name}</span>
                  <div className="w-28">
                    <TextInput
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={manualAmounts[cId] ?? ""}
                      onChange={(e) => setManualAmounts((m) => ({ ...m, [cId]: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                </div>
              ))}
              {includeOwnShare && (
                <div className="flex items-center justify-between text-xs pt-1.5" style={{ borderTop: `1px solid ${C.border}` }}>
                  <span style={{ color: C.textMuted }}>Tu parte (resto)</span>
                  <span className="font-mono" style={{ color: ownShareManual < 0 ? C.negative : C.textMuted }}>{formatMoney(ownShareManual, currency)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>
    </Modal>
  );
}
