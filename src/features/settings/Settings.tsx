import { useState } from "react";
import { LogOut } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { CategoriesSettings } from "./Categories";
import { UsersSettings } from "./Users";
import { SecuritySettings } from "./Security";
import { NotificationsSettings } from "./Notifications";
import { BanksSettings } from "./Banks";
import { RecurringRulesSettings } from "./Recurring";
import { AuditSettings } from "./Audit";
import { CardsSettings } from "./CardsSettings";
import { FamilyMembersSettings } from "./FamilyMembers";
import { BackupSettings } from "./Backup";
import type { AppUser, Category, Transaction, Transfer, CardPayment, ContactEntry, Installment, Budget, AppLock, Bank, Account, Card, Contact, NotificationPrefs, RecurringRule, AuditEntry, FamilyMember, FinanceData } from "../../types";

export function Settings({
  financeData,
  users,
  activeUserId,
  categories,
  transactions,
  transfers,
  cardPayments,
  contactEntries,
  contacts,
  installments,
  budgets,
  activeUser,
  banks,
  accounts,
  cards,
  recurringRules,
  auditLog,
  familyMembers,
  canEdit,
  canSwitchUser = true,
  onSetActiveUser,
  onAddUser,
  onEditUser,
  onDeleteUser,
  onAddCategory,
  onDeleteCategory,
  onMoveCategory,
  onRenameCategory,
  onSetCategoryAllowFamilyMembers,
  onReclassifyCategory,
  onAddFamilyMember,
  onEditFamilyMember,
  onDeleteFamilyMember,
  onUpdateUserLock,
  onUpdateUserNotifications,
  onAddBank,
  onAddAccount,
  onUpdateBank,
  onUpdateAccount,
  onAddCard,
  onEditCard,
  onDeleteCard,
  onAddRecurringRule,
  onEditRecurringRule,
  onToggleRecurringActive,
  onDeleteRecurringRule,
  onSignOut,
}: {
  /** El `FinanceData` completo, solo para la sección Respaldo (ver `BackupSettings`). */
  financeData: FinanceData;
  users: AppUser[];
  activeUserId: string | null;
  categories: Category[];
  transactions: Transaction[];
  transfers: Transfer[];
  cardPayments: CardPayment[];
  contactEntries: ContactEntry[];
  contacts: Contact[];
  installments: Installment[];
  budgets: Budget[];
  /** Perfil actualmente activo: la sección Seguridad edita el bloqueo de este perfil, no el de otros. */
  activeUser: AppUser | null;
  banks: Bank[];
  accounts: Account[];
  cards: Card[];
  recurringRules: RecurringRule[];
  /** Historial de alta/modificación/baja, ver sección Auditoría. */
  auditLog: AuditEntry[];
  familyMembers: FamilyMember[];
  canEdit: boolean;
  canSwitchUser?: boolean;
  onSetActiveUser: (id: string) => void;
  onAddUser: () => void;
  onEditUser: (u: AppUser) => void;
  onDeleteUser: (id: string) => void;
  onAddCategory: () => void;
  onDeleteCategory: (id: string) => void;
  onMoveCategory: (id: string, newParentId: string) => void;
  onRenameCategory: (id: string, newName: string) => void;
  /** Activa/desactiva si una categoría permite elegir integrante de familia. */
  onSetCategoryAllowFamilyMembers: (id: string, allow: boolean) => void;
  onReclassifyCategory: (fromName: string, toName: string) => void;
  onAddFamilyMember: () => void;
  onEditFamilyMember: (m: FamilyMember) => void;
  onDeleteFamilyMember: (id: string) => void;
  onUpdateUserLock: (partial: Partial<AppLock>) => void;
  onUpdateUserNotifications: (partial: Partial<NotificationPrefs>) => void;
  onAddBank: () => void;
  onAddAccount: (bankId: string) => void;
  onUpdateBank: (id: string, partial: Partial<Bank>) => void;
  onUpdateAccount: (id: string, partial: Partial<Account>) => void;
  onAddCard: () => void;
  onEditCard: (c: Card) => void;
  onDeleteCard: (id: string) => void;
  onAddRecurringRule: () => void;
  onEditRecurringRule: (r: RecurringRule) => void;
  onToggleRecurringActive: (r: RecurringRule) => void;
  onDeleteRecurringRule: (id: string) => void;
  onSignOut: () => void;
}) {
  const [section, setSection] = useState<"usuarios" | "categorias" | "familia" | "bancos" | "tarjetas" | "recurrentes" | "auditoria" | "respaldo" | "seguridad" | "notificaciones">("usuarios");

  return (
    <div className="pb-24">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-display" style={{ color: C.text }}>Configuración</h1>
        <button
          onClick={onSignOut}
          aria-label="Cerrar sesión"
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.negative }}
        >
          <LogOut size={16} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {(
          [
            ["usuarios", "Usuarios"],
            ["categorias", "Categorías"],
            ["familia", "Familia"],
            ["bancos", "Bancos"],
            ["tarjetas", "Tarjetas"],
            ["recurrentes", "Recurrentes"],
            ["auditoria", "Auditoría"],
            ["respaldo", "Respaldo"],
            ["seguridad", "Seguridad"],
            ["notificaciones", "Notificaciones"],
          ] as [typeof section, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setSection(value)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors"
            style={{
              background: section === value ? C.surface3 : C.surface2,
              border: `1px solid ${C.border}`,
              color: section === value ? C.text : C.textMuted,
            }}
          >
            {label}
          </button>
        ))}
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
          onRename={onRenameCategory}
          onSetAllowFamilyMembers={onSetCategoryAllowFamilyMembers}
          onReclassify={onReclassifyCategory}
        />
      )}
      {section === "familia" && (
        <FamilyMembersSettings
          familyMembers={familyMembers}
          canEdit={canEdit}
          onAdd={onAddFamilyMember}
          onEdit={onEditFamilyMember}
          onDelete={onDeleteFamilyMember}
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
          onAddBank={onAddBank}
          onAddAccount={onAddAccount}
          onUpdateBank={onUpdateBank}
          onUpdateAccount={onUpdateAccount}
        />
      )}
      {section === "tarjetas" && (
        <CardsSettings
          cards={cards}
          banks={banks}
          canEdit={canEdit}
          onAdd={onAddCard}
          onEdit={onEditCard}
          onDelete={onDeleteCard}
        />
      )}
      {section === "recurrentes" && (
        <RecurringRulesSettings
          rules={recurringRules}
          accounts={accounts}
          banks={banks}
          cards={cards}
          contacts={contacts}
          users={users}
          canEdit={canEdit}
          onAdd={onAddRecurringRule}
          onEdit={onEditRecurringRule}
          onToggleActive={onToggleRecurringActive}
          onDelete={onDeleteRecurringRule}
        />
      )}
      {section === "auditoria" && <AuditSettings auditLog={auditLog} users={users} />}
      {section === "respaldo" && <BackupSettings data={financeData} />}
      {section === "seguridad" && activeUser && (
        <SecuritySettings user={activeUser} onUpdateUserLock={onUpdateUserLock} />
      )}
      {section === "notificaciones" && activeUser && (
        <NotificationsSettings user={activeUser} onUpdateUserNotifications={onUpdateUserNotifications} />
      )}
    </div>
  );
}
