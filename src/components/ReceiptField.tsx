import { useState } from "react";
import { Upload, X, Paperclip, Loader2 } from "lucide-react";
import { theme as C } from "../styles/theme";
import { ConfirmDialog } from "./ui";
import { uploadReceipt, getReceiptUrl, deleteReceipt } from "../lib/receipts";

/**
 * Acepta fotos (con opción de sacarla en el momento o elegirla del carrete)
 * y también PDF/Excel como comprobante. Sin el atributo `capture`, el
 * selector nativo del celular muestra las opciones de Cámara, Fototeca y
 * Archivos (iCloud Drive, Google Drive, etc.) en una sola hoja. Con
 * `multiple`, se pueden elegir varios de una sola vez.
 */
const RECEIPT_ACCEPT =
  "image/*,.pdf,application/pdf,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Etiqueta legible para un comprobante, con el tipo de archivo al final (ej. "Comprobante 1 PDF"). */
function receiptLabel(path: string, index: number): string {
  const ext = path.split(".").pop()?.toUpperCase();
  return ext ? `Comprobante ${index + 1} ${ext}` : `Comprobante ${index + 1}`;
}

/**
 * Selector de comprobantes de un movimiento (gasto, ingreso, transferencia o
 * pago de tarjeta): fotos, PDF o Excel, uno o varios. Sube cada archivo a
 * Supabase Storage apenas se elige (no espera al guardar el movimiento), y
 * guarda en `paths` solo las rutas. `movementId` tiene que ser estable
 * durante toda la vida del modal (se genera una sola vez, aunque el
 * movimiento sea nuevo).
 */
export function ReceiptField({
  movementId,
  paths,
  onChange,
}: {
  movementId: string;
  paths: string[];
  onChange: (paths: string[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmPath, setConfirmPath] = useState<string | null>(null);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const newPaths = await Promise.all(Array.from(fileList).map((file) => uploadReceipt(file, movementId)));
      onChange([...paths, ...newPaths]);
    } catch (err) {
      console.error(err);
      setError("No se pudo subir uno o más archivos. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  const handleView = async (path: string) => {
    setError(null);
    try {
      const url = await getReceiptUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error(err);
      setError("No se pudo abrir el comprobante.");
    }
  };

  const handleRemove = (path: string) => {
    onChange(paths.filter((p) => p !== path));
    deleteReceipt(path);
  };

  return (
    <div className="mb-3">
      <span className="block text-xs mb-1" style={{ color: C.textMuted }}>Comprobantes (opcional)</span>

      {paths.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {paths.map((path, i) => (
            <div key={path} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: C.surface2, border: `1px solid ${C.border}` }}>
              <button type="button" onClick={() => handleView(path)} className="flex-1 flex items-center gap-2 text-xs text-left" style={{ color: C.text }}>
                <Paperclip size={14} color={C.textMuted} /> {receiptLabel(path, i)}
              </button>
              <button type="button" onClick={() => setConfirmPath(path)} aria-label={`Quitar comprobante ${i + 1}`} className="shrink-0" style={{ color: C.negative }}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <label
        className="w-full py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
        style={{ border: `1px dashed ${C.borderLight}`, color: C.textMuted }}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        {busy ? "Subiendo..." : paths.length > 0 ? "Agregar otro comprobante" : "Adjuntar comprobante"}
        <input
          type="file"
          accept={RECEIPT_ACCEPT}
          multiple
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = ""; // permite volver a elegir el mismo archivo más adelante
          }}
        />
      </label>

      {error && <p className="text-xs mt-1" style={{ color: C.negative }}>{error}</p>}

      {confirmPath && (
        <ConfirmDialog
          message="¿Eliminar este comprobante? No se puede deshacer."
          onConfirm={() => { handleRemove(confirmPath); setConfirmPath(null); }}
          onCancel={() => setConfirmPath(null)}
        />
      )}
    </div>
  );
}

/** Ícono compacto para mostrar en listados cuando un movimiento tiene comprobantes adjuntos. No renderiza nada si `paths` está vacío. */
export function ReceiptButton({ paths }: { paths?: string[] }) {
  const [error, setError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const list = paths ?? [];
  if (list.length === 0) return null;

  const openPath = async (path: string) => {
    setError(false);
    try {
      const url = await getReceiptUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error(err);
      setError(true);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (list.length === 1) {
      openPath(list[0]);
    } else {
      setMenuOpen((v) => !v);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        aria-label={list.length > 1 ? `Ver comprobantes (${list.length})` : "Ver comprobante"}
        className="p-1.5 rounded-md flex items-center gap-0.5"
        style={{ color: error ? C.negative : C.textMuted }}
      >
        <Paperclip size={13} />
        {list.length > 1 && <span className="text-[9px] font-semibold">{list.length}</span>}
      </button>
      {menuOpen && list.length > 1 && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-7 z-40 rounded-lg overflow-hidden w-36"
          style={{ background: C.surface, border: `1px solid ${C.border}` }}
        >
          {list.map((path, i) => (
            <button
              key={path}
              onClick={() => {
                setMenuOpen(false);
                openPath(path);
              }}
              className="w-full text-left px-3 py-2 text-xs"
              style={{ color: C.text }}
            >
              {receiptLabel(path, i)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
