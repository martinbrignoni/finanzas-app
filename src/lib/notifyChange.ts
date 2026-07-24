import type { FinanceData, NotifiableModuleKey } from "../types";
import { supabase } from "./supabaseClient";

/** Qué campos de FinanceData corresponden a cada módulo notificable. */
const FIELDS_BY_CATEGORY: Record<NotifiableModuleKey, (keyof FinanceData)[]> = {
  movimientos: ["transactions", "transfers", "installments", "cardPayments"],
  cuentas: ["banks", "accounts", "accountStatements"],
  tarjetas: ["cards", "cardStatements"],
  presupuestos: ["budgets"],
  notas: ["notes"],
  personas: ["contacts", "contactEntries"],
  hipoteca: ["mortgageLoans"],
};

/**
 * Compara dos estados de FinanceData y devuelve qué módulos "notificables"
 * cambiaron (se agregó, editó o borró algo). Compara por contenido (no solo
 * por longitud) para no perderse ediciones que no cambian la cantidad de
 * elementos. Deliberadamente ignora otros campos (users, appLock,
 * sortOrders, categories, activeUserId, schemaVersion): esos son ajustes de
 * configuración/preferencias, no "alguien cargó algo".
 */
export function detectChangedCategories(prev: FinanceData, next: FinanceData): NotifiableModuleKey[] {
  const changed: NotifiableModuleKey[] = [];
  (Object.keys(FIELDS_BY_CATEGORY) as NotifiableModuleKey[]).forEach((key) => {
    const fields = FIELDS_BY_CATEGORY[key];
    const isDifferent = fields.some((f) => JSON.stringify(prev[f]) !== JSON.stringify(next[f]));
    if (isDifferent) changed.push(key);
  });
  return changed;
}

/**
 * Avisa (fire-and-forget) a la Edge Function `notify-change` de que este
 * perfil hizo cambios en ciertos módulos, para que le mande un push a los
 * demás perfiles del hogar que lo tengan habilitado. No bloquea ni rompe el
 * guardado si falla (ej. función todavía no desplegada): solo lo loguea.
 */
export function notifyOtherDevices(actorUserId: string, actorName: string, categories: NotifiableModuleKey[]): void {
  if (categories.length === 0) return;
  supabase.functions
    .invoke("notify-change", { body: { actorUserId, actorName, categories } })
    .then(({ data, error }) => {
      if (error) console.error("No se pudo avisar a otros dispositivos.", error);
      else console.log("[notify-change]", data);
    })
    .catch((err) => console.error("No se pudo avisar a otros dispositivos.", err));
}
