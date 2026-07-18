import { useEffect, useState, useCallback, useMemo } from "react";
import { Home, List, CreditCard, PieChart as PieIcon, TrendingUp, Plus, Landmark, Settings as SettingsIcon, ChevronDown } from "lucide-react";
import { theme as C } from "./styles/theme";
import { getRepository } from "./lib/storage";
import { canView as checkView, canEdit as checkEdit } from "./lib/permissions";
import type {
  FinanceData, Transaction, Card, Installment, Budget, Bank, Account,
  Category, AppUser, PermissionKey,
} from "./types";
import { Dashboard } from "./features/dashboard/Dashboard";
import { Transactions, TransactionModal } from "./features/transactions/Transactions";
import { Cards, CardModal, InstallmentModal } from "./features/cards/Cards";
import { Budgets, BudgetModal } from "./features/budgets/Budgets";
import { Projection } from "./features/projection/Projection";
import { Accounts, BankModal, AccountModal } from "./features/accounts/Accounts";
import { Settings } from "./features/settings/Settings";
import { CategoryModal } from "./features/settings/Categories";
import { UserModal } from "./features/settings/Users";

type TabId = "inicio" | "movimientos" | "cuentas" | "tarjetas" | "presupuestos" | "proyeccion" | "configuracion";

const TABS: { id: TabId; label: string; Icon: typeof Home }[] = [
  { id: "inicio", label: "Inicio", Icon: Home },
  { id: "movimientos", label: "Movim.", Icon: List },
  { id: "cuentas", label: "Cuentas", Icon: Landmark },
  { id: "tarjetas", label: "Tarjetas", Icon: CreditCard },
  { id: "presupuestos", label: "Presup.", Icon: PieIcon },
  { id: "proyeccion", label: "Proyecc.", Icon: TrendingUp },
];

type ModalState =
  | { type: "transaction"; payload?: Transaction }
  | { type: "card"; payload?: Card }
  | { type: "installment"; payload: { cardId: string } }
  | { type: "budget" }
  | { type: "bank"; payload?: Bank }
  | { type: "account"; payload: { bankId: string; account?: Account } }
  | { type: "category" }
  | { type: "user"; payload?: AppUser }
  | null;

const repo = getRepository();

