import { useState } from "react";
import { Landmark, Wallet, Pencil, Trash2, Plus, FileSpreadsheet, ArrowUpRight, ArrowDownRight, ArrowRightLeft, CreditCard as CreditCardIcon, Users, Share2, Check, ArrowUpDown, ChevronUp, ChevronDown, AlertTriangle } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Modal, Field, TextInput, Select, Segment, PrimaryButton, IconBtn, CurrencyPill } from "../../components/ui";
import { ReceiptButton } from "../../components/ReceiptField";
import { StatementFileRow } from "../../components/StatementFileRow";
import { receiptPathsOf, uploadReceipt, getReceiptUrl, deleteReceipt } from "../../lib/receipts";
import { formatMoney, parseAmountInput, fromMinor } from "../../lib/money";
import { accountBalance, accountsByBank, accountLabel, accountLedger, shareableAccountText, isAccountVisibleAt } from "../../lib/accounts";
import { orderItems, moveWithinGroup } from "../../lib/order";
import { pendingStatementMonths, getStatement } from "../../lib/accountStatements";
import { exportBankToExcel } from "../../lib/excelExport";
import { formatDateDMY, currentMonthKey, addMonths, monthLabel, capitalize, todayISO } from "../../lib/dates";
import type { Bank, Account, Transaction, Currency, Transfer, CardPayment, Card, SortOrders, AccountStatement, Contact, ContactEntry } from "../../types";

