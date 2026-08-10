import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Modal, Field, TextInput, PrimaryButton, IconBtn } from "../../components/ui";
import type { Vehicle } from "../../types";

/**
 * Vehículos (ej. "Auto Martín", "Moto") que se le pueden asignar a un gasto,
 * en las categorías que lo requieran (ver los toggles "¿Requiere vehículo?" y
 * "¿Registra combustible?" en Categorías, ej. Transporte y Combustible).
 */
export function VehiclesSettings({
  vehicles,
  canEdit,
  onAdd,
  onEdit,
  onDelete,
}: {
  vehicles: Vehicle[];
  canEdit: boolean;
  onAdd: () => void;
  onEdit: (v: Vehicle) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs" style={{ color: C.textMuted }}>
          Para poder elegir a qué vehículo corresponde un gasto, en las categorías que lo requieran (ej. Transporte, Combustible; ver Categorías).
        </p>
        {canEdit && (
          <button
            onClick={onAdd}
            aria-label="Nuevo vehículo"
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 ml-2"
            style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text }}
          >
            <Plus size={18} />
          </button>
        )}
      </div>

      {vehicles.length === 0 && (
        <div className="rounded-xl p-6 text-center text-sm" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textMuted }}>
          Todavía no cargaste vehículos.
        </div>
      )}

      <div className="space-y-2">
        {vehicles.map((v) => (
          <div key={v.id} className="rounded-xl p-3 flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <span className="text-sm" style={{ color: C.text }}>{v.name}</span>
            {canEdit && (
              <div className="flex gap-1">
                <IconBtn label={`Editar ${v.name}`} onClick={() => onEdit(v)}><Pencil size={14} /></IconBtn>
                <IconBtn label={`Eliminar ${v.name}`} danger onClick={() => onDelete(v.id)}><Trash2 size={14} /></IconBtn>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function VehicleModal({
  initial,
  vehicles,
  onSave,
  onClose,
}: {
  initial?: Vehicle;
  vehicles: Vehicle[];
  onSave: (v: Vehicle) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return setError("Ingresá un nombre.");
    const dup = vehicles.some((v) => v.id !== initial?.id && v.name.toLowerCase() === trimmed.toLowerCase());
    if (dup) return setError("Ya existe un vehículo con ese nombre.");
    onSave({ id: initial?.id ?? crypto.randomUUID(), name: trimmed });
  };

  return (
    <Modal title={initial ? "Editar vehículo" : "Nuevo vehículo"} onClose={onClose}>
      <Field label="Nombre">
        {(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="ej. Auto, Moto, Camioneta trabajo..." autoFocus />}
      </Field>
      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>
    </Modal>
  );
}
