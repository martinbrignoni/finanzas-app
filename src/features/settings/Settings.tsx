import { useState } from "react";
import { theme as C } from "../../styles/theme";
import { Segment } from "../../components/ui";
import { CategoriesSettings } from "./Categories";
import { UsersSettings } from "./Users";
import type { AppUser, Category, Transaction, Budget } from "../../types";

export function Settings({
  users,
  activeUserId,
  categories,
  transactions,
  budgets,
  canEdit,
  onSetActiveUser,
  onAddUser,
  onEditUser,
  onDeleteUser,
  onAddCategory,
  onDeleteCategory,
}: {
  users: AppUser[];
  activeUserId: string | null;
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  canEdit: boolean;
  onSetActiveUser: (id: string) => void;
  onAddUser: () => void;
  onEditUser: (u: AppUser) => void;
  onDeleteUser: (id: string) => void;
  onAddCategory: () => void;
  onDeleteCategory: (id: string) => void;
}) {
  const [section, setSection] = useState<"usuarios" | "categorias">("usuarios");

  return (
    <div className="pb-24">
      <h1 className="text-2xl mb-4 font-display" style={{ color: C.text }}>Configuración</h1>

      <div className="mb-4">
        <Segment
          value={section}
          onChange={setSection}
          options={[{ value: "usuarios", label: "Usuarios y permisos" }, { value: "categorias", label: "Categorías" }]}
        />
      </div>

      {section === "usuarios" ? (
        <UsersSettings
          users={users}
          activeUserId={activeUserId}
          canEdit={canEdit}
          onSetActive={onSetActiveUser}
          onAdd={onAddUser}
          onEdit={onEditUser}
          onDelete={onDeleteUser}
        />
      ) : (
        <CategoriesSettings
          categories={categories}
          transactions={transactions}
          budgets={budgets}
          canEdit={canEdit}
          onAdd={onAddCategory}
          onDelete={onDeleteCategory}
        />
      )}
    </div>
  );
}
