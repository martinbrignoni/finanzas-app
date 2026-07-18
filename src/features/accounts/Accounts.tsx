import { useState } from "react";
import { Landmark, Wallet, Pencil, Trash2, Plus, FileSpreadsheet } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Modal, Field, TextInput, Segment, PrimaryButton, IconBtn, CurrencyPill } from "../../components/ui";
import { formatMoney, parseAmountInput, fromMinor } from "../../lib/money";
import { accountBalance, accountsByBank } from "../../lib/accounts";
import { exportBankToExcel } from "../../lib/excelExport";
import type { Bank, Account, Transaction, Currency } from "../../types";

export function Accounts({
  banks,
  accounts,
  transactions,
  canEdit,
  onAddBank,
  onEditBank,
  onDeleteBank,
  onAddAccount,
  onEditAccount,
  onDeleteAccount,
}: {
  banks: Bank[];
  accounts: Account[];
  transactions: Transaction[];
  canEdit: boolean;
  onAddBank: () => void;
  onEditBank: (b: Bank) => void;
  onDeleteBank: (id: string) => void;
  onAddAccount: (bankId: string) => void;
  onEditAccount: (a: Account) => void;
  onDeleteAccount: (id: string) => void;
}) {
  return (
    <div className="pb-24">
      <h1 className="text-2xl mb-4 font-display" style={{ color: C.text }}>Cuentas</h1>

      {banks.length === 0 && (
        <div className="rounded-xl p-6 text-center text-sm mb-4" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textMuted }}>
          Todavía no agregaste bancos. Un banco puede tener varias cajas, en distinta moneda.
        </div>
      )}

      <div className="space-y-3 mb-4">
        {banks.map((bank) => {
          const bankAccounts = accountsByBank(accounts, bank.id);
          const hasMovements = transactions.some((t) => bankAccounts.some((a) => a.id === t.accountId));
          return (
            <div key={bank.id} className="rounded-2xl p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: C.surface3 }}>
                    <Landmark size={16} color={C.uyu} />
                  </div>
                  <div className="text-sm font-semibold" style={{ color: C.text }}>{bank.name}</div>
                </div>
                <div className="flex gap-1">
                  <IconBtn
                    label="Exportar a Excel"
                    onClick={() => exportBankToExcel(bank, bankAccounts, transactions)}
                  >
                    <FileSpreadsheet size={15} />
                  </IconBtn>
                  {canEdit && (
                    <>
                      <IconBtn label="Editar banco" onClick={() => onEditBank(bank)}><Pencil size={15} /></IconBtn>
                      <IconBtn label="Eliminar banco" danger onClick={() => onDeleteBank(bank.id)}><Trash2 size={15} /></IconBtn>
                    </>
                  )}
                </div>
              </div>

              {bankAccounts.length === 0 ? (
                <p className="text-xs mb-2" style={{ color: C.textFaint }}>Sin cajas todavía.</p>
              ) : (
                <div className="space-y-1.5 mb-2">
                  {bankAccounts.map((acc) => {
                    const balance = accountBalance(acc, transactions);
                    return (
                      <div key={acc.id} className="flex items-center justify-between text-xs rounded-lg px-2.5 py-2" style={{ background: C.surface2 }}>
                        <div className="flex items-center gap-2">
                          <Wallet size={13} color={C.textFaint} />
                          <span style={{ color: C.text }}>{acc.name}</span>
                          <CurrencyPill currency={acc.currency} />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono" style={{ color: balance >= 0 ? C.positive : C.negative }}>{formatMoney(balance, acc.currency)}</span>
                          {canEdit && (
                            <>
                              <IconBtn label="Editar caja" onClick={() => onEditAccount(acc)}><Pencil size={13} /></IconBtn>
                              <IconBtn label="Eliminar caja" danger onClick={() => onDeleteAccount(acc.id)}><Trash2 size={13} /></IconBtn>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!hasMovements && bankAccounts.length > 0 && (
                <p className="text-[11px] mb-2" style={{ color: C.textFaint }}>
                  El export a Excel va a incluir solo el saldo inicial hasta que asignes movimientos a estas cajas.
                </p>
              )}

              {canEdit && (
                <button
                  onClick={() => onAddAccount(bank.id)}
                  className="w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1"
                  style={{ border: `1px dashed ${C.borderLight}`, color: C.textMuted }}
                >
                  <Plus size={13} /> Agregar caja
                </button>
              )}
            </div>
          );
        })}
      </div>

      {canEdit && (
        <button
          onClick={onAddBank}
          className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
          style={{ background: C.surface2, border: `1px dashed ${C.borderLight}`, color: C.textMuted }}
        >
          <Plus size={16} /> Agregar banco
        </button>
      )}
    </div>
  );
}

export function BankModal({ initial, onSave, onClose }: { initial?: Bank; onSave: (b: Bank) => void; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal title={initial ? "Editar banco" : "Nuevo banco"} onClose={onClose}>
      <Field label="Nombre del banco">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="BROU, Santander, Itaú..." />}</Field>
      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={() => { if (!name.trim()) return setError("Ingresá un nombre."); onSave({ id: initial?.id ?? crypto.randomUUID(), name: name.trim() }); }}>
        Guardar
      </PrimaryButton>
    </Modal>
  );
}

export function AccountModal({ bankId, initial, onSave, onClose }: {
  bankId: string;
  initial?: Account;
  onSave: (a: Account) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? "UYU");
  const [initialBalance, setInitialBalance] = useState(initial ? String(fromMinor(initial.initialBalanceMinor)) : "0");
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    if (!name.trim()) return setError("Ingresá un nombre para la caja (ej. Caja de ahorro).");
    const minor = parseAmountInput(initialBalance || "0");
    if (minor === null) return setError("El saldo inicial no es un número válido.");
    onSave({ id: initial?.id ?? crypto.randomUUID(), bankId, name: name.trim(), currency, initialBalanceMinor: minor });
  };

  return (
    <Modal title={initial ? "Editar caja" : "Nueva caja"} onClose={onClose}>
      <Field label="Nombre">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Caja de ahorro, Cuenta corriente..." />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Saldo inicial">{(id) => <TextInput id={id} type="number" step="0.01" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} placeholder="0" />}</Field>
        <Field label="Moneda">{() => <Segment value={currency} onChange={setCurrency} options={[{ value: "UYU", label: "UYU" }, { value: "USD", label: "USD" }]} />}</Field>
      </div>
      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>
    </Modal>
  );
}
