import { useEffect, useRef, useState } from "react";
import { Upload, X, Paperclip, Loader2, FileText, FileSpreadsheet } from "lucide-react";
import { theme as C } from "../styles/theme";
import { ConfirmDialog } from "./ui";
import { ImageCropModal } from "./ImageCropModal";
import { uploadReceipt, getReceiptUrl, deleteReceipt } from "../lib/receipts";

/**
 * El botón principal ("Adjuntar comprobante") abre directo la cámara
 * (`capture="environment"`, sin pasar por la hoja nativa de opciones): es lo
 * más cómodo para el caso más común, sacarle la foto en el momento. Abajo
 * queda un link más chico para fototeca/PDF/Excel, con el selector nativo
 * completo (sin `capture`), para el resto de los casos.
 */
const RECEIPT_ACCEPT =
  "image/*,.pdf,application/pdf,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Etiqueta legible para un comprobante, con el tipo de archivo al final (ej. "Comprobante 1 PDF"). */
function receiptLabel(path: string, index: number): string {
  const ext = path.split(".").pop()?.toUpperCase();
  return ext ? `Comprobante ${index + 1} ${ext}` : `Comprobante ${index + 1}`;
}

const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif", "heic"];

function extOf(path: string): string {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

/**
 * Miniatura de un comprobante ya subido. Las fotos se ven como imagen (con
 * un link firmado temporal); PDF y Excel como un ícono con el tipo de
 * archivo. Tocarla abre el comprobante completo.
 */
function ReceiptThumb({
  path,
  index,
  onOpen,
  onRemove,
}: {
  path: string;
  index: number;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const ext = extOf(path);
  const isImage = IMAGE_EXTS.includes(ext);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    getReceiptUrl(path)
      .then((u) => !cancelled && setUrl(u))
      .catch(() => !cancelled && setFailed(true));
    return () => { cancelled = true; };
  }, [path, isImage]);

  const Icon = ext === "pdf" ? FileText : ext === "xls" || ext === "xlsx" ? FileSpreadsheet : Paperclip;

  return (
    <div className="relative" style={{ width: 72, height: 72 }}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Ver ${receiptLabel(path, index)}`}
        className="w-full h-full rounded-lg overflow-hidden flex flex-col items-center justify-center gap-1"
        style={{ background: C.surface2, border: `1px solid ${C.border}` }}
      >
        {isImage && url && !failed ? (
          <img src={url} alt={receiptLabel(path, index)} className="w-full h-full object-cover" onError={() => setFailed(true)} />
        ) : isImage && !failed ? (
          <Loader2 size={16} className="animate-spin" color={C.textMuted} />
        ) : (
          <>
            <Icon size={20} color={C.textMuted} />
            <span className="text-[10px] font-semibold" style={{ color: C.textMuted }}>{ext.toUpperCase() || "ARCHIVO"}</span>
          </>
        )}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Quitar comprobante ${index + 1}`}
        className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full flex items-center justify-center"
        style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.negative }}
      >
        <X size={12} />
      </button>
    </div>
  );
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
  // Fotos elegidas (cámara o fototeca) que todavía no pasaron por el recorte:
  // se muestran de a una en `ImageCropModal` antes de subirlas.
  const [cropQueue, setCropQueue] = useState<File[]>([]);
  const otherInputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const newPaths = await Promise.all(files.map((file) => uploadReceipt(file, movementId)));
      onChange([...paths, ...newPaths]);
    } catch (err) {
      console.error(err);
      setError("No se pudo subir uno o más archivos. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  // Las imágenes pasan primero por el recorte (una por una); PDF/Excel se suben directo.
  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const images = files.filter((f) => f.type.startsWith("image/"));
    const others = files.filter((f) => !f.type.startsWith("image/"));
    if (others.length > 0) uploadFiles(others);
    if (images.length > 0) setCropQueue((q) => [...q, ...images]);
  };

  const resolveCurrentCrop = () => setCropQueue((q) => q.slice(1));

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
        <div className="flex flex-wrap gap-2.5 mb-2 pt-1.5">
          {paths.map((path, i) => (
            <ReceiptThumb
              key={path}
              path={path}
              index={i}
              onOpen={() => handleView(path)}
              onRemove={() => setConfirmPath(path)}
            />
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
          accept="image/*"
          capture="environment"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = ""; // permite volver a elegir el mismo archivo más adelante
          }}
        />
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={() => otherInputRef.current?.click()}
        className="w-full text-center text-[11px] mt-1"
        style={{ color: C.textFaint }}
      >
        O elegí de la fototeca, un PDF o Excel
      </button>
      <input
        ref={otherInputRef}
        type="file"
        accept={RECEIPT_ACCEPT}
        multiple
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {error && <p className="text-xs mt-1" style={{ color: C.negative }}>{error}</p>}

      {confirmPath && (
        <ConfirmDialog
          message="¿Eliminar este comprobante? No se puede deshacer."
          onConfirm={() => { handleRemove(confirmPath); setConfirmPath(null); }}
          onCancel={() => setConfirmPath(null)}
        />
      )}

      {cropQueue.length > 0 && (
        <ImageCropModal
          file={cropQueue[0]}
          onConfirm={(cropped) => { uploadFiles([cropped]); resolveCurrentCrop(); }}
          onSkip={() => { uploadFiles([cropQueue[0]]); resolveCurrentCrop(); }}
          onCancel={resolveCurrentCrop}
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
