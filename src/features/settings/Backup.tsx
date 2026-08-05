import { useEffect, useState } from "react";
import { Download, History, RefreshCw } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { IconBtn } from "../../components/ui";
import { formatDateTimeDMY } from "../../lib/dates";
import { downloadBackupJson, fetchBackupHistory, insertBackupSnapshot, type BackupHistoryRow } from "../../lib/backup";
import type { FinanceData } from "../../types";

/**
 * Respaldo de todos los datos: se hace uno automático (guardado en la nube,
 * en la tabla `data_backups`) la primera vez que se abre la app cada día, y
 * uno manual acá cuando se toca "Descargar respaldo ahora" (que además de
 * descargar el archivo .json, queda guardado en el mismo historial). No
 * incluye los archivos de comprobantes (fotos/PDF/Excel adjuntos): esos ya
 * están a salvo en Supabase Storage aparte.
 */
export function BackupSettings({ data }: { data: FinanceData }) {
  const [history, setHistory] = useState<BackupHistoryRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadHistory = async () => {
    setLoadingHistory(true);
    setHistory(await fetchBackupHistory(30));
    setLoadingHistory(false);
  };

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBackupNow = async () => {
    setWorking(true);
    setMessage(null);
    try {
      downloadBackupJson(data);
      const ok = await insertBackupSnapshot(data, "manual");
      setMessage(
        ok
          ? "Listo: se descargó el archivo y quedó guardado en el historial."
          : "Se descargó el archivo, pero no se pudo guardar en el historial (revisá tu conexión)."
      );
      await loadHistory();
    } finally {
      setWorking(false);
    }
  };

  return (
    <div>
      <p className="text-xs mb-3" style={{ color: C.textMuted }}>
        Un respaldo es una copia completa de tus datos: movimientos, cuentas, tarjetas, categorías, personas, presupuestos, recurrentes, préstamos hipotecarios, familia, usuarios y auditoría, todo en un archivo .json. No incluye las fotos, PDF o Excel de los comprobantes adjuntos: esos ya están guardados aparte en Supabase y no se pierden de golpe como sí podría pasar con este archivo.
      </p>
      <p className="text-xs mb-4" style={{ color: C.textMuted }}>
        Se hace un respaldo automático (queda guardado en la nube, no ocupa lugar en tu celular ni en tu compu) la primera vez que abrís la app cada día. Se conservan los últimos 30.
      </p>

      <button
        type="button"
        onClick={handleBackupNow}
        disabled={working}
        className="w-full py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 mb-2"
        style={{ border: `1px dashed ${C.borderLight}`, color: C.textMuted }}
      >
        <Download size={14} /> {working ? "Generando..." : "Descargar respaldo ahora"}
      </button>

      {message && (
        <p className="text-xs mb-3" style={{ color: C.textMuted }}>
          {message}
        </p>
      )}

      <div className="flex items-center justify-between mb-2 mt-3">
        <p className="text-xs font-semibold" style={{ color: C.textMuted }}>
          Historial de respaldos
        </p>
        <IconBtn label="Actualizar historial" onClick={loadHistory}>
          <RefreshCw size={14} />
        </IconBtn>
      </div>

      {loadingHistory ? (
        <p className="text-xs" style={{ color: C.textFaint }}>
          Cargando...
        </p>
      ) : history.length === 0 ? (
        <div className="rounded-xl p-4 text-center text-sm" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textMuted }}>
          Todavía no hay respaldos guardados. Puede que falte correr la migración SQL (
          <code className="text-[10px]">supabase/data_backups.sql</code>) en tu proyecto de Supabase.
        </div>
      ) : (
        <div className="space-y-1.5">
          {history.map((h) => (
            <div key={h.id} className="rounded-lg px-3 py-2 flex items-center justify-between" style={{ background: C.surface2, border: `1px solid ${C.border}` }}>
              <div className="flex items-center gap-2">
                <History size={14} color={C.textMuted} />
                <span className="text-xs" style={{ color: C.text }}>{formatDateTimeDMY(h.createdAt)}</span>
              </div>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: C.surface3, color: C.textMuted }}>
                {h.trigger === "auto" ? "Automático" : "Manual"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
