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
    // Antes, ante un error se seguía con el propio usuario. Para alguien que
    // comparte hogar eso significaba leer (y después guardar en) una fila
    // vacía propia en vez de la del hogar. Ahora el error corta la carga y la
    // app muestra "Reintentar".
    console.error("No se pudo resolver el hogar compartido.", error);
    throw error;
  }
  return data?.owner_id ?? authUserId;
}
