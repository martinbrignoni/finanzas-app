import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Modal, Field, PrimaryButton, IconBtn } from "../../components/ui";
import { formatDateTimeDMY } from "../../lib/dates";
import type { Note, AppUser } from "../../types";

/**
 * Notas de texto libre por perfil, visibles para todos los perfiles que
 * comparten la app (no hay noción de "privado"): sirve para dejarse
 * mensajes/recordatorios entre quienes usan la cuenta.
 */
export function Notes({
  notes,
  users,
  activeUserId,
  canEdit,
  onAdd,
  onEdit,
  onDelete,
}: {
  notes: Note[];
  users: AppUser[];
  activeUserId: string | null;
  canEdit: boolean;
  onAdd: () => void;
  onEdit: (n: Note) => void;
  onDelete: (id: string) => void;
}) {
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? "Usuario eliminado";
  const sorted = [...notes].sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));

  return (
    <div className="pb-24">
      <h1 className="text-2xl mb-4 font-display" style={{ color: C.text }}>Notas</h1>

      {sorted.length === 0 && (
        <div className="rounded-xl p-6 text-center text-sm mb-4" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textMuted }}>
          Todavía no hay notas. Son visibles para todos los perfiles que usan la app.
        </div>
      )}

      <div className="space-y-2 mb-4">
        {sorted.map((n) => (
          <div key={n.id} className="rounded-xl p-3" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold" style={{ color: n.userId === activeUserId ? C.usd : C.textMuted }}>
                {userName(n.userId)}
              </span>
              <span className="text-[10px]" style={{ color: C.textFaint }}>
                {formatDateTimeDMY(n.updatedAt ?? n.createdAt)}{n.updatedAt ? " (editada)" : ""}
              </span>
            </div>
            <p className="text-sm whitespace-pre-wrap mb-2" style={{ color: C.text }}>{n.text}</p>
            {canEdit && (
              <div className="flex justify-end gap-1">
                <IconBtn label="Editar nota" onClick={() => onEdit(n)}><Pencil size={13} /></IconBtn>
                <IconBtn label="Eliminar nota" danger onClick={() => onDelete(n.id)}><Trash2 size={13} /></IconBtn>
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
          <Plus size={16} /> Nueva nota
        </button>
      )}
    </div>
  );
}

export function NoteModal({
  initial,
  activeUserId,
  onSave,
  onClose,
}: {
  initial?: Note;
  activeUserId: string | null;
  onSave: (n: Note) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initial?.text ?? "");
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    const trimmed = text.trim();
    if (!trimmed) return setError("Escribí algo antes de guardar.");
    const now = new Date().toISOString();
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      userId: initial?.userId ?? activeUserId ?? "",
      text: trimmed,
      createdAt: initial?.createdAt ?? now,
      updatedAt: initial ? now : undefined,
    });
  };

  return (
    <Modal title={initial ? "Editar nota" : "Nueva nota"} onClose={onClose}>
      <Field label="Nota">
        {(id) => (
          <textarea
            id={id}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            autoFocus
            placeholder="Escribí tu nota..."
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text, resize: "vertical" }}
          />
        )}
      </Field>
      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>
    </Modal>
  );
}
