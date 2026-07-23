import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Home, List, CreditCard, PieChart as PieIcon, TrendingUp, Plus, Landmark, Settings as SettingsIcon, ChevronDown, Calculator as CalculatorIcon, Coins, RefreshCw, StickyNote, Users, Sun, Moon, Building2 } from "lucide-react";
import { theme as C, useThemeMode, toggleThemeMode } from "./styles/theme";
import { ConfirmDialog } from "./components/ui";
import { CalculatorModal } from "./components/Calculator";
import { PullToRefresh } from "./components/PullToRefresh";
import { getRepository } from "./lib/storage";
import { supabase } from "./lib/supabaseClient";
import { canView as checkView, canEdit as checkEdit } from "./lib/permissions";
import type {
  FinanceData, Transaction, Card, Installment, Budget, Bank, Account,
  Category, AppUser, PermissionKey, Transfer, CardPayment, Note, AppLock, AccountStatement, CardStatement,
  Contact, ContactEntry, MortgageLoan, MortgagePrepayment,
} from "./types";
import { Dashboard } from "./features/dashboard/Dashboard";
import { Transactions, MovementModal } from "./features/transactions/Transactions";
import { Cards, CardModal, CardPaymentModal } from "./features/cards/Cards";
import { Budgets, BudgetModal } from "./features/budgets/Budgets";
import { Projection } from "./features/projection/Projection";
import { Accounts, BankModal, AccountModal } from "./features/accounts/Accounts";
import { ExchangeRates } from "./features/exchangeRates/ExchangeRates";
import { Notes, NoteModal } from "./features/notes/Notes";
import { Contacts, ContactModal, ContactEntryModal, SplitExpenseModal, type SplitOwnExpense } from "./features/contacts/Contacts";
import { Mortgage, LoanModal, PrepaymentModal } from "./features/mortgage/Mortgage";
import { LockScreen } from "./features/security/LockScreen";
import { Settings } from "./features/settings/Settings";
import { CategoryModal } from "./features/settings/Categories";
import { UserModal } from "./features/settings/Users";

type TabId = "inicio" | "movimientos" | "cuentas" | "tarjetas" | "presupuestos" | "proyeccion" | "cotizaciones" | "notas" | "personas" | "hipoteca" | "configuracion";

const TABS: { id: TabId; label: string; Icon: typeof Home }[] = [
  { id: "inicio", label: "Inicio", Icon: Home },
  { id: "movimientos", label: "Movim.", Icon: List },
  { id: "cuentas", label: "Cuentas", Icon: Landmark },
  { id: "tarjetas", label: "Tarjetas", Icon: CreditCard },
  { id: "presupuestos", label: "Presup.", Icon: PieIcon },
  { id: "proyeccion", label: "Proyecc.", Icon: TrendingUp },
];

type ModalState =
  | { type: "movement"; payload?: { transaction?: Transaction; transfer?: Transfer; installment?: Installment; presetCardId?: string } }
  | { type: "card"; payload?: Card }
  | { type: "budget"; payload?: Budget }
  | { type: "bank"; payload?: Bank }
  | { type: "account"; payload: { bankId: string; account?: Account } }
  | { type: "cardPayment"; payload: { cardId: string; payment?: CardPayment } }
  | { type: "category" }
  | { type: "user"; payload?: AppUser }
  | { type: "note"; payload?: Note }
  | { type: "contact"; payload?: Contact }
  | { type: "contactEntry"; payload: { contactId: string; entry?: ContactEntry } }
  | { type: "splitExpense" }
  | { type: "mortgageLoan"; payload?: MortgageLoan }
  | { type: "mortgagePrepayment"; payload: { loanId: string; prepayment?: MortgagePrepayment } }
  | null;

const repo = getRepository();

