import { useState } from "react";
import { theme as C } from "../../styles/theme";
import { Segment } from "../../components/ui";
import { CategoriesSettings } from "./Categories";
import { UsersSettings } from "./Users";
import { SecuritySettings } from "./Security";
import type { AppUser, Category, Transaction, Installment, Budget, AppLock } from "../../types";

export function Settings({
  users,
  activeUserId,
  categories,
  transactions,
  installments,
  budgets,
  appLock,
  canEdit,
  onSetActiveUser,
  onAddUser,
  onEditUser,
  onDeleteUser,
  onAddCategory,
  onDeleteCategory,
  onMoveCategory,
  onReclassifyCategory,
  onUpdateAppLock,
}: {
  users: AppUser[];
  activeUserId: string | null;
  categories: Category[];
  transactions: Transaction[];
  installments: Installment[];
  budgets: Budget[];
  appLock: AppLock;
  canEdit: boolean;
  onSetActiveUser: (id: string) => void;
  onAddUser: () => void;
  onEditUser: (u: AppUser) => void;
  onDeleteUser: (id: string) => void;
  onAddCategory: () => void;
  onDeleteCategory: (id: string) => void;
  onMoveCategory: (id: string, newParentId: string) => void;
  onReclassifyCategory: (fromName: string, toName: string) => void;
  onUpdateAppLock: (partial: Partial<AppLock>) => void;
}) {
  const [section, setSection] = useState<"usuarios" | "categorias" | "seguridad">("usuarios");

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
            { value: "seguridad", label: "Seguridad" },
          ]}
        />
      </div>

      {section === "usuarios" && (
        <UsersSettings
          users={users}
          activeUserId={activeUserId}
          canEdit={canEdit}
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
      {section === "seguridad" && <SecuritySettings appLock={appLock} canEdit={canEdit} onUpdateAppLock={onUpdateAppLock} />}
    </div>
  );
}
