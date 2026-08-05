import { supabase } from "./supabaseClient";
import { resolveOwnerId } from "./household";
import { todayISO } from "./dates";
import type { FinanceData } from "../types";

/**
 * Respaldo completo de los datos (todo `FinanceData`: movimientos, cuentas,
 * tarjetas, categorías, personas, presupuestos, recurrentes, préstamos
 * hipotecarios, familia, auditoría, usuarios...) en la tabla `data_backups`
 * de Supabase (ver `supabase/data_backups.sql`). No incluye los archivos de
 * comprobantes en sí (fotos/PDF/Excel adjuntos): esos ya viven guardados en
 * Supabase Storage (bucket "receipts"), que no se sobrescribe nunca entero
 * como sí pasa con este JSON en cada guardado — por eso el respaldo se
 * enfoca en lo que sí corre riesgo de perderse de golpe.
 */

const AUTO_BACKUP_LOCALSTORAGE_KEY = "finanzas:lastAutoBackupDate";
const AUTO_BACKUP_RETENTION = 30;
const MANUAL_BACKUP_RETENTION = 100;

export type BackupTrigger = "auto" | "manual";

export interface BackupHistoryRow {
  id: string;
  createdAt: string;
  trigger: BackupTrigger;
}

async function resolveBackupUserId(): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  const authUserId = auth.user?.id;
  if (!authUserId) return null;
  return resolveOwnerId(authUserId);
}

/** Poda respaldos viejos de un `trigger` puntual, dejando los `keep` más recientes. */
async function pruneOldBackups(userId: string, trigger: BackupTrigger, keep: number): Promise<void> {
  const { data, error } = await supabase
    .from("data_backups")
    .select("id")
    .eq("user_id", userId)
    .eq("trigger", trigger)
    .order("created_at", { ascending: false })
    .range(keep, keep + 200); // todo lo que sobra más allá de los `keep` más recientes
  if (error || !data || data.length === 0) return;
  const idsToDelete = data.map((row) => row.id as string);
  await supabase.from("data_backups").delete().in("id", idsToDelete);
}

/**
 * Guarda una copia de `data` en `data_backups`. No tira si algo falla (falta
 * de sesión, tabla todavía no creada porque no se corrió la migración SQL,
 * error de red, etc.): un respaldo que falla no tiene que interrumpir el uso
 * normal de la app. Devuelve `true` si se guardó.
 */
export async function insertBackupSnapshot(data: FinanceData, trigger: BackupTrigger): Promise<boolean> {
  try {
    const userId = await resolveBackupUserId();
    if (!userId) return false;
    const { error } = await supabase.from("data_backups").insert({ user_id: userId, trigger, data });
    if (error) {
      console.error("No se pudo guardar el respaldo.", error);
      return false;
    }
    const keep = trigger === "auto" ? AUTO_BACKUP_RETENTION : MANUAL_BACKUP_RETENTION;
    pruneOldBackups(userId, trigger, keep).catch(() => {});
    return true;
  } catch (err) {
    console.error("No se pudo guardar el respaldo.", err);
    return false;
  }
}

/** Últimos `limit` respaldos (automáticos y manuales mezclados, más reciente primero), para mostrar en Configuración -> Respaldo. */
export async function fetchBackupHistory(limit = 30): Promise<BackupHistoryRow[]> {
  try {
    const userId = await resolveBackupUserId();
    if (!userId) return [];
    const { data, error } = await supabase
      .from("data_backups")
      .select("id, created_at, trigger")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map((row) => ({ id: row.id as string, createdAt: row.created_at as string, trigger: row.trigger as BackupTrigger }));
  } catch (err) {
    console.error("No se pudo traer el historial de respaldos.", err);
    return [];
  }
}

/** Dispara la descarga de `data` como un archivo .json, directo al navegador. */
export function downloadBackupJson(data: FinanceData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `respaldo-finanzas-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Si todavía no se hizo un respaldo automático hoy (según `localStorage` de
 * este dispositivo), guarda uno ahora. Pensada para llamarse una vez al abrir
 * la app, sin bloquear la carga (no hace falta esperarla ni mostrar nada:
 * corre en silencio). Si falla, no pasa nada — se reintenta la próxima vez
 * que se abra la app.
 */
export async function maybeRunAutomaticBackup(data: FinanceData): Promise<void> {
  try {
    const today = todayISO();
    const last = window.localStorage.getItem(AUTO_BACKUP_LOCALSTORAGE_KEY);
    if (last === today) return;
    const ok = await insertBackupSnapshot(data, "auto");
    if (ok) window.localStorage.setItem(AUTO_BACKUP_LOCALSTORAGE_KEY, today);
  } catch (err) {
    console.error("No se pudo correr el respaldo automático.", err);
  }
}
