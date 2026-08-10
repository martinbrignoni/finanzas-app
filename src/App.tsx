import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Home, List, CreditCard, PieChart as PieIcon, TrendingUp, Plus, Landmark, Settings as SettingsIcon, ChevronDown, Calculator as CalculatorIcon, Coins, RefreshCw, StickyNote, Users, Sun, Moon, Building2 } from "lucide-react";
import { theme as C, useThemeMode, toggleThemeMode } from "./styles/theme";
import { ConfirmDialog } from "./components/ui";
import { CalculatorModal } from "./components/Calculator";
import { PullToRefresh } from "./components/PullToRefresh";
import { getRepository } from "./lib/storage";
import { supabase } from "./lib/supabaseClient";
import { describeChangesByCategory, notifyOtherDevices } from "./lib/notifyChange";
import { canView as checkView, canEdit as checkEdit } from "./lib/permissions";
import { generateDueRecurringTransactions } from "./lib/recurring";
import { generateDueMortgagePayments } from "./lib/mortgage";
import { maybeRunAutomaticBackup } from "./lib/backup";
import { useUsageTracking } from "./lib/usage";
import { categoryRenamePaths, remapCategoryPath } from "./lib/categories";
import type { AccountLedgerEntry } from "./lib/accounts";
import {
  makeCreateEntry,
  makeUpdateEntry,
  makeDeleteEntry,
  transactionAuditSummary,
  transactionChanges,
  transferAuditSummary,
  transferChanges,
  cardPaymentAuditSummary,
  cardPaymentChanges,
  installmentAuditSummary,
  installmentChanges,
  contactEntryAuditSummary,
  contactEntryChanges,
} from "./lib/audit";
import type {
  FinanceData, Transaction, Card, Installment, Budget, Bank, Account,
  Category, AppUser, PermissionKey, Transfer, CardPayment, Note, AppLock, AccountStatement, CardStatement,
  Contact, ContactEntry, MortgageLoan, MortgagePrepayment, NotificationPrefs, RecurringRule, FamilyMember, Vehicle, MovementTimingKind,
} from "./types";
import { Dashboard } from "./features/dashboard/Dashboard";
import { Transactions, MovementModal } from "./features/transactions/Transactions";
import { Cards, CardModal, CardPaymentModal } from "./features/cards/Cards";
import { Budgets, BudgetModal } from "./features/budgets/Budgets";
import { Projection } from "./features/projection/Projection";
import { Accounts, BankModal, AccountModal } from "./features/accounts/Accounts";
import { ExchangeRates } from "./features/exchangeRates/ExchangeRates";
import { Notes, NoteModal } from "./features/notes/Notes";
import { Contacts, ContactModal, ContactEntryModal, SplitExpenseModal, ConvertCurrencyModal, type SplitOwnExpense } from "./features/contacts/Contacts";
import { Mortgage, LoanModal, PrepaymentModal } from "./features/mortgage/Mortgage";
import { LockScreen } from "./features/security/LockScreen";
import { Settings } from "./features/settings/Settings";
import { CategoryModal } from "./features/settings/Categories";
import { UserModal } from "./features/settings/Users";
import { RecurringRuleModal } from "./features/settings/Recurring";
import { FamilyMemberModal } from "./features/settings/FamilyMembers";
import { VehicleModal } from "./features/settings/Vehicles";

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
  | { type: "movement"; payload?: { transaction?: Transaction; transfer?: Transfer; installment?: Installment; contactEntry?: ContactEntry; presetCardId?: string } }
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
  | { type: "convertCurrency"; payload: { contactId: string } }
  | { type: "mortgageLoan"; payload?: MortgageLoan }
  | { type: "mortgagePrepayment"; payload: { loanId: string; prepayment?: MortgagePrepayment } }
  | { type: "recurringRule"; payload?: RecurringRule }
  | { type: "familyMember"; payload?: FamilyMember }
  | { type: "vehicle"; payload?: Vehicle }
  | null;

const repo = getRepository();

