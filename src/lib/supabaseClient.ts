import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // No tiramos error acá para no romper `npm run test` ni el build cuando
  // este archivo se importa sin estar configurado. En su lugar, avisamos por
  // consola: cualquier llamada real a Supabase va a fallar con un error claro
  // de red/autenticación, fácil de diagnosticar.
  console.warn(
    "Faltan las variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Revisá tu .env.local (local) o los secrets del repo (deploy)."
  );
}

export const supabase = createClient(url || "https://placeholder.supabase.co", anonKey || "placeholder-anon-key");
