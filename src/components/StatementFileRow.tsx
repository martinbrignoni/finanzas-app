import { useState } from "react";
import { FileText, FileSpreadsheet, Check, X, Upload, Loader2 } from "lucide-react";
import { theme as C } from "../styles/theme";
import { IconBtn, ConfirmDialog } from "./ui";

/**
 * Fila de un slot de archivo (PDF o Excel) para el estado de cuenta de un
 * mes/período: adjuntar, ver o quitar. Se usa tanto para estados de cuenta de
 * cajas bancarias (Cuentas) como de tarjetas de crédito (Tarjetas).
 */
export function StatementFileRow({
  label,
  accept,
  path,
  uploading,
  onUpload,
  onView,
  onRemove,
}: {
  label: string;
  accept: string;
  path?: string;
  uploading: boolean;
  onUpload: (file: File) => void;
  onView: (path: string) => void;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex items-center justify-between rounded-lg px-3 py-2 mb-2" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2 text-xs" style={{ color: C.text }}>
        {label === "PDF" ? <FileText size={14} color={C.textMuted} /> : <FileSpreadsheet size={14} color={C.textMuted} />}
        {label}
      </div>
      {path ? (
        <div className="flex items-center gap-1">
          <IconBtn label={`Ver ${label}`} onClick={() => onView(path)}><Check size={13} color={C.positive} /></IconBtn>
          <IconBtn label={`Quitar ${label}`} danger onClick={() => setConfirming(true)}><X size={13} /></IconBtn>
          {confirming && (
            <ConfirmDialog
              message={`¿Eliminar el ${label} adjunto? No se puede deshacer.`}
              onConfirm={() => { onRemove(); setConfirming(false); }}
              onCancel={() => setConfirming(false)}
            />
          )}
        </div>
      ) : (
        <label
          className="text-xs font-semibold flex items-center gap-1"
          style={{ color: uploading ? C.textFaint : C.usd, cursor: uploading ? "default" : "pointer" }}
        >
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {uploading ? "Subiendo..." : "Adjuntar"}
          <input
            type="file"
            accept={accept}
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}
