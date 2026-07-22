import { useEffect, useState } from "react";
import { Lock, Fingerprint } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { TextInput, PrimaryButton } from "../../components/ui";
import { sha256Hex } from "../../lib/crypto";
import { hasBiometricCredential, isBiometricAvailable, verifyBiometric } from "../../lib/biometric";
import { supabase } from "../../lib/supabaseClient";

/**
 * Pantalla de bloqueo de la app (además del login de Supabase). Se muestra
 * cuando el bloqueo del perfil activo (`AppUser.lock`) está activado y
 * todavía no se ingresó el PIN correcto (o Face ID/Touch ID, si está
 * configurado en este dispositivo para ESE perfil) en esta apertura de la
 * app. Cada perfil tiene su propio PIN/Face ID, independiente del de otros.
 */
export function LockScreen({
  userId,
  userName,
  pinHash,
  onUnlock,
}: {
  userId: string;
  userName?: string;
  pinHash: string | null;
  onUnlock: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [biometricReady, setBiometricReady] = useState(false);

  useEffect(() => {
    let cancelado = false;
    isBiometricAvailable().then((available) => {
      if (!cancelado) setBiometricReady(available && hasBiometricCredential(userId));
    });
    return () => {
      cancelado = true;
    };
  }, [userId]);

  const tryBiometric = async () => {
    setError(null);
    setChecking(true);
    const ok = await verifyBiometric(userId);
    setChecking(false);
    if (ok) onUnlock();
    else setError("No se pudo verificar. Probá con la clave.");
  };

  // Si ya hay Face ID/Touch ID configurado en este dispositivo, lo intentamos solo al entrar.
  useEffect(() => {
    if (biometricReady) tryBiometric();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biometricReady]);

  const handleUnlock = async () => {
    if (!pinHash) {
      onUnlock();
      return;
    }
    setChecking(true);
    const hash = await sha256Hex(pin);
    setChecking(false);
    if (hash === pinHash) {
      onUnlock();
    } else {
      setError("Clave incorrecta.");
      setPin("");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: C.bg }}>
      <div className="w-full max-w-xs">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ background: C.surface2 }}>
            <Lock size={24} color={C.usd} />
          </div>
          <h1 className="text-lg font-display" style={{ color: C.text }}>Finanzas bloqueadas</h1>
          <p className="text-xs text-center mt-1" style={{ color: C.textFaint }}>
            {userName ? `Ingresá la clave de ${userName} para continuar` : "Ingresá tu clave para continuar"}
          </p>
        </div>

        <TextInput
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoFocus
          maxLength={8}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, ""));
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleUnlock();
          }}
          placeholder="Clave"
          className="text-center text-lg tracking-[0.3em] mb-3"
        />

        {error && (
          <p className="text-xs text-center mb-3" style={{ color: C.negative }}>
            {error}
          </p>
        )}

        <PrimaryButton onClick={handleUnlock} disabled={checking || pin.length < 4}>
          {checking ? "Verificando..." : "Desbloquear"}
        </PrimaryButton>

        {biometricReady && (
          <button
            onClick={tryBiometric}
            disabled={checking}
            className="w-full flex items-center justify-center gap-2 mt-3 py-2 text-sm font-semibold"
            style={{ color: C.usd }}
          >
            <Fingerprint size={16} /> Usar Face ID / Touch ID
          </button>
        )}

        <button onClick={() => supabase.auth.signOut()} className="w-full text-center text-xs mt-6" style={{ color: C.textFaint }}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
