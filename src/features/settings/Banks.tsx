import { useState } from "react";
import { Landmark, Wallet, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Field, Segment, TextArea, CurrencyPill } from "../../components/ui";
import { accountBalance } from "../../lib/accounts";
import { formatMoney } from "../../lib/money";
import { todayISO } from "../../lib/dates";
import type { Bank, Account, Transaction, Transfer, CardPayment, ContactEntry } from "../../types";

/**
 * Configuración de bancos y cajas que no tiene sentido repetir en el modal
 * de "Editar caja" de todos los días: si el banco pide sucursal, si una caja
 * está activa (visible en Cuentas y al registrar movimientos) o inactiva
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
  onUpdateBank,
  onUpdateAccount,
}: {
  banks: Bank[];
  accounts: Account[];
  transactions: Transaction[];
  transfers: Transfer[];
  cardPayments: CardPayment[];
  contactEntries: ContactEntry[];
  canEdit: boolean;
  onUpdateBank: (id: string, partial: Partial<Bank>) => void;
  onUpdateAccount: (id: string, partial: Partial<Account>) => void;
}) {
  if (banks.length === 0) {
    return (
      <p className="text-sm text-center py-6" style={{ color: C.textMuted }}>
        Todavía no agregaste bancos. Podés crear uno desde Cuentas.
      </p>
    );
  }

  return (
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
        />
      ))}
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
}) {
  return (
    <div className="rounded-2xl p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: C.surface3 }}>
          <Landmark size={15} color={C.uyu} />
        </div>
        <span className="text-sm font-semibold" style={{ color: C.text }}>{bank.name}</span>
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
        <p className="text-xs" style={{ color: C.textFaint }}>Este banco todavía no tiene cajas.</p>
      ) : (
        <div className="space-y-2 mt-1">
          {accounts.map((acc) => (
            <AccountSettingsRow
              key={acc.id}
              account={acc}
              balance={accountBalance(acc, transactions, transfers, cardPayments, undefined, contactEntries)}
              canEdit={canEdit}
              onUpdate={(partial) => onUpdateAccount(acc.id, partial)}
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
}: {
  account: Account;
  /** Saldo actual (a hoy) de la cuenta, para poder validar que esté en cero antes de desactivarla. */
  balance: number;
  canEdit: boolean;
  onUpdate: (partial: Partial<Account>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState(account.shareMessage ?? "");
  const [error, setError] = useState<string | null>(null);
  const active = account.active !== false;

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
          <Field label="Mensaje personalizado al compartir (opcional)">
            {(id) => (
              <TextArea
                id={id}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onBlur={() => onUpdate({ shareMessage: message.trim() || undefined })}
                placeholder="Si lo dejás vacío, se arma automáticamente con banco, cuenta, moneda, sucursal, número y titular."
                disabled={!canEdit}
              />
            )}
          </Field>
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
