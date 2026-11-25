import type { FinanceData } from "../types";

/**
 * Antigüedad máxima de los registros de auditoría y de estadísticas de uso.
 *
 * Todos los datos viajan en un único JSON que se sube completo en cada
 * guardado y se copia en cada respaldo. Estas tres listas crecen solas (cada
 * alta/edición, cada sesión de uso, cada movimiento cargado) y no tienen
 * valor contable: sin tope, con los años hacían más lento cada guardado en
 * el celular. Los movimientos, cuentas, tarjetas, etc. NO se recortan nunca.
 */
export const LOG_RETENTION_MONTHS = 24;

function cutoffISO(today: Date, months: number): string {
  const d = new Date(today.getFullYear(), today.getMonth() - months, today.getDate());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Descarta las entradas de auditoría, sesiones de uso y tiempos de carga
 * con más de `LOG_RETENTION_MONTHS` meses. Devuelve el mismo objeto si no
 * había nada para descartar (así no se dispara un guardado de más).
 */
export function pruneOldLogs(d: FinanceData, today: Date = new Date()): FinanceData {
  const cutoff = cutoffISO(today, LOG_RETENTION_MONTHS);
  const auditLog = d.auditLog.filter((e) => e.at.slice(0, 10) >= cutoff);
  const usageSessions = d.usageSessions.filter((s) => s.date >= cutoff);
  const movementTimings = d.movementTimings.filter((m) => m.date >= cutoff);
  if (
    auditLog.length === d.auditLog.length &&
    usageSessions.length === d.usageSessions.length &&
    movementTimings.length === d.movementTimings.length
  ) {
    return d;
  }
  return { ...d, auditLog, usageSessions, movementTimings };
}
