import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Modal, Field, TextInput, PrimaryButton, IconBtn } from "../../components/ui";
import type { FamilyMember } from "../../types";

/**
 * Integrantes de la familia (vos, tu pareja, tus hijas...) que se pueden
 * asignar a un gasto o ingreso puntual, en las categorías que lo permitan
 * (ver el toggle "¿Permite elegir integrante de familia?" en Categorías).
 */
export function FamilyMembersSettings({
  familyMembers,
  canEdit,
  onAdd,
  onEdit,
  onDelete,
}: {
  familyMembers: FamilyMember[];
  canEdit: boolean;
  onAdd: () => void;
  onEdit: (m: FamilyMember) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs" style={{ color: C.textMuted }}>
          Para poder elegir a quién de la familia corresponde un gasto o ingreso, en las categorías que lo permitan (ver Categorías).
        </p>
        {canEdit && (
          <button
            onClick={onAdd}
            aria-label="Nuevo integrante"
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 ml-2"
            style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text }}
          >
            <Plus size={18} />
          </button>
        )}
      </div>

      {familyMembers.length === 0 && (
        <div className="rounded-xl p-6 text-center text-sm" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textMuted }}>
          Todavía no cargaste integrantes de la familia.
        </div>
      )}

      <div className="space-y-2">
        {familyMembers.map((m) => (
          <div key={m.id} className="rounded-xl p-3 flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <span className="text-sm" style={{ color: C.text }}>{m.name}</span>
            {canEdit && (
              <div className="flex gap-1">
                <IconBtn label={`Editar ${m.name}`} onClick={() => onEdit(m)}><Pencil size={14} /></IconBtn>
                <IconBtn label={`Eliminar ${m.name}`} danger onClick={() => onDelete(m.id)}><Trash2 size={14} /></IconBtn>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function FamilyMemberModal({
  initial,
  familyMembers,
  onSave,
  onClose,
}: {
  initial?: FamilyMember;
  familyMembers: FamilyMember[];
  onSave: (m: FamilyMember) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return setError("Ingresá un nombre.");
    const dup = familyMembers.some((m) => m.id !== initial?.id && m.name.toLowerCase() === trimmed.toLowerCase());
    if (dup) return setError("Ya existe un integrante con ese nombre.");
    onSave({ id: initial?.id ?? crypto.randomUUID(), name: trimmed });
  };

  return (
    <Modal title={initial ? "Editar integrante" : "Nuevo integrante"} onClose={onClose}>
      <Field label="Nombre">
        {(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="ej. Luli, Clementina, Emilia..." autoFocus />}
      </Field>
      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>
    </Modal>
  );
}