export default function App() {
  // Suscribe a la app entera a los cambios de modo claro/oscuro: al llamarlo
  // acá (cerca de la raíz), cualquier cambio de modo re-renderiza todo el
  // árbol y cada componente vuelve a leer los colores actualizados de `C`.
  const themeMode = useThemeMode();
  const [data, setData] = useState<FinanceData | null>(null);
  const [tab, setTab] = useState<TabId>("inicio");
  const [modal, setModal] = useState<ModalState>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const pendingSaves = useRef(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSessionEmail(data.user?.email ?? null));
  }, []);

  const loadData = useCallback(() => {
    setRefreshing(true);
    return repo
      .load()
      .then(setData)
      .finally(() => setRefreshing(false));
  }, []);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!data) return;
    pendingSaves.current += 1;
    setSaving(true);
    repo
      .save(data)
      .catch(() => setSaveError("No se pudieron guardar los cambios. Revisá el espacio disponible del navegador."))
      .finally(() => {
        pendingSaves.current -= 1;
        if (pendingSaves.current <= 0) setSaving(false);
      });
  }, [data]);

  // Avisa antes de cerrar/recargar la pestaña si todavía hay un guardado en
  // curso, para no perder el último cambio (ej. una nota recién escrita) si
  // cerrás la app enseguida después de guardar.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!saving) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saving]);

  const closeModal = () => setModal(null);

  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const requestConfirm = useCallback((message: string, onConfirm: () => void) => setConfirm({ message, onConfirm }), []);

  const activeUser = useMemo(() => {
    if (!data) return null;
    return data.users.find((u) => u.id === data.activeUserId) ?? null;
  }, [data]);
  const has = useCallback((key: PermissionKey, mode: "view" | "edit") => (mode === "view" ? checkView(activeUser, key) : checkEdit(activeUser, key)), [activeUser]);

  // Login separado (ej. tu pareja): si el email con el que entró coincide con
  // el `authEmail` de un perfil que no es superusuario, la app la fija en ese
  // perfil siempre y le oculta el selector, sin importar qué perfil haya
  // quedado activo la última vez (compartido entre dispositivos).
  const matchedUser = useMemo(() => {
    if (!data || !sessionEmail) return null;
    return data.users.find((u) => u.authEmail && u.authEmail.trim().toLowerCase() === sessionEmail.trim().toLowerCase()) ?? null;
  }, [data, sessionEmail]);
  const lockedToNonAdmin = !!matchedUser && !matchedUser.isAdmin;

  useEffect(() => {
    if (!data || !lockedToNonAdmin || !matchedUser) return;
    if (data.activeUserId !== matchedUser.id) {
      setData((d) => (d ? { ...d, activeUserId: matchedUser.id } : d));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.activeUserId, lockedToNonAdmin, matchedUser?.id]);

  // Si cambia el perfil activo (ej. el superusuario cambia al perfil de otra
  // persona desde el selector), volvemos a pedir el bloqueo de ESE perfil en
  // vez de seguir "desbloqueados" con el PIN del perfil anterior.
  const prevActiveUserId = useRef<string | null>(null);
  useEffect(() => {
    const id = activeUser?.id ?? null;
    if (prevActiveUserId.current !== null && prevActiveUserId.current !== id) {
      setUnlocked(false);
    }
    prevActiveUserId.current = id;
  }, [activeUser?.id]);

  // --- transactions ---
  const upsertTransaction = useCallback((t: Transaction) => {
    setData((d) => {
      if (!d) return d;
      const idx = d.transactions.findIndex((x) => x.id === t.id);
      const withCreator = idx >= 0 ? t : { ...t, createdByUserId: t.createdByUserId ?? activeUser?.id };
      const transactions = idx >= 0 ? d.transactions.map((x) => (x.id === t.id ? withCreator : x)) : [...d.transactions, withCreator];
      return { ...d, transactions };
    });
    closeModal();
  }, [activeUser]);
  const deleteTransaction = useCallback((id: string) => {
    setData((d) => (d ? { ...d, transactions: d.transactions.filter((x) => x.id !== id) } : d));
  }, []);
  const confirmDeleteTransaction = useCallback(
    (id: string) => requestConfirm("¿Eliminar este movimiento? No se puede deshacer.", () => deleteTransaction(id)),
    [requestConfirm, deleteTransaction]
  );

  // --- cards & installments ---
  const upsertCard = useCallback((c: Card) => {
    setData((d) => {
      if (!d) return d;
      const idx = d.cards.findIndex((x) => x.id === c.id);
      const cards = idx >= 0 ? d.cards.map((x) => (x.id === c.id ? c : x)) : [...d.cards, c];
      return { ...d, cards };
    });
    closeModal();
  }, []);
  const deleteCard = useCallback((id: string) => {
    setData((d) =>
      d
        ? {
            ...d,
            cards: d.cards.filter((x) => x.id !== id),
            installments: d.installments.filter((i) => i.cardId !== id),
            cardPayments: d.cardPayments.filter((p) => p.cardId !== id),
            transactions: d.transactions.map((t) => (t.cardId === id ? { ...t, cardId: undefined } : t)),
          }
        : d
    );
  }, []);
  const confirmDeleteCard = useCallback(
    (id: string) => requestConfirm("¿Eliminar esta tarjeta? También se eliminan sus cuotas y pagos registrados. Los gastos quedan sin tarjeta asignada.", () => deleteCard(id)),
    [requestConfirm, deleteCard]
  );
  const upsertInstallment = useCallback((inst: Installment) => {
    setData((d) => {
      if (!d) return d;
      const idx = d.installments.findIndex((x) => x.id === inst.id);
      const withCreator = idx >= 0 ? inst : { ...inst, createdByUserId: inst.createdByUserId ?? activeUser?.id };
      const installments = idx >= 0 ? d.installments.map((x) => (x.id === inst.id ? withCreator : x)) : [...d.installments, withCreator];
      return { ...d, installments };
    });
    closeModal();
  }, [activeUser]);
  const deleteInstallment = useCallback((id: string) => {
    setData((d) => (d ? { ...d, installments: d.installments.filter((x) => x.id !== id) } : d));
  }, []);
  const confirmDeleteInstallment = useCallback(
    (id: string) => requestConfirm("¿Eliminar esta compra en cuotas? No se puede deshacer.", () => deleteInstallment(id)),
    [requestConfirm, deleteInstallment]
  );
  const upsertCardPayment = useCallback((p: CardPayment) => {
    setData((d) => {
      if (!d) return d;
      const idx = d.cardPayments.findIndex((x) => x.id === p.id);
      const withCreator = idx >= 0 ? p : { ...p, createdByUserId: p.createdByUserId ?? activeUser?.id };
      const cardPayments = idx >= 0 ? d.cardPayments.map((x) => (x.id === p.id ? withCreator : x)) : [...d.cardPayments, withCreator];
      return { ...d, cardPayments };
    });
    closeModal();
  }, [activeUser]);
  const deleteCardPayment = useCallback((id: string) => {
    setData((d) => (d ? { ...d, cardPayments: d.cardPayments.filter((x) => x.id !== id) } : d));
  }, []);
  const confirmDeleteCardPayment = useCallback(
    (id: string) => requestConfirm("¿Eliminar este pago de tarjeta? El saldo de la cuenta se va a recalcular.", () => deleteCardPayment(id)),
    [requestConfirm, deleteCardPayment]
  );

  // --- budgets ---
  const saveBudget = useCallback((b: Budget) => {
    setData((d) => {
      if (!d) return d;
      const idx = d.budgets.findIndex((x) => x.id === b.id);
      const budgets = idx >= 0 ? d.budgets.map((x) => (x.id === b.id ? b : x)) : [...d.budgets, b];
      return { ...d, budgets };
    });
    closeModal();
  }, []);
  const deleteBudget = useCallback((id: string) => {
    setData((d) => (d ? { ...d, budgets: d.budgets.filter((x) => x.id !== id) } : d));
  }, []);
  const confirmDeleteBudget = useCallback(
    (id: string) => requestConfirm("¿Eliminar este presupuesto?", () => deleteBudget(id)),
    [requestConfirm, deleteBudget]
  );

  // --- banks & accounts ---
  const upsertBank = useCallback((b: Bank) => {
    setData((d) => {
      if (!d) return d;
      const idx = d.banks.findIndex((x) => x.id === b.id);
      const banks = idx >= 0 ? d.banks.map((x) => (x.id === b.id ? b : x)) : [...d.banks, b];
      return { ...d, banks };
    });
    closeModal();
  }, []);
  const deleteBank = useCallback((id: string) => {
    setData((d) => {
      if (!d) return d;
      const accountIds = d.accounts.filter((a) => a.bankId === id).map((a) => a.id);
      return {
        ...d,
        banks: d.banks.filter((x) => x.id !== id),
        accounts: d.accounts.filter((a) => a.bankId !== id),
        transactions: d.transactions.map((t) => (accountIds.includes(t.accountId ?? "") ? { ...t, accountId: undefined } : t)),
      };
    });
  }, []);
  const confirmDeleteBank = useCallback(
    (id: string) => requestConfirm("¿Eliminar este banco? También se eliminan sus cajas.", () => deleteBank(id)),
    [requestConfirm, deleteBank]
  );
  const upsertAccount = useCallback((a: Account) => {
    setData((d) => {
      if (!d) return d;
      const idx = d.accounts.findIndex((x) => x.id === a.id);
      const accounts = idx >= 0 ? d.accounts.map((x) => (x.id === a.id ? a : x)) : [...d.accounts, a];
      return { ...d, accounts };
    });
    closeModal();
  }, []);
  const deleteAccount = useCallback((id: string) => {
    setData((d) =>
      d
        ? {
            ...d,
            accounts: d.accounts.filter((x) => x.id !== id),
            transactions: d.transactions.map((t) => (t.accountId === id ? { ...t, accountId: undefined } : t)),
            transfers: d.transfers.filter((tr) => tr.fromAccountId !== id && tr.toAccountId !== id),
            cardPayments: d.cardPayments.filter((p) => p.accountId !== id),
          }
        : d
    );
  }, []);
  const confirmDeleteAccount = useCallback(
    (id: string) => requestConfirm("¿Eliminar esta caja? Los movimientos asociados van a quedar sin cuenta.", () => deleteAccount(id)),
    [requestConfirm, deleteAccount]
  );
  const upsertTransfer = useCallback((tr: Transfer) => {
    setData((d) => {
      if (!d) return d;
      const idx = d.transfers.findIndex((x) => x.id === tr.id);
      const withCreator = idx >= 0 ? tr : { ...tr, createdByUserId: tr.createdByUserId ?? activeUser?.id };
      const transfers = idx >= 0 ? d.transfers.map((x) => (x.id === tr.id ? withCreator : x)) : [...d.transfers, withCreator];
      return { ...d, transfers };
    });
    closeModal();
  }, [activeUser]);
  const deleteTransfer = useCallback((id: string) => {
    setData((d) => (d ? { ...d, transfers: d.transfers.filter((x) => x.id !== id) } : d));
  }, []);
  const confirmDeleteTransfer = useCallback(
    (id: string) => requestConfirm("¿Eliminar esta transferencia? No se puede deshacer.", () => deleteTransfer(id)),
    [requestConfirm, deleteTransfer]
  );

  // --- categories ---
  const saveCategory = useCallback((c: Category) => {
    setData((d) => (d ? { ...d, categories: [...d.categories, c] } : d));
  }, []);
  const addCategory = useCallback((c: Category) => {
    saveCategory(c);
    closeModal();
  }, [saveCategory]);
  const deleteCategory = useCallback((id: string) => {
    setData((d) => (d ? { ...d, categories: d.categories.filter((x) => x.id !== id) } : d));
  }, []);
  const confirmDeleteCategory = useCallback(
    (id: string) => requestConfirm("¿Eliminar esta categoría?", () => deleteCategory(id)),
    [requestConfirm, deleteCategory]
  );
  const moveCategory = useCallback((id: string, newParentId: string) => {
    setData((d) => (d ? { ...d, categories: d.categories.map((c) => (c.id === id ? { ...c, parentId: newParentId } : c)) } : d));
  }, []);
  const reclassifyCategory = useCallback((fromName: string, toName: string) => {
    setData((d) =>
      d
        ? {
            ...d,
            transactions: d.transactions.map((t) => (t.category === fromName ? { ...t, category: toName } : t)),
            installments: d.installments.map((i) => (i.category === fromName ? { ...i, category: toName } : i)),
          }
        : d
    );
  }, []);
  const saveAccountStatement = useCallback((s: AccountStatement) => {
    setData((d) =>
      d
        ? {
            ...d,
            accountStatements: d.accountStatements.some((x) => x.id === s.id)
              ? d.accountStatements.map((x) => (x.id === s.id ? s : x))
              : [...d.accountStatements, s],
          }
        : d
    );
  }, []);
  const saveCardStatement = useCallback((s: CardStatement) => {
    setData((d) =>
      d
        ? {
            ...d,
            cardStatements: d.cardStatements.some((x) => x.id === s.id)
              ? d.cardStatements.map((x) => (x.id === s.id ? s : x))
              : [...d.cardStatements, s],
          }
        : d
    );
  }, []);
  const updateBankFields = useCallback((id: string, partial: Partial<Bank>) => {
    setData((d) => (d ? { ...d, banks: d.banks.map((b) => (b.id === id ? { ...b, ...partial } : b)) } : d));
  }, []);
  const updateAccountFields = useCallback((id: string, partial: Partial<Account>) => {
    setData((d) => (d ? { ...d, accounts: d.accounts.map((a) => (a.id === id ? { ...a, ...partial } : a)) } : d));
  }, []);

  // --- personas ---
  const upsertContact = useCallback((c: Contact) => {
    setData((d) => {
      if (!d) return d;
      const idx = d.contacts.findIndex((x) => x.id === c.id);
      const contacts = idx >= 0 ? d.contacts.map((x) => (x.id === c.id ? c : x)) : [...d.contacts, c];
      return { ...d, contacts };
    });
    closeModal();
  }, []);
  const deleteContact = useCallback((id: string) => {
    setData((d) =>
      d
        ? {
            ...d,
            contacts: d.contacts.filter((x) => x.id !== id),
            contactEntries: d.contactEntries.filter((e) => e.contactId !== id),
          }
        : d
    );
  }, []);
  const confirmDeleteContact = useCallback(
    (id: string) => requestConfirm("¿Eliminar esta persona? También se eliminan sus movimientos.", () => deleteContact(id)),
    [requestConfirm, deleteContact]
  );
  const upsertContactEntry = useCallback((e: ContactEntry) => {
    setData((d) => {
      if (!d) return d;
      const idx = d.contactEntries.findIndex((x) => x.id === e.id);
      const contactEntries = idx >= 0 ? d.contactEntries.map((x) => (x.id === e.id ? e : x)) : [...d.contactEntries, e];
      return { ...d, contactEntries };
    });
    closeModal();
  }, []);
  const deleteContactEntry = useCallback((id: string) => {
    setData((d) => (d ? { ...d, contactEntries: d.contactEntries.filter((x) => x.id !== id) } : d));
  }, []);
  const confirmDeleteContactEntry = useCallback(
    (id: string) => requestConfirm("¿Eliminar este movimiento? No se puede deshacer.", () => deleteContactEntry(id)),
    [requestConfirm, deleteContactEntry]
  );
  const saveSplitExpense = useCallback((entries: ContactEntry[], ownExpense?: SplitOwnExpense) => {
    setData((d) => {
      if (!d) return d;
      const transactions = ownExpense
        ? [
            ...d.transactions,
            {
              id: crypto.randomUUID(),
              type: "gasto" as const,
              amountMinor: ownExpense.amountMinor,
              currency: ownExpense.currency,
              category: ownExpense.category,
              date: ownExpense.date,
              note: ownExpense.note,
              accountId: ownExpense.accountId,
            },
          ]
        : d.transactions;
      return { ...d, contactEntries: [...d.contactEntries, ...entries], transactions };
    });
    closeModal();
  }, []);

  // --- hipoteca ---
  const upsertMortgageLoan = useCallback((loan: MortgageLoan) => {
    setData((d) => {
      if (!d) return d;
      const idx = d.mortgageLoans.findIndex((x) => x.id === loan.id);
      const mortgageLoans = idx >= 0 ? d.mortgageLoans.map((x) => (x.id === loan.id ? loan : x)) : [...d.mortgageLoans, loan];
      return { ...d, mortgageLoans };
    });
    closeModal();
  }, []);
  const deleteMortgageLoan = useCallback((id: string) => {
    setData((d) => (d ? { ...d, mortgageLoans: d.mortgageLoans.filter((x) => x.id !== id) } : d));
  }, []);
  const confirmDeleteMortgageLoan = useCallback(
    (id: string) => requestConfirm("¿Eliminar este préstamo? También se eliminan sus amortizaciones registradas. No se puede deshacer.", () => deleteMortgageLoan(id)),
    [requestConfirm, deleteMortgageLoan]
  );
  const upsertMortgagePrepayment = useCallback((loanId: string, prepayment: MortgagePrepayment) => {
    setData((d) => {
      if (!d) return d;
      const mortgageLoans = d.mortgageLoans.map((loan) => {
        if (loan.id !== loanId) return loan;
        const idx = loan.prepayments.findIndex((x) => x.id === prepayment.id);
        const prepayments = idx >= 0 ? loan.prepayments.map((x) => (x.id === prepayment.id ? prepayment : x)) : [...loan.prepayments, prepayment];
        return { ...loan, prepayments };
      });
      return { ...d, mortgageLoans };
    });
    closeModal();
  }, []);
  const deleteMortgagePrepayment = useCallback((loanId: string, prepaymentId: string) => {
    setData((d) => {
      if (!d) return d;
      const mortgageLoans = d.mortgageLoans.map((loan) =>
        loan.id === loanId ? { ...loan, prepayments: loan.prepayments.filter((x) => x.id !== prepaymentId) } : loan
      );
      return { ...d, mortgageLoans };
    });
  }, []);
  const confirmDeleteMortgagePrepayment = useCallback(
    (loanId: string, prepaymentId: string) => requestConfirm("¿Eliminar esta amortización extraordinaria?", () => deleteMortgagePrepayment(loanId, prepaymentId)),
    [requestConfirm, deleteMortgagePrepayment]
  );

  // --- notes ---
  const upsertNote = useCallback((n: Note) => {
    setData((d) => {
      if (!d) return d;
      const idx = d.notes.findIndex((x) => x.id === n.id);
      const notes = idx >= 0 ? d.notes.map((x) => (x.id === n.id ? n : x)) : [...d.notes, n];
      return { ...d, notes };
    });
    closeModal();
  }, []);
  const deleteNote = useCallback((id: string) => {
    setData((d) => (d ? { ...d, notes: d.notes.filter((x) => x.id !== id) } : d));
  }, []);
  const confirmDeleteNote = useCallback(
    (id: string) => requestConfirm("¿Eliminar esta nota?", () => deleteNote(id)),
    [requestConfirm, deleteNote]
  );

  // --- users ---
  const upsertUser = useCallback((u: AppUser) => {
    setData((d) => {
      if (!d) return d;
      const idx = d.users.findIndex((x) => x.id === u.id);
      const users = idx >= 0 ? d.users.map((x) => (x.id === u.id ? u : x)) : [...d.users, u];
      return { ...d, users };
    });
    closeModal();
  }, []);
  const deleteUser = useCallback((id: string) => {
    setData((d) => {
      if (!d || d.users.length <= 1) return d;
      const users = d.users.filter((x) => x.id !== id);
      const activeUserId = d.activeUserId === id ? users[0]?.id ?? null : d.activeUserId;
      return { ...d, users, activeUserId };
    });
  }, []);
  const confirmDeleteUser = useCallback(
    (id: string) => requestConfirm("¿Eliminar este usuario?", () => deleteUser(id)),
    [requestConfirm, deleteUser]
  );
  const setActiveUser = useCallback((id: string) => {
    setData((d) => (d ? { ...d, activeUserId: id } : d));
    setUserMenuOpen(false);
  }, []);
  // Actualiza el bloqueo (clave/Face ID) del perfil actualmente activo, no de todos los perfiles.
  const updateActiveUserLock = useCallback((partial: Partial<AppLock>) => {
    setData((d) => {
      if (!d || !d.activeUserId) return d;
      const users = d.users.map((u) =>
        u.id === d.activeUserId ? { ...u, lock: { ...(u.lock ?? { enabled: false, pinHash: null }), ...partial } } : u
      );
      return { ...d, users };
    });
  }, []);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg, color: C.textMuted }}>
        Cargando...
      </div>
    );
  }

  if (activeUser?.lock?.enabled && !unlocked) {
    return (
      <LockScreen
        userId={activeUser.id}
        userName={activeUser.name}
        pinHash={activeUser.lock.pinHash}
        onUnlock={() => setUnlocked(true)}
      />
    );
  }

  const visibleTabs = TABS.filter((t) => has(t.id, "view"));
  const showFab = has("movimientos", "edit");

  return (
    <PullToRefresh onRefresh={() => loadData()} refreshing={refreshing}>
    <div className="min-h-screen" style={{ background: C.bg }}>
      <div className="max-w-md mx-auto px-4 pt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="relative">
            {lockedToNonAdmin ? (
              <span className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full" style={{ background: C.surface2, color: C.textMuted }}>
                {activeUser?.name ?? "Sin perfil"}
              </span>
            ) : (
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full"
                style={{ background: C.surface2, color: C.textMuted }}
              >
                {activeUser?.name ?? "Sin perfil"} <ChevronDown size={12} />
              </button>
            )}
            {!lockedToNonAdmin && userMenuOpen && (
              <div className="absolute left-0 top-9 z-40 rounded-lg overflow-hidden w-40" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                {data.users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setActiveUser(u.id)}
                    className="w-full text-left px-3 py-2 text-xs"
                    style={{ color: u.id === data.activeUserId ? C.usd : C.text }}
                  >
                    {u.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {saving && (
              <span className="text-[10px]" style={{ color: C.textFaint }}>
                Guardando...
              </span>
            )}
            <button
              onClick={() => toggleThemeMode()}
              aria-label={themeMode === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              style={{ color: C.textFaint }}
            >
              {themeMode === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button onClick={() => loadData()} aria-label="Actualizar" disabled={refreshing} style={{ color: C.textFaint }}>
              <RefreshCw size={19} className={refreshing ? "animate-spin" : ""} />
            </button>
            <button onClick={() => setCalculatorOpen(true)} aria-label="Calculadora" style={{ color: C.textFaint }}>
              <CalculatorIcon size={20} />
            </button>
            <button onClick={() => setTab("cotizaciones")} aria-label="Cotizaciones" style={{ color: tab === "cotizaciones" ? C.usd : C.textFaint }}>
              <Coins size={20} />
            </button>
            {has("notas", "view") && (
              <button onClick={() => setTab("notas")} aria-label="Notas" style={{ color: tab === "notas" ? C.usd : C.textFaint }}>
                <StickyNote size={20} />
              </button>
            )}
            {has("personas", "view") && (
              <button onClick={() => setTab("personas")} aria-label="Personas" style={{ color: tab === "personas" ? C.usd : C.textFaint }}>
                <Users size={20} />
              </button>
            )}
            {has("hipoteca", "view") && (
              <button onClick={() => setTab("hipoteca")} aria-label="Hipoteca" style={{ color: tab === "hipoteca" ? C.usd : C.textFaint }}>
                <Building2 size={20} />
              </button>
            )}
            {has("configuracion", "view") && (
              <button onClick={() => setTab("configuracion")} aria-label="Configuración" style={{ color: tab === "configuracion" ? C.usd : C.textFaint }}>
                <SettingsIcon size={20} />
              </button>
            )}
          </div>
        </div>

        {saveError && (
          <div className="rounded-lg p-3 mb-3 text-xs" style={{ background: "rgba(217,119,106,0.15)", color: C.negative }}>
            {saveError}
          </div>
        )}

        {!has(tab, "view") ? (
          <div className="rounded-xl p-6 text-center text-sm" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textMuted }}>
            No tenés acceso a esta sección. Pedile a un administrador que te dé permiso desde Configuración.
          </div>
        ) : (
          <>
            {tab === "inicio" && <Dashboard data={data} />}
            {tab === "movimientos" && (
              <Transactions
                transactions={data.transactions}
                transfers={data.transfers}
                cardPayments={data.cardPayments}
                installments={data.installments}
                cards={data.cards}
                accounts={data.accounts}
                banks={data.banks}
                users={data.users}
                canEdit={has("movimientos", "edit")}
                onEdit={(t) => setModal({ type: "movement", payload: { transaction: t } })}
                onDelete={confirmDeleteTransaction}
                onEditTransfer={(t) => setModal({ type: "movement", payload: { transfer: t } })}
                onDeleteTransfer={confirmDeleteTransfer}
                onEditCardPayment={(p) => setModal({ type: "cardPayment", payload: { cardId: p.cardId, payment: p } })}
                onDeleteCardPayment={confirmDeleteCardPayment}
                onEditInstallment={(i) => setModal({ type: "movement", payload: { installment: i } })}
                onDeleteInstallment={confirmDeleteInstallment}
              />
            )}
            {tab === "cuentas" && (
              <Accounts
                banks={data.banks}
                accounts={data.accounts}
                transactions={data.transactions}
                transfers={data.transfers}
                cardPayments={data.cardPayments}
                contacts={data.contacts}
                contactEntries={data.contactEntries}
                cards={data.cards}
                canEdit={has("cuentas", "edit")}
                canEditMovements={has("movimientos", "edit")}
                sortOrders={data.sortOrders}
                onReorderBanks={(order) => setData((d) => (d ? { ...d, sortOrders: { ...d.sortOrders, banks: order } } : d))}
                onReorderAccountsByBank={(order) => setData((d) => (d ? { ...d, sortOrders: { ...d.sortOrders, accountsByBank: order } } : d))}
                onReorderAccountsByCurrency={(order) => setData((d) => (d ? { ...d, sortOrders: { ...d.sortOrders, accountsByCurrency: order } } : d))}
                accountStatements={data.accountStatements}
                onSaveAccountStatement={saveAccountStatement}
                onAddBank={() => setModal({ type: "bank" })}
                onEditBank={(b) => setModal({ type: "bank", payload: b })}
                onDeleteBank={confirmDeleteBank}
                onAddAccount={(bankId) => setModal({ type: "account", payload: { bankId } })}
                onEditAccount={(a) => setModal({ type: "account", payload: { bankId: a.bankId, account: a } })}
                onDeleteAccount={confirmDeleteAccount}
                onEditTransaction={(t) => setModal({ type: "movement", payload: { transaction: t } })}
                onDeleteTransaction={confirmDeleteTransaction}
                onEditTransfer={(t) => setModal({ type: "movement", payload: { transfer: t } })}
                onDeleteTransfer={confirmDeleteTransfer}
                onEditCardPayment={(p) => setModal({ type: "cardPayment", payload: { cardId: p.cardId, payment: p } })}
                onDeleteCardPayment={confirmDeleteCardPayment}
              />
            )}
            {tab === "tarjetas" && (
              <Cards
                data={data}
                canEdit={has("tarjetas", "edit")}
                canEditMovements={has("movimientos", "edit")}
                onAddCard={() => setModal({ type: "card" })}
                onEditCard={(c) => setModal({ type: "card", payload: c })}
                onDeleteCard={confirmDeleteCard}
                onEditInstallment={(i) => setModal({ type: "movement", payload: { installment: i } })}
                onDeleteInstallment={confirmDeleteInstallment}
                onAddCardPayment={(cardId) => setModal({ type: "cardPayment", payload: { cardId } })}
                onEditCardPayment={(p) => setModal({ type: "cardPayment", payload: { cardId: p.cardId, payment: p } })}
                onDeleteCardPayment={confirmDeleteCardPayment}
                onAddCardExpense={(cardId) => setModal({ type: "movement", payload: { presetCardId: cardId } })}
                onEditTransaction={(t) => setModal({ type: "movement", payload: { transaction: t } })}
                onDeleteTransaction={confirmDeleteTransaction}
                onSaveCardStatement={saveCardStatement}
              />
            )}
            {tab === "presupuestos" && (
              <Budgets
                budgets={data.budgets}
                transactions={data.transactions}
                canEdit={has("presupuestos", "edit")}
                onAdd={() => setModal({ type: "budget" })}
                onEdit={(b) => setModal({ type: "budget", payload: b })}
                onDelete={confirmDeleteBudget}
              />
            )}
            {tab === "proyeccion" && <Projection data={data} />}
            {tab === "cotizaciones" && <ExchangeRates />}
            {tab === "notas" && (
              <Notes
                notes={data.notes}
                users={data.users}
                activeUserId={data.activeUserId}
                canEdit={has("notas", "edit")}
                onAdd={() => setModal({ type: "note" })}
                onEdit={(n) => setModal({ type: "note", payload: n })}
                onDelete={confirmDeleteNote}
              />
            )}
            {tab === "personas" && (
              <Contacts
                contacts={data.contacts}
                contactEntries={data.contactEntries}
                accounts={data.accounts}
                banks={data.banks}
                canEdit={has("personas", "edit")}
                onAddContact={() => setModal({ type: "contact" })}
                onEditContact={(c) => setModal({ type: "contact", payload: c })}
                onDeleteContact={confirmDeleteContact}
                onAddEntry={(contactId) => setModal({ type: "contactEntry", payload: { contactId } })}
                onEditEntry={(e) => setModal({ type: "contactEntry", payload: { contactId: e.contactId, entry: e } })}
                onDeleteEntry={confirmDeleteContactEntry}
                onSplitExpense={() => setModal({ type: "splitExpense" })}
              />
            )}
            {tab === "hipoteca" && (
              <Mortgage
                loans={data.mortgageLoans}
                canEdit={has("hipoteca", "edit")}
                onAddLoan={() => setModal({ type: "mortgageLoan" })}
                onEditLoan={(loan) => setModal({ type: "mortgageLoan", payload: loan })}
                onDeleteLoan={confirmDeleteMortgageLoan}
                onAddPrepayment={(loanId) => setModal({ type: "mortgagePrepayment", payload: { loanId } })}
                onDeletePrepayment={confirmDeleteMortgagePrepayment}
              />
            )}
            {tab === "configuracion" && (
              <Settings
                users={data.users}
                activeUserId={data.activeUserId}
                categories={data.categories}
                transactions={data.transactions}
                transfers={data.transfers}
                cardPayments={data.cardPayments}
                contactEntries={data.contactEntries}
                installments={data.installments}
                budgets={data.budgets}
                activeUser={activeUser}
                banks={data.banks}
                accounts={data.accounts}
                canEdit={has("configuracion", "edit")}
                canSwitchUser={!lockedToNonAdmin}
                onSetActiveUser={setActiveUser}
                onAddUser={() => setModal({ type: "user" })}
                onEditUser={(u) => setModal({ type: "user", payload: u })}
                onDeleteUser={confirmDeleteUser}
                onAddCategory={() => setModal({ type: "category" })}
                onDeleteCategory={confirmDeleteCategory}
                onMoveCategory={moveCategory}
                onReclassifyCategory={reclassifyCategory}
                onUpdateUserLock={updateActiveUserLock}
                onUpdateBank={updateBankFields}
                onUpdateAccount={updateAccountFields}
              />
            )}
          </>
        )}
      </div>

      {showFab && (
        <button
          onClick={() => setModal({ type: "movement", payload: {} })}
          aria-label="Nuevo movimiento"
          className="fixed bottom-20 right-5 rounded-full flex items-center justify-center shadow-lg"
          style={{ background: C.usd, width: 52, height: 52, color: "#0A1413" }}
        >
          <Plus size={24} />
        </button>
      )}

      <nav className="fixed bottom-0 left-0 right-0 flex justify-center" style={{ background: C.surface, borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-md w-full flex">
          {visibleTabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="flex-1 flex flex-col items-center gap-1 py-2"
              style={{ color: tab === id ? C.usd : C.textFaint }}
              aria-current={tab === id ? "page" : undefined}
            >
              <Icon size={18} />
              <span className="text-[9px] font-medium">{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {modal?.type === "movement" && (
        <MovementModal
          initial={modal.payload?.transaction}
          initialTransfer={modal.payload?.transfer}
          initialInstallment={modal.payload?.installment}
          presetCardId={modal.payload?.presetCardId}
          accounts={data.accounts}
          banks={data.banks}
          cards={data.cards}
          categories={data.categories}
          onSaveTransaction={upsertTransaction}
          onSaveTransfer={upsertTransfer}
          onSaveInstallment={upsertInstallment}
          onSaveCategory={saveCategory}
          onClose={closeModal}
        />
      )}
      {modal?.type === "card" && <CardModal initial={modal.payload} onSave={upsertCard} onClose={closeModal} />}
      {modal?.type === "budget" && <BudgetModal categories={data.categories} initial={modal.payload} onSave={saveBudget} onClose={closeModal} />}
      {modal?.type === "bank" && <BankModal initial={modal.payload} onSave={upsertBank} onClose={closeModal} />}
      {modal?.type === "account" && (
        <AccountModal bankId={modal.payload.bankId} banks={data.banks} initial={modal.payload.account} accounts={data.accounts} onSave={upsertAccount} onClose={closeModal} />
      )}
      {modal?.type === "cardPayment" && (
        <CardPaymentModal
          cardId={modal.payload.cardId}
          initial={modal.payload.payment}
          cards={data.cards}
          accounts={data.accounts}
          banks={data.banks}
          installments={data.installments}
          onSave={upsertCardPayment}
          onClose={closeModal}
        />
      )}
      {modal?.type === "category" && <CategoryModal categories={data.categories} onSave={addCategory} onClose={closeModal} />}
      {modal?.type === "user" && <UserModal initial={modal.payload} onSave={upsertUser} onClose={closeModal} />}
      {modal?.type === "note" && (
        <NoteModal initial={modal.payload} activeUserId={data.activeUserId} onSave={upsertNote} onClose={closeModal} />
      )}
      {modal?.type === "contact" && (
        <ContactModal initial={modal.payload} contacts={data.contacts} onSave={upsertContact} onClose={closeModal} />
      )}
      {modal?.type === "contactEntry" && (
        <ContactEntryModal
          contactId={modal.payload.contactId}
          initial={modal.payload.entry}
          contacts={data.contacts}
          accounts={data.accounts}
          banks={data.banks}
          onSave={upsertContactEntry}
          onClose={closeModal}
        />
      )}
      {modal?.type === "splitExpense" && (
        <SplitExpenseModal
          contacts={data.contacts}
          accounts={data.accounts}
          banks={data.banks}
          categories={data.categories}
          onSave={saveSplitExpense}
          onClose={closeModal}
        />
      )}
      {modal?.type === "mortgageLoan" && (
        <LoanModal initial={modal.payload} onSave={upsertMortgageLoan} onClose={closeModal} />
      )}
      {modal?.type === "mortgagePrepayment" && (
        <PrepaymentModal
          loanId={modal.payload.loanId}
          loan={data.mortgageLoans.find((l) => l.id === modal.payload.loanId)!}
          initial={modal.payload.prepayment}
          onSave={upsertMortgagePrepayment}
          onClose={closeModal}
        />
      )}

      {calculatorOpen && <CalculatorModal onClose={() => setCalculatorOpen(false)} />}

      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          onConfirm={() => { confirm.onConfirm(); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
    </PullToRefresh>
  );
}
