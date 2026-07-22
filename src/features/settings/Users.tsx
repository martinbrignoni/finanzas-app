import { useState } from "react";
import { Plus, Trash2, Pencil, Check } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Modal, Field, TextInput, PrimaryButton, IconBtn } from "../../components/ui";
import { PERMISSION_MODULES, fullPermissions, type AppUser, type PermissionSet, type PermissionKey } from "../../types";

export function UsersSettings({
  users,
  activeUserId,
  canEdit,
  canSwitch = true,
  onSetActive,
  onAdd,
  onEdit,
  onDelete,
}: {
  users: AppUser[];
  activeUserId: string | null;
  canEdit: boolean;
  /** false cuando este login está atado a un perfil fijo (usuario no superadmin con authEmail propio). */
  canSwitch?: boolean;
  onSetActive: (id: string) => void;
  onAdd: () => void;
  onEdit: (u: AppUser) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      <div className="rounded-lg p-3 mb-4 text-xs" style={{ background: C.surface2, color: C.textMuted }}>
        Esto organiza qué ve y qué puede tocar cada persona en este navegador. No es una contraseña: no protege
        datos de alguien con acceso al navegador, solo evita errores por descuido.
      </div>

      <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.textFaint }}>Perfil activo</h3>
      {canSwitch ? (
        <div className="rounded-xl overflow-hidden mb-4" style={{ border: `1px solid ${C.border}` }}>
          {users.map((u, i) => (
            <button
              key={u.id}
              onClick={() => onSetActive(u.id)}
              className="w-full p-3 flex items-center justify-between text-sm text-left"
              style={{ background: C.surface, borderTop: i ? `1px solid ${C.border}` : "none" }}
            >
              <span style={{ color: C.text }}>{u.name}</span>
              {activeUserId === u.id && <Check size={16} color={C.usd} />}
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-xl p-3 mb-4 text-sm" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text }}>
          {users.find((u) => u.id === activeUserId)?.name ?? "Sin perfil"}
          <span className="block text-xs mt-0.5" style={{ color: C.textFaint }}>
            Tu login está fijado a este perfil.
          </span>
        </div>
      )}

      <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.textFaint }}>Usuarios y permisos</h3>
      <div className="space-y-2 mb-4">
        {users.map((u) => (
          <div key={u.id} className="rounded-xl p-3" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium" style={{ color: C.text }}>{u.name}</span>
              {canEdit && (
                <div className="flex gap-1">
                  <IconBtn label={`Editar permisos de ${u.name}`} onClick={() => onEdit(u)}><Pencil size={14} /></IconBtn>
                  {users.length > 1 && (
                    <IconBtn label={`Eliminar ${u.name}`} danger onClick={() => onDelete(u.id)}><Trash2 size={14} /></IconBtn>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {PERMISSION_MODULES.filter((m) => u.permissions[m.key]?.view).map((m) => (
                <span key={m.key} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: C.surface2, color: u.permissions[m.key].edit ? C.usd : C.textMuted }}>
                  {m.label}{u.permissions[m.key].edit ? "" : " (solo ver)"}
                </span>
              ))}
              {PERMISSION_MODULES.every((m) => !u.permissions[m.key]?.view) && (
                <span className="text-[10px]" style={{ color: C.textFaint }}>Sin acceso a ningún módulo</span>
              )}
            </div>
            {(u.authEmail || u.isAdmin) && (
              <div className="flex flex-wrap gap-1.5">
                {u.authEmail && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: C.surface2, color: C.textMuted }}>
                    Login: {u.authEmail}
                  </span>
                )}
                {u.isAdmin && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: C.surface2, color: C.usd }}>
                    Superusuario
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {canEdit && (
        <button
          onClick={onAdd}
          className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
          style={{ background: C.surface2, border: `1px dashed ${C.borderLight}`, color: C.textMuted }}
        >
          <Plus size={16} /> Nuevo usuario
        </button>
      )}
    </div>
  );
}

export function UserModal({ initial, onSave, onClose }: { initial?: AppUser; onSave: (u: AppUser) => void; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [permissions, setPermissions] = useState<PermissionSet>(initial?.permissions ?? fullPermissions(false));
  const [authEmail, setAuthEmail] = useState(initial?.authEmail ?? "");
  const [isAdmin, setIsAdmin] = useState(initial?.isAdmin ?? false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (key: PermissionKey, field: "view" | "edit") => {
    setPermissions((p) => {
      const current = p[key];
      if (field === "view") {
        // si se saca "ver", también se saca "editar" (editar implica ver)
        const view = !current.view;
        return { ...p, [key]: { view, edit: view ? current.edit : false } };
      }
      const edit = !current.edit;
      return { ...p, [key]: { view: edit ? true : current.view, edit } };
    });
  };

  const handleSave = () => {
    if (!name.trim()) return setError("Ingresá un nombre.");
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      permissions,
      authEmail: authEmail.trim() || undefined,
      isAdmin: isAdmin || undefined,
    });
  };

  return (
    <Modal title={initial ? "Editar usuario" : "Nuevo usuario"} onClose={onClose}>
      <Field label="Nombre">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la persona" />}</Field>

      <Field label="Email de login (opcional)">
        {(id) => (
          <TextInput
            id={id}
            type="email"
            value={authEmail}
            onChange={(e) => setAuthEmail(e.target.value)}
            placeholder="ej. lucia@gmail.com"
          />
        )}
      </Field>
      <p className="text-xs mb-3" style={{ color: C.textFaint }}>
        Si esta persona tiene su propio login de Supabase (no el tuyo), poné acá ese email exactamente igual. Al
        entrar con ese usuario, la app la va a fijar automáticamente en este perfil.
      </p>

      <label className="flex items-center gap-2 mb-3 text-sm" style={{ color: C.text }}>
        <input type="checkbox" checked={isAdmin} onChange={() => setIsAdmin((v) => !v)} />
        Superusuario (puede ver y cambiar entre todos los perfiles)
      </label>

      <span className="block text-xs mb-1.5" style={{ color: C.textMuted }}>Permisos por módulo</span>
      <div className="rounded-lg overflow-hidden mb-3" style={{ border: `1px solid ${C.border}` }}>
        <div className="grid grid-cols-[1fr_60px_60px] text-[11px] px-3 py-2" style={{ background: C.surface2, color: C.textFaint }}>
          <span>Módulo</span><span className="text-center">Ver</span><span className="text-center">Editar</span>
        </div>
        {PERMISSION_MODULES.map((m, i) => (
          <div key={m.key} className="grid grid-cols-[1fr_60px_60px] items-center px-3 py-2 text-sm" style={{ background: C.surface, borderTop: i ? `1px solid ${C.border}` : "none" }}>
            <span style={{ color: C.text }}>{m.label}</span>
            <label className="flex justify-center">
              <input type="checkbox" checked={permissions[m.key].view} onChange={() => toggle(m.key, "view")} />
            </label>
            <label className="flex justify-center">
              <input type="checkbox" checked={permissions[m.key].edit} onChange={() => toggle(m.key, "edit")} disabled={!permissions[m.key].view} />
            </label>
          </div>
        ))}
      </div>

      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>
    </Modal>
  );
}
