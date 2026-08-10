import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { FinanceData, UsageSession } from "../types";

/**
 * Mientras la pestaña sigue visible y activa, cada cuánto se "refresca" (se
 * guarda) la duración del bloque abierto, para no perder casi nada si el
 * navegador se cierra de golpe sin disparar ningún evento de cierre. No hace
 * falta que sea muy seguido: cada guardado dispara un `save()` completo a
 * Supabase (ver App.tsx), así que conviene no multiplicarlos.
 */
const HEARTBEAT_MS = 5 * 60 * 1000;

/**
 * Registra, por perfil, bloques continuos de tiempo con la app abierta y
 * visible (ver `UsageSession` en types.ts), para poder verlo en Configuración
 * → Estadísticas. Se guarda con el mismo `setData` que usa el resto de la
 * app (no agrega ninguna infraestructura de guardado nueva) y solo escribe en
 * los puntos de corte naturales de una sesión — pestaña oculta/cerrada,
 * cambio de perfil, o cada `HEARTBEAT_MS` mientras sigue abierta — en vez de
 * cada pocos segundos, para no multiplicar los guardados.
 */
export function useUsageTracking(data: FinanceData | null, setData: Dispatch<SetStateAction<FinanceData | null>>) {
  // No usamos useState acá: cambiar esto no debe re-renderizar nada, es solo
  // contabilidad interna que se vuelca a `data` (y de ahí a Supabase) en los
  // puntos de corte, no en cada tick.
  const openRef = useRef<{ id: string; userId: string; startedAt: string } | null>(null);

  const flush = (endAtIso: string) => {
    const open = openRef.current;
    if (!open) return;
    const durationSeconds = Math.round((new Date(endAtIso).getTime() - new Date(open.startedAt).getTime()) / 1000);
    if (durationSeconds < 1) return;
    setData((d) => {
      if (!d) return d;
      const idx = d.usageSessions.findIndex((s) => s.id === open.id);
      const session: UsageSession = {
        id: open.id,
        userId: open.userId,
        date: open.startedAt.slice(0, 10),
        startedAt: open.startedAt,
        lastActiveAt: endAtIso,
        durationSeconds,
      };
      const usageSessions =
        idx === -1 ? [...d.usageSessions, session] : d.usageSessions.map((s, i) => (i === idx ? session : s));
      return { ...d, usageSessions };
    });
  };

  const closeOpenSession = () => {
    if (!openRef.current) return;
    flush(new Date().toISOString());
    openRef.current = null;
  };

  const openNewSession = (userId: string) => {
    openRef.current = { id: crypto.randomUUID(), userId, startedAt: new Date().toISOString() };
  };

  const ensureOpenFor = (userId: string | null | undefined) => {
    if (!userId) return;
    if (openRef.current?.userId === userId) return; // ya hay un bloque abierto de este mismo perfil
    if (openRef.current) closeOpenSession(); // cambió de perfil: cierra el bloque anterior antes de abrir uno nuevo
    openNewSession(userId);
  };

  // Abre el bloque inicial (o uno nuevo) cuando cambia el perfil activo.
  useEffect(() => {
    if (!data || document.visibilityState !== "visible") return;
    ensureOpenFor(data.activeUserId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.activeUserId, !!data]);

  // Cierra al ocultarse/cerrarse la pestaña, reabre al volver a primer plano.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") closeOpenSession();
      else if (data?.activeUserId) ensureOpenFor(data.activeUserId);
    };
    const onHide = () => closeOpenSession();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.activeUserId]);

  // Refresca la duración del bloque abierto cada tanto mientras sigue visible.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") flush(new Date().toISOString());
    }, HEARTBEAT_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