export default function App() {
  // Suscribe a la app entera a los cambios de modo claro/oscuro: al llamarlo
  // acá (cerca de la raíz), cualquier cambio de modo re-renderiza todo el
  // árbol y cada componente vuelve a leer los colores actualizados de `C`.
  const themeMode = useThemeMode();
  const [data, setData] = useState<FinanceData | null>(null);
  // Registra tiempo en la app por perfil (ver Configuración → Estadísticas).
  // Usa este mismo `setData`, así que se guarda junto con todo lo demás sin
  // agregar una infraestructura de guardado aparte.
  useUsageTracking(data, setData);
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
  // Última versión de `data` que ya pasó por este efecto, para poder
  // comparar contra la nueva y detectar qué cambió (y avisarle a otros
  // dispositivos). `skipNotify` se prende justo antes de un `loadData()`
  // (traer datos del servidor no es "editar": no hay que avisarle a nadie
  // de un cambio que en realidad hizo otra persona en otro dispositivo).
  const prevDataRef = useRef<FinanceData | null>(null);
  const skipNotifyRef = useRef(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSessionEmail(data.user?.email ?? null));
  }, []);

  const loadData = useCallback(() => {
    setRefreshing(true);
    return repo
      .load()
      .then(async (loaded) => {
        skipNotifyRef.current = true;
        // Genera acá los movimientos recurrentes y las cuotas hipotecarias
        // vencidas (ver lib/recurring.ts y lib/mortgage.ts), como si fueran
        // parte de los datos que se acaban de traer: no dispara aviso a
        // otros dispositivos por esto (es "traer datos", no "editar"). La
        // parte de hipoteca es async (puede necesitar traer una cotización
        // de UI de Cotizaciones para convertir la cuota).
        const withRecurring = generateDueRecurringTransactions(loaded);
        const withMortgage = await generateDueMortgagePayments(withRecurring);
        setData(withMortgage);
        // Respaldo automático (ver lib/backup.ts): no bloquea la carga ni
        // hace falta esperarlo, corre en silencio y no rompe nada si falla.
        maybeRunAutomaticBackup(withMortgage).catch(() => {});
      })
      .finally(() => setRefreshing(false));
  }, []);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!data) return;

    const prev = prevDataRef.current;
    const skip = skipNotifyRef.current;
    skipNotifyRef.current = false;
    if (prev && !skip) {
      const actor = data.users.find((u) => u.id === data.activeUserId);
      if (actor) {
        const changes = describeChangesByCategory(prev, data);
        notifyOtherDevices(actor.id, actor.name, changes);
      }
    }
    prevDataRef.current = data;

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

  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void; title?: string; confirmLabel?: string } | null>(null);
  const requestConfirm = useCallback(
    (message: string, onConfirm: () => void, opts?: { title?: string; confirmLabel?: string }) =>
      setConfirm({ message, onConfirm, title: opts?.title, confirmLabel: opts?.confirmLabel }),
    []
  );
  // Para ediciones (no altas) de un registro existente: pide confirmación antes de aplicar el guardado.
  const confirmSave = useCallback(
    (isEdit: boolean, message: string, commit: () => void) => {
      if (isEdit) requestConfirm(message, commit, { title: "Guardar cambios", confirmLabel: "Guardar" });
      else commit();
    },
    [requestConfirm]
  );

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
    const commit = () => {
      setData((d) => {
        if (!d) return d;
        const idx = d.transactions.findIndex((x) => x.id === t.id);
        const now = new Date().toISOString();
        const withCreator = idx >= 0
          ? { ...t, createdAt: d.transactions[idx].createdAt ?? now, updatedAt: now }
          : { ...t, createdByUserId: t.createdByUserId ?? activeUser?.id, createdAt: now, updatedAt: now };
        const transactions = idx >= 0 ? d.transactions.map((x) => (x.id === t.id ? withCreator : x)) : [...d.transactions, withCreator];
        const summary = transactionAuditSummary(withCreator, d.categories);
        const auditEntry = idx >= 0
          ? makeUpdateEntry("transaction", t.id, activeUser?.id, summary, transactionChanges(d.transactions[idx], withCreator, d.categories, d.accounts, d.banks, d.cards))
          : makeCreateEntry("transaction", t.id, activeUser?.id, summary);
        return { ...d, transactions, auditLog: auditEntry ? [...d.auditLog, auditEntry] : d.auditLog };
      });
      closeModal();
    };
    const isEdit = data?.transactions.some((x) => x.id === t.id) ?? false;
    confirmSave(isEdit, "¿Guardar los cambios en este movimiento?", commit);
  }, [activeUser, data, confirmSave]);
  const deleteTransaction = useCallback((id: string) => {
    setData((d) => {
      if (!d) return d;
      const record = d.transactions.find((x) => x.id === id);
      const auditEntry = record ? makeDeleteEntry("transaction", id, activeUser?.id, transactionAuditSummary(record, d.categories)) : null;
      return { ...d, transactions: d.transactions.filter((x) => x.id !== id), auditLog: auditEntry ? [...d.auditLog, auditEntry] : d.auditLog };
    });
  }, [activeUser]);
  const confirmDeleteTransaction = useCallback(
    (id: string) => requestConfirm("¿Eliminar este movimiento? No se puede deshacer.", () => deleteTransaction(id)),
    [requestConfirm, deleteTransaction]
  );

  // --- cards & installments ---
  const upsertCard = useCallback((c: Card) => {
    const commit = () => {
      setData((d) => {
        if (!d) return d;
        const idx = d.cards.findIndex((x) => x.id === c.id);
        const cards = idx >= 0 ? d.cards.map((x) => (x.id === c.id ? c : x)) : [...d.cards, c];
        return { ...d, cards };
      });
      closeModal();
    };
    const isEdit = data?.cards.some((x) => x.id === c.id) ?? false;
    confirmSave(isEdit, "¿Guardar los cambios en esta tarjeta?", commit);
  }, [data, confirmSave]);
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
    const commit = () => {
      setData((d) => {
        if (!d) return d;
        const idx = d.installments.findIndex((x) => x.id === inst.id);
        const now = new Date().toISOString();
        const withCreator = idx >= 0
          ? { ...inst, createdAt: d.installments[idx].createdAt ?? now, updatedAt: now }
          : { ...inst, createdByUserId: inst.createdByUserId ?? activeUser?.id, createdAt: now, updatedAt: now };
        const installments = idx >= 0 ? d.installments.map((x) => (x.id === inst.id ? withCreator : x)) : [...d.installments, withCreator];
        const summary = installmentAuditSummary(withCreator, d.categories);
        const auditEntry = idx >= 0
          ? makeUpdateEntry("installment", inst.id, activeUser?.id, summary, installmentChanges(d.installments[idx], withCreator, d.categories, d.banks, d.cards))
          : makeCreateEntry("installment", inst.id, activeUser?.id, summary);
        return { ...d, installments, auditLog: auditEntry ? [...d.auditLog, auditEntry] : d.auditLog };
      });
      closeModal();
    };
    const isEdit = data?.installments.some((x) => x.id === inst.id) ?? false;
    confirmSave(isEdit, "¿Guardar los cambios en esta compra en cuotas?", commit);
  }, [activeUser, data, confirmSave]);
  const deleteInstallment = useCallback((id: string) => {
    setData((d) => {
      if (!d) return d;
      const record = d.installments.find((x) => x.id === id);
      const auditEntry = record ? makeDeleteEntry("installment", id, activeUser?.id, installmentAuditSummary(record, d.categories)) : null;
      return { ...d, installments: d.installments.filter((x) => x.id !== id), auditLog: auditEntry ? [...d.auditLog, auditEntry] : d.auditLog };
    });
  }, [activeUser]);
  const confirmDeleteInstallment = useCallback(
    (id: string) => requestConfirm("¿Eliminar esta compra en cuotas? No se puede deshacer.", () => deleteInstallment(id)),
    [requestConfirm, deleteInstallment]
  );
  // Ver `MovementTimingEntry` y Configuración → Estadísticas: se llama al
  // guardar con éxito un movimiento puntual (nunca al cancelar), con cuánto
  // tardó desde que se abrió el modal. No pasa por `confirmSave`/auditoría:
  // es solo un dato de estadísticas, no una entidad de negocio.
  const recordMovementTiming = useCallback((entry: { action: "create" | "edit"; kind: MovementTimingKind; entityId: string; seconds: number }) => {
    setData((d) => {
      if (!d) return d;
      const now = new Date();
      return {
        ...d,
        movementTimings: [
          ...d.movementTimings,
          {
            id: crypto.randomUUID(),
            userId: d.activeUserId ?? undefined,
            action: entry.action,
            kind: entry.kind,
            entityId: entry.entityId,
            seconds: entry.seconds,
            date: now.toISOString().slice(0, 10),
            at: now.toISOString(),
          },
        ],
      };
    });
  }, []);
  const upsertCardPayment = useCallback((p: CardPayment) => {
    const commit = () => {
      setData((d) => {
        if (!d) return d;
        const idx = d.cardPayments.findIndex((x) => x.id === p.id);
        const now = new Date().toISOString();
        const withCreator = idx >= 0
          ? { ...p, createdAt: d.cardPayments[idx].createdAt ?? now, updatedAt: now }
          : { ...p, createdByUserId: p.createdByUserId ?? activeUser?.id, createdAt: now, updatedAt: now };
        const cardPayments = idx >= 0 ? d.cardPayments.map((x) => (x.id === p.id ? withCreator : x)) : [...d.cardPayments, withCreator];
        const summary = cardPaymentAuditSummary(withCreator, d.banks, d.cards);
        const auditEntry = idx >= 0
          ? makeUpdateEntry("cardPayment", p.id, activeUser?.id, summary, cardPaymentChanges(d.cardPayments[idx], withCreator, d.accounts, d.banks, d.cards))
          : makeCreateEntry("cardPayment", p.id, activeUser?.id, summary);
        return { ...d, cardPayments, auditLog: auditEntry ? [...d.auditLog, auditEntry] : d.auditLog };
      });
      closeModal();
    };
    const isEdit = data?.cardPayments.some((x) => x.id === p.id) ?? false;
    confirmSave(isEdit, "¿Guardar los cambios en este pago de tarjeta?", commit);
  }, [activeUser, data, confirmSave]);
  const deleteCardPayment = useCallback((id: string) => {
    setData((d) => {
      if (!d) return d;
      const record = d.cardPayments.find((x) => x.id === id);
      const auditEntry = record ? makeDeleteEntry("cardPayment", id, activeUser?.id, cardPaymentAuditSummary(record, d.banks, d.cards)) : null;
      return { ...d, cardPayments: d.cardPayments.filter((x) => x.id !== id), auditLog: auditEntry ? [...d.auditLog, auditEntry] : d.auditLog };
    });
  }, [activeUser]);
  const confirmDeleteCardPayment = useCallback(
    (id: string) => requestConfirm("¿Eliminar este pago de tarjeta? El saldo de la cuenta se va a recalcular.", () => deleteCardPayment(id)),
    [requestConfirm, deleteCardPayment]
  );

  // --- budgets ---
  const saveBudget = useCallback((b: Budget) => {
    const commit = () => {
      setData((d) => {
        if (!d) return d;
        const idx = d.budgets.findIndex((x) => x.id === b.id);
        const budgets = idx >= 0 ? d.budgets.map((x) => (x.id === b.id ? b : x)) : [...d.budgets, b];
        return { ...d, budgets };
      });
      closeModal();
    };
    const isEdit = data?.budgets.some((x) => x.id === b.id) ?? false;
    confirmSave(isEdit, "¿Guardar los cambios en este presupuesto?", commit);
  }, [data, confirmSave]);
  const deleteBudget = useCallback((id: string) => {
    setData((d) => (d ? { ...d, budgets: d.budgets.filter((x) => x.id !== id) } : d));
  }, []);
  const confirmDeleteBudget = useCallback(
    (id: string) => requestConfirm("¿Eliminar este presupuesto?", () => deleteBudget(id)),
    [requestConfirm, deleteBudget]
  );

  // --- banks & accounts ---
  const upsertBank = useCallback((b: Bank) => {
    const commit = () => {
      setData((d) => {
        if (!d) return d;
        const idx = d.banks.findIndex((x) => x.id === b.id);
        const banks = idx >= 0 ? d.banks.map((x) => (x.id === b.id ? b : x)) : [...d.banks, b];
        return { ...d, banks };
      });
      closeModal();
    };
    const isEdit = data?.banks.some((x) => x.id === b.id) ?? false;
    confirmSave(isEdit, "¿Guardar los cambios en este banco?", commit);
  }, [data, confirmSave]);
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
    const commit = () => {
      setData((d) => {
        if (!d) return d;
        const idx = d.accounts.findIndex((x) => x.id === a.id);
        const accounts = idx >= 0 ? d.accounts.map((x) => (x.id === a.id ? a : x)) : [...d.accounts, a];
        return { ...d, accounts };
      });
      closeModal();
    };
    const isEdit = data?.accounts.some((x) => x.id === a.id) ?? false;
    confirmSave(isEdit, "¿Guardar los cambios en esta caja?", commit);
  }, [data, confirmSave]);
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
    const commit = () => {
      setData((d) => {
        if (!d) return d;
        const idx = d.transfers.findIndex((x) => x.id === tr.id);
        const now = new Date().toISOString();
        const withCreator = idx >= 0
          ? { ...tr, createdAt: d.transfers[idx].createdAt ?? now, updatedAt: now }
          : { ...tr, createdByUserId: tr.createdByUserId ?? activeUser?.id, createdAt: now, updatedAt: now };
        const transfers = idx >= 0 ? d.transfers.map((x) => (x.id === tr.id ? withCreator : x)) : [...d.transfers, withCreator];
        const summary = transferAuditSummary(withCreator, d.accounts, d.banks);
        const auditEntry = idx >= 0
          ? makeUpdateEntry("transfer", tr.id, activeUser?.id, summary, transferChanges(d.transfers[idx], withCreator, d.accounts, d.banks))
          : makeCreateEntry("transfer", tr.id, activeUser?.id, summary);
        return { ...d, transfers, auditLog: auditEntry ? [...d.auditLog, auditEntry] : d.auditLog };
      });
      closeModal();
    };
    const isEdit = data?.transfers.some((x) => x.id === tr.id) ?? false;
    confirmSave(isEdit, "¿Guardar los cambios en esta transferencia?", commit);
  }, [activeUser, data, confirmSave]);
  const deleteTransfer = useCallback((id: string) => {
    setData((d) => {
      if (!d) return d;
      const record = d.transfers.find((x) => x.id === id);
      const auditEntry = record ? makeDeleteEntry("transfer", id, activeUser?.id, transferAuditSummary(record, d.accounts, d.banks)) : null;
      return { ...d, transfers: d.transfers.filter((x) => x.id !== id), auditLog: auditEntry ? [...d.auditLog, auditEntry] : d.auditLog };
    });
  }, [activeUser]);
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
  const renameCategory = useCallback((id: string, newName: string) => {
    setData((d) => {
      if (!d) return d;
      const cat = d.categories.find((c) => c.id === id);
      const trimmed = newName.trim();
      if (!cat || !trimmed || trimmed === cat.name) return d;
      const { oldPath, newPath } = categoryRenamePaths(cat, d.categories, trimmed);
      return {
        ...d,
        categories: d.categories.map((c) => (c.id === id ? { ...c, name: trimmed } : c)),
        transactions: d.transactions.map((t) => (t.category ? { ...t, category: remapCategoryPath(t.category, oldPath, newPath) } : t)),
        installments: d.installments.map((i) => (i.category ? { ...i, category: remapCategoryPath(i.category, oldPath, newPath) } : i)),
        budgets: d.budgets.map((b) => ({ ...b, category: remapCategoryPath(b.category, oldPath, newPath) })),
      };
    });
  }, []);
  const setCategoryAllowFamilyMembers = useCallback((id: string, allow: boolean) => {
    setData((d) => (d ? { ...d, categories: d.categories.map((c) => (c.id === id ? { ...c, allowFamilyMembers: allow || undefined } : c)) } : d));
  }, []);
  const setCategoryTrackOrders = useCallback((id: string, track: boolean) => {
    setData((d) => (d ? { ...d, categories: d.categories.map((c) => (c.id === id ? { ...c, trackOrders: track || undefined } : c)) } : d));
  }, []);
  const setCategoryRequiresVehicle = useCallback((id: string, require: boolean) => {
    setData((d) => (d ? { ...d, categories: d.categories.map((c) => (c.id === id ? { ...c, requiresVehicle: require || undefined } : c)) } : d));
  }, []);
  const setCategoryTrackFuel = useCallback((id: string, track: boolean) => {
    setData((d) => (d ? { ...d, categories: d.categories.map((c) => (c.id === id ? { ...c, trackFuel: track || undefined } : c)) } : d));
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
  /** Marca un movimiento del ledger de una cuenta como conciliado (ver Cuentas -> Conciliar). Solo toca `reconciledAt` del registro real detrás del entry, no afecta nada más. */
  const markLedgerEntryReconciled = useCallback((entry: AccountLedgerEntry, reconciledAt: string | undefined) => {
    setData((d) => {
      if (!d) return d;
      if (entry.kind === "transaction" && entry.transaction) {
        const id = entry.transaction.id;
        return { ...d, transactions: d.transactions.map((t) => (t.id === id ? { ...t, reconciledAt } : t)) };
      }
      if ((entry.kind === "transfer-out" || entry.kind === "transfer-in") && entry.transfer) {
        const id = entry.transfer.id;
        return { ...d, transfers: d.transfers.map((tr) => (tr.id === id ? { ...tr, reconciledAt } : tr)) };
      }
      if (entry.kind === "card-payment" && entry.cardPayment) {
        const id = entry.cardPayment.id;
        return { ...d, cardPayments: d.cardPayments.map((p) => (p.id === id ? { ...p, reconciledAt } : p)) };
      }
      if (entry.kind === "contact-entry" && entry.contactEntry) {
        const id = entry.contactEntry.id;
        return { ...d, contactEntries: d.contactEntries.map((e) => (e.id === id ? { ...e, reconciledAt } : e)) };
      }
      return d;
    });
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
  /** Alta rápida de una persona/concepto desde dentro de otro modal (ej. "Nuevo movimiento"), sin cerrarlo. */
  const addContact = useCallback((c: Contact) => {
    setData((d) => (d ? { ...d, contacts: [...d.contacts, c] } : d));
  }, []);
  const upsertContact = useCallback((c: Contact) => {
    const commit = () => {
      setData((d) => {
        if (!d) return d;
        const idx = d.contacts.findIndex((x) => x.id === c.id);
        const contacts = idx >= 0 ? d.contacts.map((x) => (x.id === c.id ? c : x)) : [...d.contacts, c];
        return { ...d, contacts };
      });
      closeModal();
    };
    const isEdit = data?.contacts.some((x) => x.id === c.id) ?? false;
    confirmSave(isEdit, "¿Guardar los cambios en esta persona?", commit);
  }, [data, confirmSave]);
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
    const commit = () => {
      setData((d) => {
        if (!d) return d;
        const idx = d.contactEntries.findIndex((x) => x.id === e.id);
        const now = new Date().toISOString();
        const withCreator = idx >= 0
          ? { ...e, createdAt: d.contactEntries[idx].createdAt ?? now, updatedAt: now }
          : { ...e, createdByUserId: e.createdByUserId ?? activeUser?.id, createdAt: now, updatedAt: now };
        const contactEntries = idx >= 0 ? d.contactEntries.map((x) => (x.id === e.id ? withCreator : x)) : [...d.contactEntries, withCreator];
        const summary = contactEntryAuditSummary(withCreator, d.contacts);
        const auditEntry = idx >= 0
          ? makeUpdateEntry("contactEntry", e.id, activeUser?.id, summary, contactEntryChanges(d.contactEntries[idx], withCreator, d.contacts, d.accounts, d.banks, d.cards))
          : makeCreateEntry("contactEntry", e.id, activeUser?.id, summary);
        return { ...d, contactEntries, auditLog: auditEntry ? [...d.auditLog, auditEntry] : d.auditLog };
      });
      closeModal();
    };
    const isEdit = data?.contactEntries.some((x) => x.id === e.id) ?? false;
    confirmSave(isEdit, "¿Guardar los cambios en este movimiento?", commit);
  }, [data, confirmSave, activeUser]);
  const deleteContactEntry = useCallback((id: string) => {
    setData((d) => {
      if (!d) return d;
      const record = d.contactEntries.find((x) => x.id === id);
      const auditEntry = record ? makeDeleteEntry("contactEntry", id, activeUser?.id, contactEntryAuditSummary(record, d.contacts)) : null;
      return { ...d, contactEntries: d.contactEntries.filter((x) => x.id !== id), auditLog: auditEntry ? [...d.auditLog, auditEntry] : d.auditLog };
    });
  }, [activeUser]);
  const confirmDeleteContactEntry = useCallback(
    (id: string) => requestConfirm("¿Eliminar este movimiento? No se puede deshacer.", () => deleteContactEntry(id)),
    [requestConfirm, deleteContactEntry]
  );
  const saveSplitExpense = useCallback((entries: ContactEntry[], ownExpense?: SplitOwnExpense) => {
    setData((d) => {
      if (!d) return d;
      const now = new Date().toISOString();
      const stampedEntries = entries.map((e) => ({ ...e, createdByUserId: e.createdByUserId ?? activeUser?.id, createdAt: e.createdAt ?? now, updatedAt: now }));
      let auditLog = [
        ...d.auditLog,
        ...stampedEntries.map((e) => makeCreateEntry("contactEntry", e.id, activeUser?.id, contactEntryAuditSummary(e, d.contacts))),
      ];
      let transactions = d.transactions;
      if (ownExpense) {
        const newTransaction: Transaction = {
          id: crypto.randomUUID(),
          type: "gasto",
          amountMinor: ownExpense.amountMinor,
          currency: ownExpense.currency,
          category: ownExpense.category,
          date: ownExpense.date,
          note: ownExpense.note,
          accountId: ownExpense.accountId,
          createdByUserId: activeUser?.id,
          createdAt: now,
          updatedAt: now,
        };
        transactions = [...d.transactions, newTransaction];
        auditLog = [...auditLog, makeCreateEntry("transaction", newTransaction.id, activeUser?.id, transactionAuditSummary(newTransaction, d.categories))];
      }
      return { ...d, contactEntries: [...d.contactEntries, ...stampedEntries], transactions, auditLog };
    });
    closeModal();
  }, [activeUser]);

  // --- hipoteca ---
  const upsertMortgageLoan = useCallback((loan: MortgageLoan) => {
    const commit = () => {
      setData((d) => {
        if (!d) return d;
        const idx = d.mortgageLoans.findIndex((x) => x.id === loan.id);
        const mortgageLoans = idx >= 0 ? d.mortgageLoans.map((x) => (x.id === loan.id ? loan : x)) : [...d.mortgageLoans, loan];
        return { ...d, mortgageLoans };
      });
      closeModal();
    };
    const isEdit = data?.mortgageLoans.some((x) => x.id === loan.id) ?? false;
    confirmSave(isEdit, "¿Guardar los cambios en este préstamo?", commit);
  }, [data, confirmSave]);
  const deleteMortgageLoan = useCallback((id: string) => {
    setData((d) => (d ? { ...d, mortgageLoans: d.mortgageLoans.filter((x) => x.id !== id) } : d));
  }, []);
  const confirmDeleteMortgageLoan = useCallback(
    (id: string) => requestConfirm("¿Eliminar este préstamo? También se eliminan sus amortizaciones registradas. No se puede deshacer.", () => deleteMortgageLoan(id)),
    [requestConfirm, deleteMortgageLoan]
  );
  const upsertMortgagePrepayment = useCallback((loanId: string, prepayment: MortgagePrepayment) => {
    const commit = () => {
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
    };
    const isEdit = data?.mortgageLoans.find((x) => x.id === loanId)?.prepayments.some((x) => x.id === prepayment.id) ?? false;
    confirmSave(isEdit, "¿Guardar los cambios en esta amortización extraordinaria?", commit);
  }, [data, confirmSave]);
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

  // --- movimientos recurrentes ---
  const upsertRecurringRule = useCallback((r: RecurringRule) => {
    const commit = () => {
      setData((d) => {
        if (!d) return d;
        const idx = d.recurringRules.findIndex((x) => x.id === r.id);
        const now = new Date().toISOString();
        const withCreator = idx >= 0
          ? { ...r, createdAt: d.recurringRules[idx].createdAt ?? now, updatedAt: now }
          : { ...r, createdByUserId: r.createdByUserId ?? activeUser?.id, createdAt: now, updatedAt: now };
        const recurringRules = idx >= 0 ? d.recurringRules.map((x) => (x.id === r.id ? withCreator : x)) : [...d.recurringRules, withCreator];
        return { ...d, recurringRules };
      });
      closeModal();
    };
    const isEdit = data?.recurringRules.some((x) => x.id === r.id) ?? false;
    confirmSave(isEdit, "¿Guardar los cambios en este movimiento recurrente?", commit);
  }, [activeUser, data, confirmSave]);
  // Pausar/reactivar es una acción rápida (como activar/desactivar una caja en
  // Configuración → Bancos): no pide confirmación, a diferencia de editar
  // desde el modal completo.
  const toggleRecurringActive = useCallback((r: RecurringRule) => {
    setData((d) => {
      if (!d) return d;
      const now = new Date().toISOString();
      return {
        ...d,
        recurringRules: d.recurringRules.map((x) => (x.id === r.id ? { ...x, active: !x.active, updatedAt: now } : x)),
      };
    });
  }, []);
  const deleteRecurringRule = useCallback((id: string) => {
    setData((d) => (d ? { ...d, recurringRules: d.recurringRules.filter((x) => x.id !== id) } : d));
  }, []);
  const confirmDeleteRecurringRule = useCallback(
    (id: string) => requestConfirm("¿Eliminar este movimiento recurrente? Los movimientos ya generados en Movimientos no se borran.", () => deleteRecurringRule(id)),
    [requestConfirm, deleteRecurringRule]
  );

  // --- integrantes de familia ---
  const upsertFamilyMember = useCallback((m: FamilyMember) => {
    setData((d) => {
      if (!d) return d;
      const idx = d.familyMembers.findIndex((x) => x.id === m.id);
      const familyMembers = idx >= 0 ? d.familyMembers.map((x) => (x.id === m.id ? m : x)) : [...d.familyMembers, m];
      return { ...d, familyMembers };
    });
    closeModal();
  }, []);
  const deleteFamilyMember = useCallback((id: string) => {
    setData((d) =>
      d
        ? {
            ...d,
            familyMembers: d.familyMembers.filter((x) => x.id !== id),
            // Saca al integrante borrado de cualquier movimiento que ya lo tuviera asignado, para no dejar ids huérfanos.
            transactions: d.transactions.map((t) =>
              t.familyMemberIds?.includes(id) ? { ...t, familyMemberIds: t.familyMemberIds.filter((x) => x !== id) } : t
            ),
          }
        : d
    );
  }, []);
  const confirmDeleteFamilyMember = useCallback(
    (id: string) => requestConfirm("¿Eliminar este integrante? Se saca de los movimientos donde ya estaba asignado (esos movimientos no se borran).", () => deleteFamilyMember(id)),
    [requestConfirm, deleteFamilyMember]
  );

  // --- vehículos ---
  const upsertVehicle = useCallback((v: Vehicle) => {
    setData((d) => {
      if (!d) return d;
      const idx = d.vehicles.findIndex((x) => x.id === v.id);
      const vehicles = idx >= 0 ? d.vehicles.map((x) => (x.id === v.id ? v : x)) : [...d.vehicles, v];
      return { ...d, vehicles };
    });
    closeModal();
  }, []);
  const deleteVehicle = useCallback((id: string) => {
    setData((d) =>
      d
        ? {
            ...d,
            vehicles: d.vehicles.filter((x) => x.id !== id),
            // Saca el vehículo borrado de cualquier movimiento que ya lo tuviera asignado, para no dejar ids huérfanos.
            transactions: d.transactions.map((t) => (t.vehicleId === id ? { ...t, vehicleId: undefined } : t)),
          }
        : d
    );
  }, []);
  const confirmDeleteVehicle = useCallback(
    (id: string) => requestConfirm("¿Eliminar este vehículo? Se saca de los movimientos donde ya estaba asignado (esos movimientos no se borran).", () => deleteVehicle(id)),
    [requestConfirm, deleteVehicle]
  );

  // --- notes ---
  const upsertNote = useCallback((n: Note) => {
    const commit = () => {
      setData((d) => {
        if (!d) return d;
        const idx = d.notes.findIndex((x) => x.id === n.id);
        const notes = idx >= 0 ? d.notes.map((x) => (x.id === n.id ? n : x)) : [...d.notes, n];
        return { ...d, notes };
      });
      closeModal();
    };
    const isEdit = data?.notes.some((x) => x.id === n.id) ?? false;
    confirmSave(isEdit, "¿Guardar los cambios en esta nota?", commit);
  }, [data, confirmSave]);
  const deleteNote = useCallback((id: string) => {
    setData((d) => (d ? { ...d, notes: d.notes.filter((x) => x.id !== id) } : d));
  }, []);
  const confirmDeleteNote = useCallback(
    (id: string) => requestConfirm("¿Eliminar esta nota?", () => deleteNote(id)),
    [requestConfirm, deleteNote]
  );

  // --- users ---
  const upsertUser = useCallback((u: AppUser) => {
    const commit = () => {
      setData((d) => {
        if (!d) return d;
        const idx = d.users.findIndex((x) => x.id === u.id);
        const users = idx >= 0 ? d.users.map((x) => (x.id === u.id ? u : x)) : [...d.users, u];
        return { ...d, users };
      });
      closeModal();
    };
    const isEdit = data?.users.some((x) => x.id === u.id) ?? false;
    confirmSave(isEdit, "¿Guardar los cambios en este usuario?", commit);
  }, [data, confirmSave]);
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
  const handleSignOut = useCallback(
    () => requestConfirm("¿Seguro que querés cerrar sesión?", () => supabase.auth.signOut(), { title: "Cerrar sesión", confirmLabel: "Cerrar sesión" }),
    [requestConfirm]
  );
  // Actualiza la preferencia de notificaciones del perfil actualmente activo.
  const updateActiveUserNotifications = useCallback((partial: Partial<NotificationPrefs>) => {
    setData((d) => {
      if (!d || !d.activeUserId) return d;
      const users = d.users.map((u) =>
        u.id === d.activeUserId
          ? { ...u, notifications: { ...(u.notifications ?? { enabled: false, categories: {} }), ...partial } }
          : u
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
                contactEntries={data.contactEntries}
                contacts={data.contacts}
                cards={data.cards}
                accounts={data.accounts}
                banks={data.banks}
                categories={data.categories}
                familyMembers={data.familyMembers}
                vehicles={data.vehicles}
                auditLog={data.auditLog}
                users={data.users}
                activeUser={activeUser}
                canEdit={has("movimientos", "edit")}
                canEditContacts={has("personas", "edit")}
                onEdit={(t) => setModal({ type: "movement", payload: { transaction: t } })}
                onDelete={confirmDeleteTransaction}
                onEditTransfer={(t) => setModal({ type: "movement", payload: { transfer: t } })}
                onDeleteTransfer={confirmDeleteTransfer}
                onEditCardPayment={(p) => setModal({ type: "cardPayment", payload: { cardId: p.cardId, payment: p } })}
                onDeleteCardPayment={confirmDeleteCardPayment}
                onEditInstallment={(i) => setModal({ type: "movement", payload: { installment: i } })}
                onDeleteInstallment={confirmDeleteInstallment}
                onEditContactEntry={(e) => setModal({ type: "movement", payload: { contactEntry: e } })}
                onDeleteContactEntry={confirmDeleteContactEntry}
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
                activeUser={activeUser}
                sortOrders={data.sortOrders}
                onReorderBanks={(order) => setData((d) => (d ? { ...d, sortOrders: { ...d.sortOrders, banks: order } } : d))}
                onReorderAccountsByBank={(order) => setData((d) => (d ? { ...d, sortOrders: { ...d.sortOrders, accountsByBank: order } } : d))}
                onReorderAccountsByCurrency={(order) => setData((d) => (d ? { ...d, sortOrders: { ...d.sortOrders, accountsByCurrency: order } } : d))}
                onSetAccountsViewMode={(mode) =>
                  setData((d) => {
                    if (!d || !d.activeUserId) return d;
                    return { ...d, users: d.users.map((u) => (u.id === d.activeUserId ? { ...u, accountsViewMode: mode } : u)) };
                  })
                }
                accountStatements={data.accountStatements}
                onSaveAccountStatement={saveAccountStatement}
                onUpdateAccount={updateAccountFields}
                onEditTransaction={(t) => setModal({ type: "movement", payload: { transaction: t } })}
                onDeleteTransaction={confirmDeleteTransaction}
                onEditTransfer={(t) => setModal({ type: "movement", payload: { transfer: t } })}
                onDeleteTransfer={confirmDeleteTransfer}
                onEditCardPayment={(p) => setModal({ type: "cardPayment", payload: { cardId: p.cardId, payment: p } })}
                onDeleteCardPayment={confirmDeleteCardPayment}
                onMarkReconciled={markLedgerEntryReconciled}
              />
            )}
            {tab === "tarjetas" && (
              <Cards
                data={data}
                canEdit={has("tarjetas", "edit")}
                canEditMovements={has("movimientos", "edit")}
                onEditInstallment={(i) => setModal({ type: "movement", payload: { installment: i } })}
                onDeleteInstallment={confirmDeleteInstallment}
                onEditCardPayment={(p) => setModal({ type: "cardPayment", payload: { cardId: p.cardId, payment: p } })}
                onDeleteCardPayment={confirmDeleteCardPayment}
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
                cards={data.cards}
                users={data.users}
                canEdit={has("personas", "edit")}
                activeUser={activeUser}
                onAddContact={() => setModal({ type: "contact" })}
                onEditContact={(c) => setModal({ type: "contact", payload: c })}
                onDeleteContact={confirmDeleteContact}
                onAddEntry={(contactId) => setModal({ type: "contactEntry", payload: { contactId } })}
                onEditEntry={(e) => setModal({ type: "contactEntry", payload: { contactId: e.contactId, entry: e } })}
                onDeleteEntry={confirmDeleteContactEntry}
                onSplitExpense={() => setModal({ type: "splitExpense" })}
                onConvertCurrency={(contactId) => setModal({ type: "convertCurrency", payload: { contactId } })}
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
                financeData={data}
                users={data.users}
                activeUserId={data.activeUserId}
                categories={data.categories}
                transactions={data.transactions}
                transfers={data.transfers}
                cardPayments={data.cardPayments}
                contactEntries={data.contactEntries}
                contacts={data.contacts}
                installments={data.installments}
                budgets={data.budgets}
                activeUser={activeUser}
                banks={data.banks}
                accounts={data.accounts}
                cards={data.cards}
                recurringRules={data.recurringRules}
                auditLog={data.auditLog}
                familyMembers={data.familyMembers}
                vehicles={data.vehicles}
                canEdit={has("configuracion", "edit")}
                canSwitchUser={!lockedToNonAdmin}
                onSetActiveUser={setActiveUser}
                onAddUser={() => setModal({ type: "user" })}
                onEditUser={(u) => setModal({ type: "user", payload: u })}
                onDeleteUser={confirmDeleteUser}
                onAddCategory={() => setModal({ type: "category" })}
                onDeleteCategory={confirmDeleteCategory}
                onMoveCategory={moveCategory}
                onRenameCategory={renameCategory}
                onSetCategoryAllowFamilyMembers={setCategoryAllowFamilyMembers}
                onSetCategoryTrackOrders={setCategoryTrackOrders}
                onSetCategoryRequiresVehicle={setCategoryRequiresVehicle}
                onSetCategoryTrackFuel={setCategoryTrackFuel}
                onReclassifyCategory={reclassifyCategory}
                onAddFamilyMember={() => setModal({ type: "familyMember" })}
                onEditFamilyMember={(m) => setModal({ type: "familyMember", payload: m })}
                onDeleteFamilyMember={confirmDeleteFamilyMember}
                onAddVehicle={() => setModal({ type: "vehicle" })}
                onEditVehicle={(v) => setModal({ type: "vehicle", payload: v })}
                onDeleteVehicle={confirmDeleteVehicle}
                onUpdateUserLock={updateActiveUserLock}
                onUpdateUserNotifications={updateActiveUserNotifications}
                onAddBank={() => setModal({ type: "bank" })}
                onAddAccount={(bankId) => setModal({ type: "account", payload: { bankId } })}
                onUpdateBank={updateBankFields}
                onUpdateAccount={updateAccountFields}
                onEditBank={(b) => setModal({ type: "bank", payload: b })}
                onDeleteBank={confirmDeleteBank}
                onEditAccount={(a) => setModal({ type: "account", payload: { bankId: a.bankId, account: a } })}
                onDeleteAccount={confirmDeleteAccount}
                onAddCard={() => setModal({ type: "card" })}
                onEditCard={(c) => setModal({ type: "card", payload: c })}
                onDeleteCard={confirmDeleteCard}
                onAddRecurringRule={() => setModal({ type: "recurringRule" })}
                onEditRecurringRule={(r) => setModal({ type: "recurringRule", payload: r })}
                onToggleRecurringActive={toggleRecurringActive}
                onDeleteRecurringRule={confirmDeleteRecurringRule}
                onSignOut={handleSignOut}
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
          initialContactEntry={modal.payload?.contactEntry}
          presetCardId={modal.payload?.presetCardId}
          activeUser={activeUser}
          accounts={data.accounts}
          banks={data.banks}
          cards={data.cards}
          installments={data.installments}
          categories={data.categories}
          contacts={data.contacts}
          familyMembers={data.familyMembers}
          vehicles={data.vehicles}
          canEditContacts={has("personas", "edit")}
          canEditCards={has("tarjetas", "edit")}
          onSaveTransaction={upsertTransaction}
          onSaveTransfer={upsertTransfer}
          onSaveInstallment={upsertInstallment}
          onSaveContactEntry={upsertContactEntry}
          onSaveCardPayment={upsertCardPayment}
          onSaveContact={addContact}
          onSaveCategory={saveCategory}
          onRecordTiming={recordMovementTiming}
          onClose={closeModal}
        />
      )}
      {modal?.type === "card" && <CardModal initial={modal.payload} banks={data.banks} users={data.users} onSave={upsertCard} onClose={closeModal} />}
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
          onRecordTiming={recordMovementTiming}
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
      {modal?.type === "convertCurrency" && (
        <ConvertCurrencyModal
          contactId={modal.payload.contactId}
          contactName={data.contacts.find((c) => c.id === modal.payload.contactId)?.name ?? "Persona"}
          onSave={saveSplitExpense}
          onClose={closeModal}
        />
      )}
      {modal?.type === "mortgageLoan" && (
        <LoanModal initial={modal.payload} accounts={data.accounts} banks={data.banks} categories={data.categories} onSave={upsertMortgageLoan} onClose={closeModal} />
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
      {modal?.type === "recurringRule" && (
        <RecurringRuleModal
          initial={modal.payload}
          accounts={data.accounts}
          banks={data.banks}
          cards={data.cards}
          categories={data.categories}
          contacts={data.contacts}
          onSave={upsertRecurringRule}
          onSaveCategory={addCategory}
          onSaveContact={addContact}
          onClose={closeModal}
        />
      )}
      {modal?.type === "familyMember" && (
        <FamilyMemberModal
          initial={modal.payload}
          familyMembers={data.familyMembers}
          onSave={upsertFamilyMember}
          onClose={closeModal}
        />
      )}
      {modal?.type === "vehicle" && (
        <VehicleModal
          initial={modal.payload}
          vehicles={data.vehicles}
          onSave={upsertVehicle}
          onClose={closeModal}
        />
      )}

      {calculatorOpen && <CalculatorModal onClose={() => setCalculatorOpen(false)} />}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          onConfirm={() => { confirm.onConfirm(); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
    </PullToRefresh>
  );
}
