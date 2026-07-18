import { useState } from "react";
import { Camera, X, Paperclip, Loader2 } from "lucide-react";
import { theme as C } from "../styles/theme";
import { uploadReceipt, getReceiptUrl, deleteReceipt } from "../lib/receipts";

/**
 * Selector de foto de comprobante para un movimiento (gasto, ingreso,
 * transferencia o pago de tarjeta). Sube la imagen a Supabase Storage apenas
 * se elige (no espera al guardar el movimiento), y guarda en `path` solo la
 * ruta del archivo. `movementId` tiene que ser estable durante toda la vida
 * del modal (se genera una sola vez, aunque el movimiento sea nuevo).
 */
export function ReceiptField({
  movementId,
  path,
  onChange,
}: {
  movementId: string;
  path: string | undefined;
  onChange: (path: string | undefined) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const previous = path;
    try {
      const newPath = await uploadReceipt(file, movementId);
      onChange(newPath);
      if (previous && previous !== newPath) deleteReceipt(previous);
    } catch (err) {
      console.error(err);
      setError("No se pudo subir la foto. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  const handleView = async () => {
    if (!path) return;
    setError(null);
    try {
      const url = await getReceiptUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error(err);
      setError("No se pudo abrir el comprobante.");
    }
  };

  const handleRemove = () => {
    if (!path) return;
    const toDelete = path;
    onChange(undefined);
    deleteReceipt(toDelete);
  };

  return (
    <div className="mb-3">
      <span className="block text-xs mb-1" style={{ color: C.textMuted }}>Comprobante (opcional)</span>

      {path ? (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: C.surface2, border: `1px solid ${C.border}` }}>
          <button type="button" onClick={handleView} className="flex-1 flex items-center gap-2 text-xs text-left" style={{ color: C.text }}>
            <Paperclip size={14} color={C.textMuted} /> Ver comprobante
          </button>
          <label className="text-xs px-2 py-1 rounded cursor-pointer shrink-0" style={{ color: C.textMuted }}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : "Cambiar"}
            <input type="file" accept="image/*" capture="environment" className="hidden" disabled={busy} onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
          </label>
          <button type="button" onClick={handleRemove} aria-label="Quitar comprobante" className="shrink-0" style={{ color: C.negative }}>
            <X size={14} />
          </button>
        </div>
      ) : (
        <label
          className="w-full py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
          style={{ border: `1px dashed ${C.borderLight}`, color: C.textMuted }}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
          {busy ? "Subiendo..." : "Adjuntar foto"}
          <input type="file" accept="image/*" capture="environment" className="hidden" disabled={busy} onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
        </label>
      )}

      {error && <p className="text-xs mt-1" style={{ color: C.negative }}>{error}</p>}
    </div>
  );
}

/** Ícono compacto para mostrar en listados cuando un movimiento tiene un comprobante adjunto. No renderiza nada si no hay `path`. */
export function ReceiptButton({ path }: { path?: string }) {
  const [error, setError] = useState(false);
  if (!path) return null;

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setError(false);
    try {
      const url = await getReceiptUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error(err);
      setError(true);
    }
  };

  return (
    <button
      onClick={handleClick}
      aria-label="Ver comprobante"
      className="p-1.5 rounded-md"
      style={{ color: error ? C.negative : C.textMuted }}
    >
      <Paperclip size={13} />
    </button>
  );
}
