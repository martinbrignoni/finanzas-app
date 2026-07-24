// Edge Function: le avisa (Web Push) a los demás perfiles del hogar cuando
// alguien carga o cambia algo en la app, si tienen la notificación activada
// para ese módulo. La llama el propio cliente (ver src/lib/notifyChange.ts)
// justo después de guardar, pasando su propio JWT de sesión.
//
// Variables de entorno necesarias (Project Settings → Edge Functions →
// Secrets, o `supabase secrets set ...`):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ej. mailto:vos@mail.com)
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya están disponibles por defecto
// en toda Edge Function de Supabase.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

type NotifiableModuleKey = "movimientos" | "cuentas" | "tarjetas" | "presupuestos" | "notas" | "personas" | "hipoteca";

const LABELS: Record<NotifiableModuleKey, string> = {
  movimientos: "Movimientos",
  cuentas: "Cuentas",
  tarjetas: "Tarjetas",
  presupuestos: "Presupuestos",
  notas: "Notas",
  personas: "Personas",
  hipoteca: "Hipoteca",
};

interface NotificationPrefs {
  enabled: boolean;
  categories: Partial<Record<NotifiableModuleKey, boolean>>;
}

interface AppUserLite {
  id: string;
  name: string;
  notifications?: NotificationPrefs;
}

// La app se sirve desde GitHub Pages y esta función vive en supabase.co: es
// una llamada cross-origin, así que el navegador manda primero un preflight
// OPTIONS. Sin estos headers, el preflight vuelve con 405/sin Access-Control-*
// y el navegador nunca llega a mandar el POST real (fallaba en silencio: el
// fetch se corta antes, `notifyOtherDevices` solo lo loguea a consola).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json({ ok: false, error: "Falta el header Authorization." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Verifica de quién es el JWT que mandó el cliente (no confiamos en nada
    // que venga en el body para identidad, solo para el contenido del aviso).
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData.user) {
      return json({ ok: false, error: "Sesión inválida." }, 401);
    }
    const callerAuthId = userData.user.id;

    const { data: membership } = await admin
      .from("household_members")
      .select("owner_id")
      .eq("user_id", callerAuthId)
      .maybeSingle();
    const ownerId = membership?.owner_id ?? callerAuthId;

    const body = await req.json().catch(() => ({}));
    const actorUserId = String(body.actorUserId ?? "");
    const actorName = String(body.actorName ?? "Alguien");
    const categories: NotifiableModuleKey[] = Array.isArray(body.categories)
      ? body.categories.filter((c: unknown): c is NotifiableModuleKey => typeof c === "string" && c in LABELS)
      : [];
    if (!actorUserId || categories.length === 0) {
      return json({ ok: false, error: "Faltan actorUserId o categories." }, 400);
    }

    const { data: financeRow, error: financeErr } = await admin
      .from("finance_data")
      .select("data")
      .eq("user_id", ownerId)
      .maybeSingle();
    if (financeErr || !financeRow) {
      return json({ ok: false, error: "No se encontraron datos del hogar." }, 404);
    }
    const users: AppUserLite[] = financeRow.data?.users ?? [];

    const { data: subs, error: subsErr } = await admin
      .from("push_subscriptions")
      .select("id, app_user_id, endpoint, p256dh, auth_key")
      .eq("owner_id", ownerId);
    if (subsErr) throw subsErr;

    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:no-reply@example.com";
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    const labels = categories.map((c) => LABELS[c]).join(", ");
    const payload = JSON.stringify({
      title: "Finanzas",
      body: `${actorName} hizo cambios en ${labels}.`,
      url: "/finanzas-app/",
    });

    let sent = 0;
    const staleIds: string[] = [];

    for (const sub of subs ?? []) {
      if (sub.app_user_id === actorUserId) continue; // no avisarle al propio autor

      const appUser = users.find((u) => u.id === sub.app_user_id);
      const prefs = appUser?.notifications;
      if (!prefs?.enabled) continue;
      const wantsAny = categories.some((c) => prefs.categories?.[c] !== false);
      if (!wantsAny) continue;

      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          payload
        );
        sent++;
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) staleIds.push(sub.id);
        else console.error("Error enviando push a", sub.endpoint, err);
      }
    }

    if (staleIds.length > 0) {
      await admin.from("push_subscriptions").delete().in("id", staleIds);
    }

    return json({ ok: true, sent, staleRemoved: staleIds.length });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
});
