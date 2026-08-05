import { useState } from "react";
import { Landmark, Wallet, ChevronDown, ChevronUp, AlertTriangle, Plus, Pencil, Trash2 } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Field, Segment, TextArea, CurrencyPill, ConfirmDialog, IconBtn } from "../../components/ui";
import { accountBalance } from "../../lib/accounts";
import { formatMoney } from "../../lib/money";
import { todayISO } from "../../lib/dates";
import type { Bank, Account, Transaction, Transfer, CardPayment, ContactEntry } from "../../types";

/**
 * Alta y configuración de bancos y cajas: acá se crean (antes se creaban
 * desde Cuentas, que ahora es solo para ver saldos y movimientos) y se
 * ajustan las cosas que no tiene sentido repetir en el modal de "Editar
 * caja" de todos los días: si el banco pide sucursal, si una caja está
 * activa (visible en Cuentas y al registrar movimientos) o inactiva
 * ("mapeada" pero fuera de la vista), y el mensaje literal a usar al
 * compartir los datos bancarios de esa caja.
 */
export function BanksSettings({
  banks,
  accounts,
  transactions,
  transfers,
  cardPayments,
  contactEntries,
  canEdit,
  onAddBank,
  onAddAccount,
  onUpdateBank,
  onUpdateAccount,
  onEditBank,
  onDeleteBank,
  onEditAccount,
  onDeleteAccount,
}: {
  banks: Bank[];
  accounts: Account[];
  transactions: Transaction[];
  transfers: Transfer[];
  cardPayments: CardPayment[];
  contactEntries: ContactEntry[];
  canEdit: boolean;
  onAddBank: () => void;
  onAddAccount: (bankId: string) => void;
  onUpdateBank: (id: string, partial: Partial<Bank>) => void;
  onUpdateAccount: (id: string, partial: Partial<Account>) => void;
  /** Abre el modal completo (nombre, sucursal) — separado de onUpdateBank, que es para toggles rápidos como "pide sucursal". */
  onEditBank: (b: Bank) => void;
  onDeleteBank: (id: string) => void;
  /** Abre el modal completo (nombre, moneda, saldo inicial, titular, etc.) — separado de onUpdateAccount, que es para toggles rápidos (activa/inactiva, mensaje). */
  onEditAccount: (a: Account) => void;
  onDeleteAccount: (id: string) => void;
}) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs" style={{ color: C.textMuted }}>
          Un banco puede tener varias cajas, en distinta moneda.
        </p>
        {canEdit && (
          <div className="relative shrink-0 ml-2">
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
                  className="absolute right-0 top-11 z-40 rounded-lg overflow-hidden w-48"
                  style={{ background: C.surface, border: `1px solid ${C.border}` }}
                >
                  <button
                    onClick={() => { setAddMenuOpen(false); onAddBank(); }}
                    className="w-full text-left px-3 py-2.5 text-sm flex items-center gap-2"
                    style={{ color: C.text }}
                  >
                    <Landmark size={14} /> Nuevo banco
                  </button>
                  <button
                    onClick={() => { if (banks.length === 0) return; setAddMenuOpen(false); onAddAccount(banks[0].id); }}
                    disabled={banks.length === 0}
                    className="w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 disabled:opacity-40"
                    style={{ color: C.text, borderTop: `1px solid ${C.border}` }}
                  >
                    <Wallet size={14} /> Nueva caja
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {banks.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: C.textMuted }}>
          Todavía no agregaste bancos.
        </p>
      ) : (
        <div className="space-y-3">
          {banks.map((bank) => (
            <BankSettingsCard
              key={bank.id}
              bank={bank}
              accounts={accounts.filter((a) => a.bankId === bank.id)}
              transactions={transactions}
              transfers={transfers}
              cardPayments={cardPayments}
              contactEntries={contactEntries}
              canEdit={canEdit}
              onUpdateBank={onUpdateBank}
              onUpdateAccount={onUpdateAccount}
              onEditBank={onEditBank}
              onDeleteBank={onDeleteBank}
              onEditAccount={onEditAccount}
              onDeleteAccount={onDeleteAccount}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BankSettingsCard({
  bank,
  accounts,
  transactions,
  transfers,
  cardPayments,
  contactEntries,
  canEdit,
  onUpdateBank,
  onUpdateAccount,
  onEditBank,
  onDeleteBank,
  onEditAccount,
  onDeleteAccount,
}: {
  bank: Bank;
  accounts: Account[];
  transactions: Transaction[];
  transfers: Transfer[];
  cardPayments: CardPayment[];
  contactEntries: ContactEntry[];
  canEdit: boolean;
  onUpdateBank: (id: string, partial: Partial<Bank>) => void;
  onUpdateAccount: (id: string, partial: Partial<Account>) => void;
  onEditBank: (b: Bank) => void;
  onDeleteBank: (id: string) => void;
  onEditAccount: (a: Account) => void;
  onDeleteAccount: (id: string) => void;
}) {
  return (
    <div className="rounded-2xl p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: C.surface3 }}>
            <Landmark size={15} color={C.uyu} />
          </div>
          <span className="text-sm font-semibold truncate" style={{ color: C.text }}>{bank.name}</span>
        </div>
        {canEdit && (
          <div className="flex gap-1 shrink-0">
            <IconBtn label="Editar banco" onClick={() => onEditBank(bank)}><Pencil size={14} /></IconBtn>
            <IconBtn label="Eliminar banco" danger onClick={() => onDeleteBank(bank.id)}><Trash2 size={14} /></IconBtn>
          </div>
        )}
      </div>

      <Field label="Pide sucursal en las cuentas">
        {() => (
          <Segment
            value={bank.usesBranch ? "on" : "off"}
            onChange={(v) => canEdit && onUpdateBank(bank.id, { usesBranch: v === "on" })}
            options={[{ value: "off", label: "No" }, { value: "on", label: "Sí" }]}
          />
        )}
      </Field>

      {accounts.length === 0 ? (
        <p className="text-xs mb-2" style={{ color: C.textFaint }}>Este banco todavía no tiene cajas.</p>
      ) : (
        <div className="space-y-2 mt-1 mb-2">
          {accounts.map((acc) => (
            <AccountSettingsRow
              key={acc.id}
              account={acc}
              balance={accountBalance(acc, transactions, transfers, cardPayments, undefined, contactEntries)}
              canEdit={canEdit}
              onUpdate={(partial) => onUpdateAccount(acc.id, partial)}
              onEdit={() => onEditAccount(acc)}
              onDelete={() => onDeleteAccount(acc.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AccountSettingsRow({
  account,
  balance,
  canEdit,
  onUpdate,
  onEdit,
  onDelete,
}: {
  account: Account;
  /** Saldo actual (a hoy) de la cuenta, para poder validar que esté en cero antes de desactivarla. */
  balance: number;
  canEdit: boolean;
  onUpdate: (partial: Partial<Account>) => void;
  /** Abre el modal completo (nombre, moneda, saldo inicial, titular, hoja de conciliación, etc.). */
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState(account.shareMessage ?? "");
  const [editingMessage, setEditingMessage] = useState(false);
  const [confirmSaveMessage, setConfirmSaveMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = account.active !== false;

  const startEditingMessage = () => {
    setMessage(account.shareMessage ?? "");
    setEditingMessage(true);
  };
  const cancelEditingMessage = () => {
    setMessage(account.shareMessage ?? "");
    setEditingMessage(false);
  };
  const confirmSaveMessageChange = () => {
    onUpdate({ shareMessage: message.trim() || undefined });
    setConfirmSaveMessage(false);
    setEditingMessage(false);
  };

  const handleToggle = (v: string) => {
    if (v === "off") {
      if (balance !== 0) {
        setError(`Para desactivar la caja, el saldo debe estar en cero. Saldo actual: ${formatMoney(balance, account.currency)}.`);
        setExpanded(true);
        return;
      }
      setError(null);
      onUpdate({ active: false, inactiveSince: todayISO() });
    } else {
      setError(null);
      onUpdate({ active: true, inactiveSince: undefined });
    }
  };

  return (
    <div className="rounded-lg p-2.5" style={{ background: C.surface2, border: `1px solid ${C.border}` }}>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 text-left min-w-0"
        >
          <span className="flex items-center gap-1.5 text-xs">
            <Wallet size={13} color={C.textFaint} className="shrink-0" />
            <span className="truncate" style={{ color: C.text }}>{account.name}</span>
            <CurrencyPill currency={account.currency} />
            {expanded ? <ChevronUp size={13} color={C.textFaint} /> : <ChevronDown size={13} color={C.textFaint} />}
          </span>
          {(account.holderName || account.accountNumber || account.branch) && (
            <span className="block text-[10px] mt-0.5 pl-[19px] truncate" style={{ color: C.textFaint }}>
              {[account.holderName, account.branch ? `Suc. ${account.branch}` : null, account.accountNumber].filter(Boolean).join(" · ")}
            </span>
          )}
        </button>
        {canEdit && (
          <Segment
            value={active ? "on" : "off"}
            onChange={handleToggle}
            options={[{ value: "on", label: "Activa" }, { value: "off", label: "Inactiva" }]}
          />
        )}
      </div>

      {expanded && (
        <div className="mt-2.5">
          {error && (
            <div className="flex items-start gap-1.5 mb-2 text-[11px] rounded-lg p-2" style={{ background: `${C.negative}18`, color: C.negative }}>
              <AlertTriangle size={13} className="shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}
          {canEdit && (
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={onEdit}
                className="flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
                style={{ border: `1px solid ${C.border}`, color: C.text }}
              >
                <Pencil size={12} /> Editar caja
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
                style={{ border: `1px solid ${C.negative}`, color: C.negative }}
              >
                <Trash2 size={12} /> Eliminar caja
              </button>
            </div>
          )}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs" style={{ color: C.textMuted }}>Mensaje personalizado al compartir (opcional)</span>
              {canEdit && !editingMessage && (
                <IconBtn label="Editar mensaje" onClick={startEditingMessage}><Pencil size={13} /></IconBtn>
              )}
            </div>
            {editingMessage ? (
              <>
                <TextArea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Si lo dejás vacío, se arma automáticamente con banco, cuenta, moneda, sucursal, número y titular."
                  autoFocus
                />
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={cancelEditingMessage}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold"
                    style={{ border: `1px solid ${C.border}`, color: C.textMuted }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmSaveMessage(true)}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold"
                    style={{ background: C.usd, color: "#0A1413" }}
                  >
                    Guardar
                  </button>
                </div>
              </>
            ) : (
              <p className="text-xs" style={{ color: account.shareMessage ? C.text : C.textFaint }}>
                {account.shareMessage || "Vacío: se arma automáticamente con banco, cuenta, moneda, sucursal, número y titular."}
              </p>
            )}
          </div>
          {confirmSaveMessage && (
            <ConfirmDialog
              title="¿Guardar los cambios?"
              message="Se va a actualizar el mensaje que se usa al compartir los datos de esta caja."
              confirmLabel="Guardar"
              onConfirm={confirmSaveMessageChange}
              onCancel={() => setConfirmSaveMessage(false)}
            />
          )}
          {!active && (
            <p className="text-[11px] mt-1.5" style={{ color: C.textFaint }}>
              Esta caja está inactiva: no aparece en Cuentas ni para elegir al registrar un movimiento nuevo.
              Sí se sigue viendo en Cuentas al consultar saldos a una fecha anterior a la desactivación.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