export function Accounts({
  banks,
  accounts,
  transactions,
  transfers,
  cardPayments,
  contacts,
  contactEntries,
  cards,
  canEdit,
  canEditMovements,
  sortOrders,
  onReorderBanks,
  onReorderAccountsByBank,
  onReorderAccountsByCurrency,
  accountStatements,
  onSaveAccountStatement,
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
  contacts: Contact[];
  contactEntries: ContactEntry[];
  cards: Card[];
  canEdit: boolean;
  canEditMovements: boolean;
  sortOrders: SortOrders;
  onReorderBanks: (order: string[]) => void;
  onReorderAccountsByBank: (order: string[]) => void;
  onReorderAccountsByCurrency: (order: string[]) => void;
  accountStatements: AccountStatement[];
  onSaveAccountStatement: (s: AccountStatement) => void;
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
  const [reordering, setReordering] = useState(false);
  const [asOfDate, setAsOfDate] = useState(todayISO());
  const isToday = asOfDate === todayISO();
  const [copiedAccountId, setCopiedAccountId] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const allBankIds = banks.map((b) => b.id);
  const allAccountIds = accounts.map((a) => a.id);
  // Las cajas marcadas inactivas (Configuración → Bancos) quedan "mapeadas" pero fuera de esta
  // vista, salvo que se esté consultando una fecha en la que todavía estaban activas.
  const visibleAccounts = accounts.filter((a) => isAccountVisibleAt(a, asOfDate));

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
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-display" style={{ color: C.text }}>Cuentas</h1>
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

      {banks.length === 0 && (
        <div className="rounded-xl p-6 text-center text-sm mb-4" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textMuted }}>
          Todavía no agregaste bancos. Un banco puede tener varias cajas, en distinta moneda.
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs shrink-0" style={{ color: C.textMuted }}>Saldos al:</span>
        <input
          type="date"
          aria-label="Ver saldos a una fecha"
          value={asOfDate}
          max={todayISO()}
          onChange={(e) => setAsOfDate(e.target.value || todayISO())}
          className="text-sm rounded-lg px-2.5 py-1.5"
          style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text }}
        />
        {!isToday && (
          <button onClick={() => setAsOfDate(todayISO())} className="text-xs font-semibold shrink-0" style={{ color: C.usd }}>
            Hoy
          </button>
        )}
      </div>

      {(() => {
        const pendingByAccount = visibleAccounts
          .map((a) => ({ account: a, months: pendingStatementMonths(a, accountStatements) }))
          .filter((x) => x.months.length > 0);
        if (pendingByAccount.length === 0) return null;
        return (
          <div className="rounded-xl p-3 mb-4 text-xs" style={{ background: "rgba(217,119,106,0.15)", color: C.negative }}>
            <div className="flex items-center gap-1.5 font-semibold mb-1.5">
              <AlertTriangle size={14} /> Estados de cuenta pendientes
            </div>
            <ul className="space-y-1">
              {pendingByAccount.map(({ account, months }) => (
                <li key={account.id}>
                  <button onClick={() => setViewAccountId(account.id)} className="underline text-left">
                    {accountLabel(account, banks)}
                  </button>
                  : {months.map((m) => capitalize(monthLabel(m))).join(", ")}
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      {banks.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <Segment value={sortBy} onChange={setSortBy} options={[{ value: "banco", label: "Por banco" }, { value: "moneda", label: "Por moneda" }]} />
          {canEdit && (
            <button
              onClick={() => setReordering((v) => !v)}
              className="h-9 px-3 rounded-full flex items-center gap-1.5 text-xs font-semibold shrink-0"
              style={{
                background: reordering ? C.usd : C.surface2,
                border: `1px solid ${reordering ? C.usd : C.border}`,
                color: reordering ? "#0A1413" : C.text,
              }}
            >
              <ArrowUpDown size={13} /> {reordering ? "Listo" : "Ordenar"}
            </button>
          )}
        </div>
      )}

      {sortBy === "banco" ? (
        <div className="space-y-3 mb-4">
          {orderItems(banks, allBankIds, sortOrders.banks).map((bank, bankIdx, orderedBanks) => {
              const bankAccounts = orderItems(accountsByBank(visibleAccounts, bank.id), allAccountIds, sortOrders.accountsByBank);
              const hasMovements =
                transactions.some((t) => bankAccounts.some((a) => a.id === t.accountId)) ||
                transfers.some((tr) => bankAccounts.some((a) => a.id === tr.fromAccountId || a.id === tr.toAccountId)) ||
                cardPayments.some((p) => bankAccounts.some((a) => a.id === p.accountId)) ||
                contactEntries.some((e) => bankAccounts.some((a) => a.id === e.accountId));
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
                      {reordering && canEdit ? (
                        <>
                          <IconBtn
                            label="Subir banco"
                            onClick={() => onReorderBanks(moveWithinGroup(banks, allBankIds, sortOrders.banks, bank.id, "up"))}
                          >
                            <ChevronUp size={15} style={{ opacity: bankIdx === 0 ? 0.3 : 1 }} />
                          </IconBtn>
                          <IconBtn
                            label="Bajar banco"
                            onClick={() => onReorderBanks(moveWithinGroup(banks, allBankIds, sortOrders.banks, bank.id, "down"))}
                          >
                            <ChevronDown size={15} style={{ opacity: bankIdx === orderedBanks.length - 1 ? 0.3 : 1 }} />
                          </IconBtn>
                        </>
                      ) : (
                        <>
                          <IconBtn
                            label="Exportar a Excel"
                            onClick={() => exportBankToExcel(bank, bankAccounts, transactions, transfers, cardPayments, contactEntries)}
                          >
                            <FileSpreadsheet size={15} />
                          </IconBtn>
                          {canEdit && (
                            <>
                              <IconBtn label="Editar banco" onClick={() => onEditBank(bank)}><Pencil size={15} /></IconBtn>
                              <IconBtn label="Eliminar banco" danger onClick={() => onDeleteBank(bank.id)}><Trash2 size={15} /></IconBtn>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {bankAccounts.length === 0 ? (
                    <p className="text-xs mb-2" style={{ color: C.textFaint }}>Sin cajas todavía.</p>
                  ) : (
                    <div className="space-y-1.5 mb-2">
                      {bankAccounts.map((acc, accIdx) => {
                        const balance = accountBalance(acc, transactions, transfers, cardPayments, asOfDate, contactEntries);
                        return (
                          <button
                            key={acc.id}
                            onClick={() => !reordering && setViewAccountId(acc.id)}
                            className="w-full rounded-lg px-2.5 py-2 text-left"
                            style={{ background: C.surface2 }}
                          >
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <Wallet size={13} color={C.textFaint} />
                                <span style={{ color: C.text }}>{acc.name}</span>
                                <CurrencyPill currency={acc.currency} />
                                {pendingStatementMonths(acc, accountStatements).length > 0 && (
                                  <AlertTriangle size={12} color={C.negative} aria-label="Estado de cuenta pendiente" />
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {reordering && canEdit ? (
                                  <>
                                    <IconBtn
                                      label="Subir caja"
                                      onClick={(e) => { e.stopPropagation(); onReorderAccountsByBank(moveWithinGroup(bankAccounts, allAccountIds, sortOrders.accountsByBank, acc.id, "up")); }}
                                    >
                                      <ChevronUp size={13} style={{ opacity: accIdx === 0 ? 0.3 : 1 }} />
                                    </IconBtn>
                                    <IconBtn
                                      label="Bajar caja"
                                      onClick={(e) => { e.stopPropagation(); onReorderAccountsByBank(moveWithinGroup(bankAccounts, allAccountIds, sortOrders.accountsByBank, acc.id, "down")); }}
                                    >
                                      <ChevronDown size={13} style={{ opacity: accIdx === bankAccounts.length - 1 ? 0.3 : 1 }} />
                                    </IconBtn>
                                  </>
                                ) : (
                                  <>
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
                                  </>
                                )}
                              </div>
                            </div>
                            {(acc.holderName || acc.accountNumber || acc.branch) && (
                              <div className="text-[10px] mt-0.5 pl-[21px]" style={{ color: C.textFaint }}>
                                {[acc.holderName, acc.branch ? `Suc. ${acc.branch}` : null, acc.accountNumber].filter(Boolean).join(" · ")}
                              </div>
                            )}
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
                </div>
              );
            })}
        </div>
      ) : (
        <div className="space-y-3 mb-4">
          {(["UYU", "USD"] as Currency[])
            .map((currency) => {
              const currencyAccounts = orderItems(
                visibleAccounts.filter((a) => a.currency === currency),
                allAccountIds,
                sortOrders.accountsByCurrency
              );
              if (currencyAccounts.length === 0) return null;
              const total = currencyAccounts.reduce((sum, a) => sum + accountBalance(a, transactions, transfers, cardPayments, asOfDate, contactEntries), 0);
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
                    {currencyAccounts.map((acc, accIdx) => {
                      const balance = accountBalance(acc, transactions, transfers, cardPayments, asOfDate, contactEntries);
                      return (
                        <button
                          key={acc.id}
                          onClick={() => !reordering && setViewAccountId(acc.id)}
                          className="w-full rounded-lg px-2.5 py-2 text-left"
                          style={{ background: C.surface2 }}
                        >
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <Wallet size={13} color={C.textFaint} />
                              <span style={{ color: C.text }}>{accountLabel(acc, banks)}</span>
                              {pendingStatementMonths(acc, accountStatements).length > 0 && (
                                <AlertTriangle size={12} color={C.negative} aria-label="Estado de cuenta pendiente" />
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {reordering && canEdit ? (
                                <>
                                  <IconBtn
                                    label="Subir caja"
                                    onClick={(e) => { e.stopPropagation(); onReorderAccountsByCurrency(moveWithinGroup(currencyAccounts, allAccountIds, sortOrders.accountsByCurrency, acc.id, "up")); }}
                                  >
                                    <ChevronUp size={13} style={{ opacity: accIdx === 0 ? 0.3 : 1 }} />
                                  </IconBtn>
                                  <IconBtn
                                    label="Bajar caja"
                                    onClick={(e) => { e.stopPropagation(); onReorderAccountsByCurrency(moveWithinGroup(currencyAccounts, allAccountIds, sortOrders.accountsByCurrency, acc.id, "down")); }}
                                  >
                                    <ChevronDown size={13} style={{ opacity: accIdx === currencyAccounts.length - 1 ? 0.3 : 1 }} />
                                  </IconBtn>
                                </>
                              ) : (
                              <>
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
                              </>
                              )}
                            </div>
                          </div>
                          {(acc.holderName || acc.accountNumber || acc.branch) && (
                            <div className="text-[10px] mt-0.5 pl-[21px]" style={{ color: C.textFaint }}>
                              {[acc.holderName, acc.branch ? `Suc. ${acc.branch}` : null, acc.accountNumber].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          {visibleAccounts.length === 0 && (
            <p className="text-xs text-center py-4" style={{ color: C.textFaint }}>
              {accounts.length === 0 ? "Todavía no agregaste cajas." : "No tenés cajas activas. Activalas en Configuración → Bancos."}
            </p>
          )}
        </div>
      )}

      {viewAccount && (
        <AccountLedgerModal
          account={viewAccount}
          banks={banks}
          accounts={accounts}
          transactions={transactions}
          transfers={transfers}
          cardPayments={cardPayments}
          contacts={contacts}
          contactEntries={contactEntries}
          cards={cards}
          canEdit={canEditMovements}
          asOfDate={asOfDate}
          accountStatements={accountStatements}
          onSaveAccountStatement={onSaveAccountStatement}
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
  contacts,
  contactEntries,
  cards,
  canEdit,
  asOfDate,
  accountStatements,
  onSaveAccountStatement,
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
  contacts: Contact[];
  contactEntries: ContactEntry[];
  cards: Card[];
  canEdit: boolean;
  /** Fecha (YYYY-MM-DD) hasta la que se muestran saldo y movimientos; hoy por defecto. */
  asOfDate: string;
  accountStatements: AccountStatement[];
  onSaveAccountStatement: (s: AccountStatement) => void;
  onEditTransaction: (t: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  onEditTransfer: (t: Transfer) => void;
  onDeleteTransfer: (id: string) => void;
  onEditCardPayment: (p: CardPayment) => void;
  onDeleteCardPayment: (id: string) => void;
  onClose: () => void;
}) {
  const entries = accountLedger(account, transactions, transfers, cardPayments, asOfDate, contactEntries);
  const balance = accountBalance(account, transactions, transfers, cardPayments, asOfDate, contactEntries);
  const isToday = asOfDate === todayISO();
  const [copied, setCopied] = useState(false);

  const pendingMonths = pendingStatementMonths(account, accountStatements);
  const [statementMonth, setStatementMonth] = useState<string>(() => pendingMonths[0] ?? currentMonthKey());
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [statementError, setStatementError] = useState<string | null>(null);
  const currentStatement = getStatement(accountStatements, account.id, statementMonth);
  const statementMonthOptions = Array.from({ length: 25 }, (_, i) => addMonths(currentMonthKey(), -i));

  const handleStatementUpload = async (file: File, kind: "pdf" | "excel") => {
    const setBusy = kind === "pdf" ? setUploadingPdf : setUploadingExcel;
    setBusy(true);
    setStatementError(null);
    try {
      const path = await uploadReceipt(file, `stmt-${account.id}-${statementMonth}-${kind}`);
      const base = currentStatement ?? { id: crypto.randomUUID(), accountId: account.id, month: statementMonth };
      onSaveAccountStatement({ ...base, [kind === "pdf" ? "pdfPath" : "excelPath"]: path });
    } catch (err) {
      console.error(err);
      setStatementError("No se pudo subir el archivo. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  const handleStatementView = async (path: string) => {
    setStatementError(null);
    try {
      const url = await getReceiptUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error(err);
      setStatementError("No se pudo abrir el archivo.");
    }
  };

  const handleStatementRemove = (kind: "pdf" | "excel") => {
    if (!currentStatement) return;
    const path = kind === "pdf" ? currentStatement.pdfPath : currentStatement.excelPath;
    if (path) deleteReceipt(path);
    onSaveAccountStatement({ ...currentStatement, [kind === "pdf" ? "pdfPath" : "excelPath"]: undefined });
  };

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
        <span className="text-xs" style={{ color: C.textMuted }}>{isToday ? "Saldo actual" : `Saldo al ${formatDateDMY(asOfDate)}`}</span>
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

      <div className="rounded-xl p-3 mb-4" style={{ background: C.surface2, border: `1px solid ${C.border}` }}>
        <h3 className="text-sm font-semibold mb-2" style={{ color: C.text }}>Estados de cuenta</h3>

        {pendingMonths.length > 0 && (
          <div className="rounded-lg p-2.5 mb-2 text-xs flex items-start gap-1.5" style={{ background: "rgba(217,119,106,0.15)", color: C.negative }}>
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>Falta cargar el estado de cuenta de: {pendingMonths.map((m) => capitalize(monthLabel(m))).join(", ")}.</span>
          </div>
        )}

        <div className="mb-2">
          <Select aria-label="Mes del estado de cuenta" value={statementMonth} onChange={(e) => setStatementMonth(e.target.value)}>
            {statementMonthOptions.map((m) => (
              <option key={m} value={m}>
                {capitalize(monthLabel(m))}{pendingMonths.includes(m) ? " · pendiente" : ""}
              </option>
            ))}
          </Select>
        </div>

        <StatementFileRow
          label="PDF"
          accept=".pdf,application/pdf"
          path={currentStatement?.pdfPath}
          uploading={uploadingPdf}
          onUpload={(f) => handleStatementUpload(f, "pdf")}
          onView={handleStatementView}
          onRemove={() => handleStatementRemove("pdf")}
        />
        <StatementFileRow
          label="Excel"
          accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          path={currentStatement?.excelPath}
          uploading={uploadingExcel}
          onUpload={(f) => handleStatementUpload(f, "excel")}
          onView={handleStatementView}
          onRemove={() => handleStatementRemove("excel")}
        />

        {statementError && <p className="text-xs" style={{ color: C.negative }}>{statementError}</p>}
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: C.textMuted }}>Sin movimientos en esta cuenta todavía.</p>
      ) : (
        <div className="space-y-2 max-h-[55vh] overflow-y-auto">
          {entries.map((entry) => {
            const isTransfer = entry.kind === "transfer-out" || entry.kind === "transfer-in";
            const isCardPayment = entry.kind === "card-payment";
            const isContactEntry = entry.kind === "contact-entry";
            const key =
              entry.kind === "transaction"
                ? entry.transaction!.id
                : isCardPayment
                ? entry.cardPayment!.id
                : isContactEntry
                ? entry.contactEntry!.id
                : `${entry.transfer!.id}-${entry.kind}`;
            const label = isCardPayment
              ? `Pago tarjeta ${cards.find((c) => c.id === entry.cardPayment!.cardId)?.name ?? "eliminada"}`
              : isContactEntry
              ? `Personas: ${contacts.find((c) => c.id === entry.contactEntry!.contactId)?.name ?? "contacto eliminado"}`
              : isTransfer
              ? entry.kind === "transfer-out"
                ? `Transferencia a ${accountLabel(accounts.find((a) => a.id === entry.transfer!.toAccountId), banks)}`
                : `Transferencia desde ${accountLabel(accounts.find((a) => a.id === entry.transfer!.fromAccountId), banks)}`
              : `${entry.transaction!.category ?? "Sin categorizar"}${entry.transaction!.note ? ` · ${entry.transaction!.note}` : ""}`;
            const note = isCardPayment ? entry.cardPayment!.note : isContactEntry ? entry.contactEntry!.description : isTransfer ? entry.transfer!.note : undefined;
            const receiptPaths = receiptPathsOf(entry.transaction ?? entry.transfer ?? entry.cardPayment ?? entry.contactEntry);

            return (
              <div key={key} className="rounded-xl p-3" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                      style={{
                        background: isCardPayment || isContactEntry
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
                      ) : isContactEntry ? (
                        <Users size={14} color={entry.amountMinor >= 0 ? C.positive : C.negative} />
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
                      <div className="text-xs" style={{ color: C.textFaint }}>{formatDateDMY(entry.date)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="text-right">
                      <div className="font-mono text-sm" style={{ color: entry.amountMinor >= 0 ? C.positive : C.negative }}>
                        {entry.amountMinor >= 0 ? "+" : "-"}{formatMoney(Math.abs(entry.amountMinor), account.currency)}
                      </div>
                      <div className="text-[10px] font-mono" style={{ color: C.textFaint }}>saldo {formatMoney(entry.runningBalanceMinor, account.currency)}</div>
                    </div>
                    <ReceiptButton paths={receiptPaths} />
                    {canEdit && !isContactEntry && (
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

export function AccountModal({ bankId, banks, initial, accounts, onSave, onClose }: {
  /** Banco preseleccionado al abrir el modal (el usuario puede cambiarlo). */
  bankId: string;
  banks: Bank[];
  initial?: Account;
  /** Cuentas ya cargadas, solo para sugerir titulares ya usados (ej. vos o tu esposa) sin tener que retipearlos. */
  accounts: Account[];
  onSave: (a: Account) => void;
  onClose: () => void;
}) {
  const [selectedBankId, setSelectedBankId] = useState(initial?.bankId ?? bankId ?? banks[0]?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? "UYU");
  const [initialBalance, setInitialBalance] = useState(initial ? String(fromMinor(initial.initialBalanceMinor)) : "0");
  const [holderName, setHolderName] = useState(initial?.holderName ?? "");
  const [accountNumber, setAccountNumber] = useState(initial?.accountNumber ?? "");
  const [branch, setBranch] = useState(initial?.branch ?? "");
  const [statementReminders, setStatementReminders] = useState(initial?.statementReminders ?? false);
  const [error, setError] = useState<string | null>(null);

  const holderSuggestions = Array.from(new Set(accounts.map((a) => a.holderName).filter((h): h is string => !!h)));
  // La sucursal solo se pide para bancos que la usan (configurable en Configuración → Bancos, ej. Santander).
  const bankUsesBranch = banks.find((b) => b.id === selectedBankId)?.usesBranch ?? false;

  const handleSave = () => {
    if (!selectedBankId) return setError("Elegí un banco.");
    if (!name.trim()) return setError("Ingresá un nombre para la caja (ej. Caja de ahorro).");
    const minor = parseAmountInput(initialBalance || "0");
    if (minor === null) return setError("El saldo inicial no es un número válido.");
    // Si se prende el recordatorio (y antes estaba apagado), empieza a contar desde el mes
    // actual: no reclama retroactivamente estados de cuenta de antes de haberlo activado.
    const wasOn = initial?.statementReminders ?? false;
    const statementRemindersSince = statementReminders
      ? initial?.statementRemindersSince && wasOn
        ? initial.statementRemindersSince
        : currentMonthKey()
      : initial?.statementRemindersSince;
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      bankId: selectedBankId,
      name: name.trim(),
      currency,
      initialBalanceMinor: minor,
      holderName: holderName.trim() || undefined,
      accountNumber: accountNumber.trim() || undefined,
      branch: bankUsesBranch ? branch.trim() || undefined : initial?.branch,
      statementReminders,
      statementRemindersSince,
    });
  };

  return (
    <Modal title={initial ? "Editar caja" : "Nueva caja"} onClose={onClose}>
      <Field label="Banco">
        {(id) =>
          banks.length === 0 ? (
            <p className="text-xs" style={{ color: C.textFaint }}>Primero creá un banco.</p>
          ) : (
            <Select id={id} value={selectedBankId} onChange={(e) => setSelectedBankId(e.target.value)}>
              {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          )
        }
      </Field>
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
      {bankUsesBranch && (
        <Field label="Sucursal">
          {(id) => <TextInput id={id} value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="Ej. 001" />}
        </Field>
      )}
      <Field label="Recordatorio de estado de cuenta">
        {() => (
          <Segment
            value={statementReminders ? "on" : "off"}
            onChange={(v) => setStatementReminders(v === "on")}
            options={[{ value: "off", label: "No" }, { value: "on", label: "Sí, avisame" }]}
          />
        )}
      </Field>
      <p className="text-xs -mt-2 mb-3" style={{ color: C.textFaint }}>
        Con esto activado, cada mes que cierre te avisamos acá hasta que subas el PDF y el Excel del estado de cuenta de esa caja.
      </p>
      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>
    </Modal>
  );
}
