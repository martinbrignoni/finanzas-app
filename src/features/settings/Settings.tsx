import { useState } from "react";
import { LogOut } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Segment } from "../../components/ui";
import { CategoriesSettings } from "./Categories";
import { UsersSettings } from "./Users";
import { SecuritySettings } from "./Security";
import { NotificationsSettings } from "./Notifications";
import { BanksSettings } from "./Banks";
import { RecurringRulesSettings } from "./Recurring";
import type { AppUser, Category, Transaction, Transfer, CardPayment, ContactEntry, Installment, Budget, AppLock, Bank, Account, Card, NotificationPrefs, RecurringRule } from "../../types";

export function Settings({
  users,
  activeUserId,
  categories,
  transactions,
  transfers,
  cardPayments,
  contactEntries,
  installments,
  budgets,
  activeUser,
  banks,
  accounts,
  cards,
  recurringRules,
  canEdit,
  canSwitchUser = true,
  onSetActiveUser,
  onAddUser,
  onEditUser,
  onDeleteUser,
  onAddCategory,
  onDeleteCategory,
  onMoveCategory,
  onReclassifyCategory,
  onUpdateUserLock,
  onUpdateUserNotifications,
  onUpdateBank,
  onUpdateAccount,
  onAddRecurringRule,
  onEditRecurringRule,
  onToggleRecurringActive,
  onDeleteRecurringRule,
  onSignOut,
}: {
  users: AppUser[];
  activeUserId: string | null;
  categories: Category[];
  transactions: Transaction[];
  transfers: Transfer[];
  cardPayments: CardPayment[];
  contactEntries: ContactEntry[];
  installments: Installment[];
  budgets: Budget[];
  /** Perfil actualmente activo: la sección Seguridad edita el bloqueo de este perfil, no el de otros. */
  activeUser: AppUser | null;
  banks: Bank[];
  accounts: Account[];
  cards: Card[];
  recurringRules: RecurringRule[];
  canEdit: boolean;
  canSwitchUser?: boolean;
  onSetActiveUser: (id: string) => void;
  onAddUser: () => void;
  onEditUser: (u: AppUser) => void;
  onDeleteUser: (id: string) => void;
  onAddCategory: () => void;
  onDeleteCategory: (id: string) => void;
  onMoveCategory: (id: string, newParentId: string) => void;
  onReclassifyCategory: (fromName: string, toName: string) => void;
  onUpdateUserLock: (partial: Partial<AppLock>) => void;
  onUpdateUserNotifications: (partial: Partial<NotificationPrefs>) => void;
  onUpdateBank: (id: string, partial: Partial<Bank>) => void;
  onUpdateAccount: (id: string, partial: Partial<Account>) => void;
  onAddRecurringRule: () => void;
  onEditRecurringRule: (r: RecurringRule) => void;
  onToggleRecurringActive: (r: RecurringRule) => void;
  onDeleteRecurringRule: (id: string) => void;
  onSignOut: () => void;
}) {
  const [section, setSection] = useState<"usuarios" | "categorias" | "bancos" | "recurrentes" | "seguridad" | "notificaciones">("usuarios");

  return (
    <div className="pb-24">
      <h1 className="text-2xl mb-4 font-display" style={{ color: C.text }}>Configuración</h1>

      <div className="mb-4">
        <Segment
          value={section}
          onChange={setSection}
          options={[
            { value: "usuarios", label: "Usuarios y permisos" },
            { value: "categorias", label: "Categorías" },
            { value: "bancos", label: "Cajas y Bancos" },
            { value: "recurrentes", label: "Recurrentes" },
            { value: "seguridad", label: "Seguridad" },
            { value: "notificaciones", label: "Notificaciones" },
          ]}
        />
      </div>

      {section === "usuarios" && (
        <UsersSettings
          users={users}
          activeUserId={activeUserId}
          canEdit={canEdit}
          canSwitch={canSwitchUser}
          onSetActive={onSetActiveUser}
          onAdd={onAddUser}
          onEdit={onEditUser}
          onDelete={onDeleteUser}
        />
      )}
      {section === "categorias" && (
        <CategoriesSettings
          categories={categories}
          transactions={transactions}
          installments={installments}
          budgets={budgets}
          canEdit={canEdit}
          onAdd={onAddCategory}
          onDelete={onDeleteCategory}
          onMove={onMoveCategory}
          onReclassify={onReclassifyCategory}
        />
      )}
      {section === "bancos" && (
        <BanksSettings
          banks={banks}
          accounts={accounts}
          transactions={transactions}
          transfers={transfers}
          cardPayments={cardPayments}
          contactEntries={contactEntries}
          canEdit={canEdit}
          onUpdateBank={onUpdateBank}
          onUpdateAccount={onUpdateAccount}
        />
      )}
      {section === "recurrentes" && (
        <RecurringRulesSettings
          rules={recurringRules}
          accounts={accounts}
          banks={banks}
          cards={cards}
          canEdit={canEdit}
          onAdd={onAddRecurringRule}
          onEdit={onEditRecurringRule}
          onToggleActive={onToggleRecurringActive}
          onDelete={onDeleteRecurringRule}
        />
      )}
      {section === "seguridad" && activeUser && (
        <SecuritySettings user={activeUser} onUpdateUserLock={onUpdateUserLock} />
      )}
      {section === "notificaciones" && activeUser && (
        <NotificationsSettings user={activeUser} onUpdateUserNotifications={onUpdateUserNotifications} />
      )}

      <div className="mt-8 pt-4" style={{ borderTop: `1px solid ${C.border}` }}>
        <button
          onClick={onSignOut}
          className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
          style={{ background: C.surface2, color: C.negative }}
        >
          <LogOut size={15} /> Cerrar sesión
        </button>
      </div>
    </div>
  );
}
