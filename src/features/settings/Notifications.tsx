import { useEffect, useState } from "react";
import { Bell, Smartphone } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { getDeviceSubscription, isPushSupported, subscribeThisDevice, unsubscribeThisDevice } from "../../lib/push";
import { NOTIFIABLE_MODULES, type AppUser, type NotifiableModuleKey, type NotificationPrefs } from "../../types";

/**
 * Notificaciones es, igual que Seguridad, siempre "de uno mismo": cada
 * perfil elige si quiere que le avisen cuando OTRO perfil del hogar carga o
 * cambia algo, y sobre qué módulos. La suscripción técnica del navegador
 * (pedir permiso, registrar el push) es por dispositivo: si abrís la app en
 * otro celular o compu, hay que activarla ahí también.
 */
export function NotificationsSettings({
  user,
  onUpdateUserNotifications,
}: {
  user: AppUser;
  onUpdateUserNotifications: (partial: Partial<NotificationPrefs>) => void;
}) {
  const prefs: NotificationPrefs = user.notifications ?? { enabled: false, categories: {} };

  const [supported, setSupported] = useState(true);
  const [deviceSubscribed, setDeviceSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshDeviceStatus = () => {
    getDeviceSubscription().then((sub) => setDeviceSubscribed(!!sub));
  };

  useEffect(() => {
    setSupported(isPushSupported());
    refreshDeviceStatus();
  }, []);

  const handleActivateDevice = async () => {
    setError(null);
    setBusy(true);
    const result = await subscribeThisDevice(user.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDeviceSubscribed(true);
    if (!prefs.enabled) onUpdateUserNotifications({ enabled: true });
  };

  const handleDeactivateDevice = async () => {
    setBusy(true);
    await unsubscribeThisDevice();
    setBusy(false);
    setDeviceSubscribed(false);
  };

  const toggleCategory = (key: NotifiableModuleKey) => {
    const current = prefs.categories[key] !== false; // sin entrada = incluido
    onUpdateUserNotifications({ categories: { ...prefs.categories, [key]: !current } });
  };

  return (
    <div>
      <div className="rounded-xl p-4 mb-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2 mb-1">
          <Smartphone size={16} color={C.usd} />
          <span className="text-sm font-semibold" style={{ color: C.text }}>Este dispositivo</span>
        </div>

        {!supported ? (
          <p className="text-xs" style={{ color: C.textFaint }}>
            Este navegador no soporta notificaciones push. En iPhone, además, hace falta agregar la app a la pantalla
            de inicio (compartir → "Agregar a pantalla de inicio") y abrirla desde ahí, no desde una pestaña de
            Safari.
          </p>
        ) : (
          <>
            <p className="text-xs mb-3" style={{ color: C.textFaint }}>
              En iPhone, para que lleguen las notificaciones primero hay que agregar la app a la pantalla de inicio
              (compartir → "Agregar a pantalla de inicio") y abrirla desde ese ícono, no desde Safari.
            </p>
            {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
            {deviceSubscribed ? (
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: C.positive }}>Activado en este dispositivo</span>
                <button onClick={handleDeactivateDevice} disabled={busy} className="text-xs font-semibold" style={{ color: C.negative }}>
                  {busy ? "..." : "Desactivar"}
                </button>
              </div>
            ) : (
              <button onClick={handleActivateDevice} disabled={busy} className="text-xs font-semibold" style={{ color: C.usd }}>
                {busy ? "Activando..." : "Activar en este dispositivo"}
              </button>
            )}
          </>
        )}
      </div>

      <div className="rounded-xl p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Bell size={16} color={C.usd} />
            <span className="text-sm font-semibold" style={{ color: C.text }}>Recibir avisos</span>
          </div>
          <button
            onClick={() => onUpdateUserNotifications({ enabled: !prefs.enabled })}
            className="text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{ background: prefs.enabled ? C.usd : C.surface2, color: prefs.enabled ? "#0A1413" : C.textMuted }}
          >
            {prefs.enabled ? "Activado" : "Desactivado"}
          </button>
        </div>
        <p className="text-xs mb-3" style={{ color: C.textFaint }}>
          Cuando otro perfil del hogar carga o cambia algo, avisa en los dispositivos donde {user.name || "este perfil"} tenga la notificación activada.
        </p>

        {prefs.enabled && (
          <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
            {NOTIFIABLE_MODULES.map((m, i) => (
              <label
                key={m.key}
                className="flex items-center justify-between px-3 py-2 text-sm"
                style={{ background: C.surface2, borderTop: i ? `1px solid ${C.border}` : "none", color: C.text }}
              >
                {m.label}
                <input type="checkbox" checked={prefs.categories[m.key] !== false} onChange={() => toggleCategory(m.key)} />
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