export default function App() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [tab, setTab] = useState<TabId>("inicio");
  const [modal, setModal] = useState<ModalState>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    repo.load().then(setData);
  }, []);

  useEffect(() => {
    if (!data) return;
    repo.save(data).catch(() => setSaveError("No se pudieron guardar los cambios. Revisá el espacio disponible del navegador."));
  }, [data]);

  const closeModal = () => setModal(null);

  const activeUser = useMemo(() => {
    if (!data) return null;
    return data.users.find((u) => u.id === data.activeUserId) ?? null;
  }, [data]);
  const has = useCallback((key: PermissionKey, mode: "view" | "edit") => (mode === "view" ? checkView(activeUser, key) : checkEdit(activeUser, key)), [activeUser]);

  // --- transactions ---
  const upsertTransaction = useCallback((t: Transaction) => {
    setData((d) => {
      if (!d) return d;
      const idx = d.transactions.findIndex((x) => x.id === t.id);
      const transactions = idx >= 0 ? d.transactions.map((x) => (x.id === t.id ? t : x)) : [...d.transactions, t];
      return { ...d, transactions };
    });
    closeModal();
  }, []);
  const deleteTransaction = useCallback((id: string) => {
    setData((d) => (d ? { ...d, transactions: d.transactions.filter((x) => x.id !== id) } : d));
  }, []);

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
    setData((d) => (d ? { ...d, cards: d.cards.filter((x) => x.id !== id), installments: d.installments.filter((i) => i.cardId !== id) } : d));
  }, []);
  const addInstallment = useCallback((inst: Installment) => {
    setData((d) => (d ? { ...d, installments: [...d.installments, inst] } : d));
    closeModal();
  }, []);
  const deleteInstallment = useCallback((id: string) => {
    setData((d) => (d ? { ...d, installments: d.installments.filter((x) => x.id !== id) } : d));
  }, []);

  // --- budgets ---
  const addBudget = useCallback((b: Budget) => {
    setData((d) => (d ? { ...d, budgets: [...d.budgets, b] } : d));
    closeModal();
  }, []);
  const deleteBudget = useCallback((id: string) => {
    setData((d) => (d ? { ...d, budgets: d.budgets.filter((x) => x.id !== id) } : d));
  }, []);

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
      d ? { ...d, accounts: d.accounts.filter((x) => x.id !== id), transactions: d.transactions.map((t) => (t.accountId === id ? { ...t, accountId: undefined } : t)) } : d
    );
  }, []);

  // --- categories ---
  const addCategory = useCallback((c: Category) => {
    setData((d) => (d ? { ...d, categories: [...d.categories, c] } : d));
    closeModal();
  }, []);
  const deleteCategory = useCallback((id: string) => {
    setData((d) => (d ? { ...d, categories: d.categories.filter((x) => x.id !== id) } : d));
  }, []);

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
  const setActiveUser = useCallback((id: string) => {
    setData((d) => (d ? { ...d, activeUserId: id } : d));
    setUserMenuOpen(false);
  }, []);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg, color: C.textMuted }}>
        Cargando...
      </div>
    );
  }

  const visibleTabs = TABS.filter((t) => has(t.id, "view"));
  const showFab = (tab === "inicio" || tab === "movimientos") && has("movimientos", "edit");

  return (
    <div className="min-h-screen" style={{ background: C.bg }}>
      <div className="max-w-md mx-auto px-4 pt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full"
              style={{ background: C.surface2, color: C.textMuted }}
            >
              {activeUser?.name ?? "Sin perfil"} <ChevronDown size={12} />
            </button>
            {userMenuOpen && (
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
          {has("configuracion", "view") && (
            <button onClick={() => setTab("configuracion")} aria-label="Configuración" style={{ color: tab === "configuracion" ? C.usd : C.textFaint }}>
              <SettingsIcon size={20} />
            </button>
          )}
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
            {tab === "inicio" && <Dashboard data={data} canAddTransaction={has("movimientos", "edit")} onAdd={() => setModal({ type: "transaction" })} />}
            {tab === "movimientos" && (
              <Transactions
                transactions={data.transactions}
                accounts={data.accounts}
                canEdit={has("movimientos", "edit")}
                onEdit={(t) => setModal({ type: "transaction", payload: t })}
                onDelete={deleteTransaction}
              />
            )}
            {tab === "cuentas" && (
              <Accounts
                banks={data.banks}
                accounts={data.accounts}
                transactions={data.transactions}
                canEdit={has("cuentas", "edit")}
                onAddBank={() => setModal({ type: "bank" })}
                onEditBank={(b) => setModal({ type: "bank", payload: b })}
                onDeleteBank={deleteBank}
                onAddAccount={(bankId) => setModal({ type: "account", payload: { bankId } })}
                onEditAccount={(a) => setModal({ type: "account", payload: { bankId: a.bankId, account: a } })}
                onDeleteAccount={deleteAccount}
              />
            )}
            {tab === "tarjetas" && (
              <Cards
                data={data}
                canEdit={has("tarjetas", "edit")}
                onAddCard={() => setModal({ type: "card" })}
                onEditCard={(c) => setModal({ type: "card", payload: c })}
                onDeleteCard={deleteCard}
                onAddInstallment={(cardId) => setModal({ type: "installment", payload: { cardId } })}
                onDeleteInstallment={deleteInstallment}
              />
            )}
            {tab === "presupuestos" && (
              <Budgets
                budgets={data.budgets}
                transactions={data.transactions}
                canEdit={has("presupuestos", "edit")}
                onAdd={() => setModal({ type: "budget" })}
                onDelete={deleteBudget}
              />
            )}
            {tab === "proyeccion" && <Projection data={data} />}
            {tab === "configuracion" && (
              <Settings
                users={data.users}
                activeUserId={data.activeUserId}
                categories={data.categories}
                transactions={data.transactions}
                budgets={data.budgets}
                canEdit={has("configuracion", "edit")}
                onSetActiveUser={setActiveUser}
                onAddUser={() => setModal({ type: "user" })}
                onEditUser={(u) => setModal({ type: "user", payload: u })}
                onDeleteUser={deleteUser}
                onAddCategory={() => setModal({ type: "category" })}
                onDeleteCategory={deleteCategory}
              />
            )}
          </>
        )}
      </div>

      {showFab && (
        <button
          onClick={() => setModal({ type: "transaction" })}
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

      {modal?.type === "transaction" && (
        <TransactionModal initial={modal.payload} accounts={data.accounts} categories={data.categories} onSave={upsertTransaction} onClose={closeModal} />
      )}
      {modal?.type === "card" && <CardModal initial={modal.payload} onSave={upsertCard} onClose={closeModal} />}
      {modal?.type === "installment" && <InstallmentModal cardId={modal.payload.cardId} onSave={addInstallment} onClose={closeModal} />}
      {modal?.type === "budget" && <BudgetModal categories={data.categories} onSave={addBudget} onClose={closeModal} />}
      {modal?.type === "bank" && <BankModal initial={modal.payload} onSave={upsertBank} onClose={closeModal} />}
      {modal?.type === "account" && (
        <AccountModal bankId={modal.payload.bankId} initial={modal.payload.account} onSave={upsertAccount} onClose={closeModal} />
      )}
      {modal?.type === "category" && <CategoryModal onSave={addCategory} onClose={closeModal} />}
      {modal?.type === "user" && <UserModal initial={modal.payload} onSave={upsertUser} onClose={closeModal} />}
    </div>
  );
}
