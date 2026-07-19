import { useState } from "react";
import { Landmark, Wallet, Pencil, Trash2, Plus, FileSpreadsheet, ArrowUpRight, ArrowDownRight, ArrowRightLeft, CreditCard as CreditCardIcon, Share2, Check } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Modal, Field, TextInput, Segment, PrimaryButton, IconBtn, CurrencyPill } from "../../components/ui";
import { ReceiptButton } from "../../components/ReceiptField";
import { formatMoney, parseAmountInput, fromMinor } from "../../lib/money";
import { accountBalance, accountsByBank, accountLabel, accountLedger, shareableAccountText } from "../../lib/accounts";
import { exportBankToExcel } from "../../lib/excelExport";
import type { Bank, Account, Transaction, Currency, Transfer, CardPayment, Card } from "../../types";

export function Accounts({
  banks,
  accounts,
  transactions,
  transfers,
  cardPayments,
  cards,
  canEdit,
  canEditMovements,
  onAddBank,
  onEditBank,
  onDeleteBank,
  onAddAccount,
  onEditAccount,
  onDeleteAccount,
  onEditTransaction,
  onDeleteTransaction,
  onEditTransfer,
  onDeleteTransfer,
  onEditCardPayment,
  onDeleteCardPayment,
}: {
  banks: Bank[];
  accounts: Account[];
  transactions: Transaction[];
  transfers: Transfer[];
  cardPayments: CardPayment[];
  cards: Card[];
  canEdit: boolean;
  canEditMovements: boolean;
  onAddBank: () => void;
  onEditBank: (b: Bank) => void;
  onDeleteBank: (id: string) => void;
  onAddAccount: (bankId: string) => void;
  onEditAccount: (a: Account) => void;
  onDeleteAccount: (id: string) => void;
  onEditTransaction: (t: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  onEditTransfer: (t: Transfer) => void;
  onDeleteTransfer: (id: string) => void;
  onEditCardPayment: (p: CardPayment) => void;
  onDeleteCardPayment: (id: string) => void;
}) {
  const [viewAccountId, setViewAccountId] = useState<string | null>(null);
  const viewAccount = accounts.find((a) => a.id === viewAccountId) ?? null;
  const [sortBy, setSortBy] = useState<"banco" | "moneda">("banco");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const dirMul = sortDir === "asc" ? 1 : -1;
  const [copiedAccountId, setCopiedAccountId] = useState<string | null>(null);

  /** Comparte (o, si el navegador no soporta compartir, copia al portapapeles) los datos bancarios de una cuenta. */
  const handleShare = async (account: Account) => {
    const text = shareableAccountText(account, banks);
    if (navigator.share) {
      try {
        await navigator.share({ title: "Datos bancarios", text });
      } catch {
        // el usuario cerró el panel de compartir, no hacemos nada
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAccountId(account.id);
      setTimeout(() => setCopiedAccountId((id) => (id === account.id ? null : id)), 1500);
    } catch {
      // si tampoco hay portapapeles disponible, no rompemos nada
    }
  };

  return (
    <div className="pb-24">
      <h1 className="text-2xl mb-4 font-display" style={{ color: C.text }}>Cuentas</h1>

      {banks.length === 0 && (
        <div className="rounded-xl p-6 text-center text-sm mb-4" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textMuted }}>
          Todavía no agregaste bancos. Un banco puede tener varias cajas, en distinta moneda.
        </div>
      )}

      {banks.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <Segment value={sortBy} onChange={setSortBy} options={[{ value: "banco", label: "Por banco" }, { value: "moneda", label: "Por moneda" }]} />
          <Segment value={sortDir} onChange={setSortDir} options={[{ value: "asc", label: "A-Z" }, { value: "desc", label: "Z-A" }]} />
        </div>
      )}

      {sortBy === "banco" ? (
        <div className="space-y-3 mb-4">
          {[...banks]
            .sort((a, b) => dirMul * a.name.localeCompare(b.name))
            .map((bank) => {
              const bankAccounts = [...accountsByBank(accounts, bank.id)].sort((a, b) => dirMul * a.name.localeCompare(b.name));
              const hasMovements =
                transactions.some((t) => bankAccounts.some((a) => a.id === t.accountId)) ||
                transfers.some((tr) => bankAccounts.some((a) => a.id === tr.fromAccountId || a.id === tr.toAccountId)) ||
                cardPayments.some((p) => bankAccounts.some((a) => a.id === p.accountId));
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
                        onClick={() => exportBankToExcel(bank, bankAccounts, transactions, transfers, cardPayments)}
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
                        const balance = accountBalance(acc, transactions, transfers, cardPayments);
                        return (
                          <button
                            key={acc.id}
                            onClick={() => setViewAccountId(acc.id)}
                            className="w-full flex items-center justify-between text-xs rounded-lg px-2.5 py-2 text-left"
                            style={{ background: C.surface2 }}
                          >
                            <div className="flex items-center gap-2">
                              <Wallet size={13} color={C.textFaint} />
                              <span style={{ color: C.text }}>{acc.name}</span>
                              <CurrencyPill currency={acc.currency} />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono" style={{ color: balance >= 0 ? C.positive : C.negative }}>{formatMoney(balance, acc.currency)}</span>
                              <IconBtn
                                label="Compartir datos bancarios"
                                onClick={(e) => { e.stopPropagation(); handleShare(acc); }}
                              >
                                {copiedAccountId === acc.id ? <Check size={13} color={C.positive} /> : <Share2 size={13} />}
                              </IconBtn>
                              {canEdit && (
                                <>
                                  <IconBtn label="Editar caja" onClick={(e) => { e.stopPropagation(); onEditAccount(acc); }}><Pencil size={13} /></IconBtn>
                                  <IconBtn label="Eliminar caja" danger onClick={(e) => { e.stopPropagation(); onDeleteAccount(acc.id); }}><Trash2 size={13} /></IconBtn>
                                </>
                              )}
                            </div>
                          </button>
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
      ) : (
        <div className="space-y-3 mb-4">
          {(["UYU", "USD"] as Currency[])
            .sort((a, b) => dirMul * a.localeCompare(b))
            .map((currency) => {
              const currencyAccounts = accounts
                .filter((a) => a.currency === currency)
                .sort((a, b) => dirMul * accountLabel(a, banks).localeCompare(accountLabel(b, banks)));
              if (currencyAccounts.length === 0) return null;
              const total = currencyAccounts.reduce((sum, a) => sum + accountBalance(a, transactions, transfers, cardPayments), 0);
              return (
                <div key={currency} className="rounded-2xl p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <CurrencyPill currency={currency} />
                      <div className="text-sm font-semibold" style={{ color: C.text }}>Total en {currency}</div>
                    </div>
                    <span className="font-mono text-sm" style={{ color: total >= 0 ? C.positive : C.negative }}>{formatMoney(total, currency)}</span>
                  </div>
                  <div className="space-y-1.5">
                    {currencyAccounts.map((acc) => {
                      const balance = accountBalance(acc, transactions, transfers, cardPayments);
                      return (
                        <button
                          key={acc.id}
                          onClick={() => setViewAccountId(acc.id)}
                          className="w-full flex items-center justify-between text-xs rounded-lg px-2.5 py-2 text-left"
                          style={{ background: C.surface2 }}
                        >
                          <div className="flex items-center gap-2">
                            <Wallet size={13} color={C.textFaint} />
                            <span style={{ color: C.text }}>{accountLabel(acc, banks)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono" style={{ color: balance >= 0 ? C.positive : C.negative }}>{formatMoney(balance, acc.currency)}</span>
                            <IconBtn
                              label="Compartir datos bancarios"
                              onClick={(e) => { e.stopPropagation(); handleShare(acc); }}
                            >
                              {copiedAccountId === acc.id ? <Check size={13} color={C.positive} /> : <Share2 size={13} />}
                            </IconBtn>
                            {canEdit && (
                              <>
                                <IconBtn label="Editar caja" onClick={(e) => { e.stopPropagation(); onEditAccount(acc); }}><Pencil size={13} /></IconBtn>
                                <IconBtn label="Eliminar caja" danger onClick={(e) => { e.stopPropagation(); onDeleteAccount(acc.id); }}><Trash2 size={13} /></IconBtn>
                              </>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          {accounts.length === 0 && (
            <p className="text-xs text-center py-4" style={{ color: C.textFaint }}>Todavía no agregaste cajas.</p>
          )}
        </div>
      )}

      {canEdit && (
        <button
          onClick={onAddBank}
          className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
          style={{ background: C.surface2, border: `1px dashed ${C.borderLight}`, color: C.textMuted }}
        >
          <Plus size={16} /> Agregar banco
        </button>
      )}

      {viewAccount && (
        <AccountLedgerModal
          account={viewAccount}
          banks={banks}
          accounts={accounts}
          transactions={transactions}
          transfers={transfers}
          cardPayments={cardPayments}
          cards={cards}
          canEdit={canEditMovements}
          onEditTransaction={onEditTransaction}
          onDeleteTransaction={onDeleteTransaction}
          onEditTransfer={onEditTransfer}
          onDeleteTransfer={onDeleteTransfer}
          onEditCardPayment={onEditCardPayment}
          onDeleteCardPayment={onDeleteCardPayment}
          onClose={() => setViewAccountId(null)}
        />
      )}
    </div>
  );
}

function AccountLedgerModal({
  account,
  banks,
  accounts,
  transactions,
  transfers,
  cardPayments,
  cards,
  canEdit,
  onEditTransaction,
  onDeleteTransaction,
  onEditTransfer,
  onDeleteTransfer,
  onEditCardPayment,
  onDeleteCardPayment,
  onClose,
}: {
  account: Account;
  banks: Bank[];
  accounts: Account[];
  transactions: Transaction[];
  transfers: Transfer[];
  cardPayments: CardPayment[];
  cards: Card[];
  canEdit: boolean;
  onEditTransaction: (t: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  onEditTransfer: (t: Transfer) => void;
  onDeleteTransfer: (id: string) => void;
  onEditCardPayment: (p: CardPayment) => void;
  onDeleteCardPayment: (id: string) => void;
  onClose: () => void;
}) {
  const entries = accountLedger(account, transactions, transfers, cardPayments);
  const balance = accountBalance(account, transactions, transfers, cardPayments);
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const text = shareableAccountText(account, banks);
    if (navigator.share) {
      try {
        await navigator.share({ title: "Datos bancarios", text });
      } catch {
        // el usuario cerró el panel de compartir, no hacemos nada
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // si tampoco hay portapapeles disponible, no rompemos nada
    }
  };

  return (
    <Modal title={accountLabel(account, banks)} onClose={onClose}>
      <div className="flex items-center justify-between rounded-lg px-3 py-2 mb-2" style={{ background: C.surface2 }}>
        <span className="text-xs" style={{ color: C.textMuted }}>Saldo actual</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm" style={{ color: balance >= 0 ? C.positive : C.negative }}>{formatMoney(balance, account.currency)}</span>
          <CurrencyPill currency={account.currency} />
        </div>
      </div>

      <button
        onClick={handleShare}
        className="w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 mb-4"
        style={{ border: `1px dashed ${C.borderLight}`, color: copied ? C.positive : C.textMuted }}
      >
        {copied ? <Check size={13} /> : <Share2 size={13} />}
        {copied ? "Copiado" : "Compartir datos bancarios"}
      </button>

      {entries.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: C.textMuted }}>Sin movimientos en esta cuenta todavía.</p>
      ) : (
        <div className="space-y-2 max-h-[55vh] overflow-y-auto">
          {entries.map((entry) => {
            const isTransfer = entry.kind === "transfer-out" || entry.kind === "transfer-in";
            const isCardPayment = entry.kind === "card-payment";
            const key =
              entry.kind === "transaction" ? entry.transaction!.id : isCardPayment ? entry.cardPayment!.id : `${entry.transfer!.id}-${entry.kind}`;
            const label = isCardPayment
              ? `Pago tarjeta ${cards.find((c) => c.id === entry.cardPayment!.cardId)?.name ?? "eliminada"}`
              : isTransfer
              ? entry.kind === "transfer-out"
                ? `Transferencia a ${accountLabel(accounts.find((a) => a.id === entry.transfer!.toAccountId), banks)}`
                : `Transferencia desde ${accountLabel(accounts.find((a) => a.id === entry.transfer!.fromAccountId), banks)}`
              : `${entry.transaction!.category}${entry.transaction!.note ? ` · ${entry.transaction!.note}` : ""}`;
            const note = isCardPayment ? entry.cardPayment!.note : isTransfer ? entry.transfer!.note : undefined;
            const receiptPath = entry.transaction?.receiptPath ?? entry.transfer?.receiptPath ?? entry.cardPayment?.receiptPath;

            return (
              <div key={key} className="rounded-xl p-3" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                      style={{
                        background: isCardPayment
                          ? "rgba(217,119,106,0.15)"
                          : isTransfer
                          ? "rgba(79,168,160,0.15)"
                          : entry.amountMinor >= 0
                          ? "rgba(111,191,139,0.15)"
                          : "rgba(217,119,106,0.15)",
                      }}
                    >
                      {isCardPayment ? (
                        <CreditCardIcon size={14} color={C.negative} />
                      ) : isTransfer ? (
                        <ArrowRightLeft size={14} color={C.usd} />
                      ) : entry.amountMinor >= 0 ? (
                        <ArrowUpRight size={14} color={C.positive} />
                      ) : (
                        <ArrowDownRight size={14} color={C.negative} />
                      )}
                    </div>
                    <div>
                      <div className="text-sm" style={{ color: C.text }}>{label}{note ? ` · ${note}` : ""}</div>
                      <div className="text-xs" style={{ color: C.textFaint }}>{entry.date}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="text-right">
                      <div className="font-mono text-sm" style={{ color: entry.amountMinor >= 0 ? C.positive : C.negative }}>
                        {entry.amountMinor >= 0 ? "+" : "-"}{formatMoney(Math.abs(entry.amountMinor), account.currency)}
                      </div>
                      <div className="text-[10px] font-mono" style={{ color: C.textFaint }}>saldo {formatMoney(entry.runningBalanceMinor, account.currency)}</div>
                    </div>
                    <ReceiptButton path={receiptPath} />
                    {canEdit && (
                      <>
                        <IconBtn
                          label="Editar movimiento"
                          onClick={() =>
                            entry.kind === "transaction"
                              ? onEditTransaction(entry.transaction!)
                              : isCardPayment
                              ? onEditCardPayment(entry.cardPayment!)
                              : onEditTransfer(entry.transfer!)
                          }
                        >
                          <Pencil size={13} />
                        </IconBtn>
                        <IconBtn
                          label="Eliminar movimiento"
                          danger
                          onClick={() =>
                            entry.kind === "transaction"
                              ? onDeleteTransaction(entry.transaction!.id)
                              : isCardPayment
                              ? onDeleteCardPayment(entry.cardPayment!.id)
                              : onDeleteTransfer(entry.transfer!.id)
                          }
                        >
                          <Trash2 size={13} />
                        </IconBtn>
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

export function AccountModal({ bankId, initial, accounts, onSave, onClose }: {
  bankId: string;
  initial?: Account;
  /** Cuentas ya cargadas, solo para sugerir titulares ya usados (ej. vos o tu esposa) sin tener que retipearlos. */
  accounts: Account[];
  onSave: (a: Account) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? "UYU");
  const [initialBalance, setInitialBalance] = useState(initial ? String(fromMinor(initial.initialBalanceMinor)) : "0");
  const [holderName, setHolderName] = useState(initial?.holderName ?? "");
  const [accountNumber, setAccountNumber] = useState(initial?.accountNumber ?? "");
  const [error, setError] = useState<string | null>(null);

  const holderSuggestions = Array.from(new Set(accounts.map((a) => a.holderName).filter((h): h is string => !!h)));

  const handleSave = () => {
    if (!name.trim()) return setError("Ingresá un nombre para la caja (ej. Caja de ahorro).");
    const minor = parseAmountInput(initialBalance || "0");
    if (minor === null) return setError("El saldo inicial no es un número válido.");
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      bankId,
      name: name.trim(),
      currency,
      initialBalanceMinor: minor,
      holderName: holderName.trim() || undefined,
      accountNumber: accountNumber.trim() || undefined,
    });
  };

  return (
    <Modal title={initial ? "Editar caja" : "Nueva caja"} onClose={onClose}>
      <Field label="Nombre">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Caja de ahorro, Cuenta corriente..." />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Saldo inicial">{(id) => <TextInput id={id} type="number" step="0.01" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} placeholder="0" />}</Field>
        <Field label="Moneda">{() => <Segment value={currency} onChange={setCurrency} options={[{ value: "UYU", label: "UYU" }, { value: "USD", label: "USD" }]} />}</Field>
      </div>
      <Field label="Titular (opcional)">
        {(id) => (
          <>
            <TextInput id={id} list="holder-suggestions" value={holderName} onChange={(e) => setHolderName(e.target.value)} placeholder="Ej. Martín Brignoni" />
            <datalist id="holder-suggestions">
              {holderSuggestions.map((h) => <option key={h} value={h} />)}
            </datalist>
          </>
        )}
      </Field>
      <Field label="Número de cuenta (opcional)">
        {(id) => <TextInput id={id} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Para compartir cuando te pidan transferirte" />}
      </Field>
      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>
    </Modal>
  );
}
