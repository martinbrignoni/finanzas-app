import { supabase } from "./supabaseClient";

/**
 * Resuelve el "dueño" real de los datos compartidos para el usuario de
 * Supabase Auth logueado. Normalmente es uno mismo (el caso de toda la vida:
 * un solo login). Si este login se agregó como miembro de un hogar
 * compartido (tabla `household_members`, ver supabase/household_sharing.sql),
 * devuelve el id del dueño original de los datos, para que todos los
 * integrantes lean y escriban siempre la misma fila de `finance_data` y los
 * mismos comprobantes en Storage.
 */
export async function resolveOwnerId(authUserId: string): Promise<string> {
  const { data, error } = await supabase
    .from("household_members")
    .select("owner_id")
    .eq("user_id", authUserId)
    .maybeSingle();

  if (error) {
    // Si la tabla todavía no existe (no se corrió la migración) o cualquier
    // otro error, no bloqueamos al usuario: se comporta como hoy, cada login
    // ve sus propios datos.
    console.error("No se pudo resolver el hogar compartido, se usa el propio usuario.", error);
    return authUserId;
  }
  return data?.owner_id ?? authUserId;
}
