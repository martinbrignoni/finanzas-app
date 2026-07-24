import { supabase } from "./supabaseClient";
import { resolveOwnerId } from "./household";

/**
 * Clave pública VAPID: identifica a esta app frente a Apple/Google al pedir
 * un push. Es pública a propósito (viaja al navegador de cada dispositivo),
 * no hace falta guardarla como secreto. Su contraparte privada vive SOLO
 * como secreto de la Edge Function `notify-change` (nunca en este repo).
 */
const VAPID_PUBLIC_KEY = "BLd6zWUieHXzHOQj8ww0APPbjDCM16BQcFA4tdpq4mKGKsXfUddzP6zJvWJATJMMrD4TsIVMWmYVUzwlemZ4YTE";

const SW_PATH = "/finanzas-app/sw.js";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Suscripción activa de ESTE navegador/dispositivo, si existe (independiente de si está guardada en Supabase). */
export async function getDeviceSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

/**
 * Activa notificaciones en este dispositivo para el perfil `appUserId`: pide
 * permiso, se suscribe al push del navegador y guarda la suscripción en
 * Supabase (household-scoped) para que la Edge Function sepa a quién avisar.
 */
export async function subscribeThisDevice(appUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isPushSupported()) {
    return { ok: false, error: "Este navegador no soporta notificaciones push." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: "No se concedió el permiso de notificaciones." };
  }

  try {
    const registration = await navigator.serviceWorker.register(SW_PATH);
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, error: "La suscripción del navegador no tiene el formato esperado." };
    }

    const { data: auth } = await supabase.auth.getUser();
    const authUserId = auth.user?.id;
    if (!authUserId) return { ok: false, error: "No hay sesión activa." };
    const ownerId = await resolveOwnerId(authUserId);

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        owner_id: ownerId,
        app_user_id: appUserId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth_key: json.keys.auth,
      },
      { onConflict: "endpoint" }
    );
    if (error) return { ok: false, error: "No se pudo guardar la suscripción: " + error.message };

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error desconocido al suscribirse." };
  }
}

/** Desactiva notificaciones en este dispositivo: cancela la suscripción del navegador y borra la fila en Supabase. */
export async function unsubscribeThisDevice(): Promise<void> {
  const subscription = await getDeviceSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  try {
    await subscription.unsubscribe();
  } catch {
    // si falla la baja del lado del navegador, igual intentamos borrar la fila
  }
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}
