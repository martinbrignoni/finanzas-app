import { useEffect, useState } from "react";
import { Lock, Fingerprint, ShieldCheck } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Field, TextInput, PrimaryButton } from "../../components/ui";
import { sha256Hex } from "../../lib/crypto";
import { forgetBiometric, hasBiometricCredential, isBiometricAvailable, registerBiometric } from "../../lib/biometric";
import type { AppLock } from "../../types";

export function SecuritySettings({
  appLock,
  canEdit,
  onUpdateAppLock,
}: {
  appLock: AppLock;
  canEdit: boolean;
  onUpdateAppLock: (partial: Partial<AppLock>) => void;
}) {
  const [editingPin, setEditingPin] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricRegistered, setBiometricRegistered] = useState(hasBiometricCredential());
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricError, setBiometricError] = useState<string | null>(null);

  useEffect(() => {
    isBiometricAvailable().then(setBiometricAvailable);
  }, []);

  const handleToggle = () => {
    if (!appLock.pinHash) {
      setEditingPin(true); // todavía no hay clave creada, hay que crear una primero
      return;
    }
    onUpdateAppLock({ enabled: !appLock.enabled });
  };

  const cancelEditPin = () => {
    setEditingPin(false);
    setNewPin("");
    setConfirmPin("");
    setPinError(null);
  };

  const handleSavePin = async () => {
    if (!/^\d{4,8}$/.test(newPin)) return setPinError("La clave debe tener entre 4 y 8 números.");
    if (newPin !== confirmPin) return setPinError("Las claves no coinciden.");
    setSaving(true);
    const hash = await sha256Hex(newPin);
    setSaving(false);
    onUpdateAppLock({ pinHash: hash, enabled: true });
    cancelEditPin();
  };

  const handleRegisterBiometric = async () => {
    setBiometricError(null);
    setBiometricBusy(true);
    try {
      await registerBiometric("Finanzas");
      setBiometricRegistered(true);
    } catch {
      setBiometricError("No se pudo registrar. Probá de nuevo, o revisá que el dispositivo tenga Face ID/Touch ID configurado.");
    }
    setBiometricBusy(false);
  };

  const handleForgetBiometric = () => {
    forgetBiometric();
    setBiometricRegistered(false);
  };

  return (
    <div>
      <div className="rounded-xl p-4 mb-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Lock size={16} color={C.usd} />
            <span className="text-sm font-semibold" style={{ color: C.text }}>Bloqueo con clave</span>
          </div>
          {canEdit && (
            <button
              onClick={handleToggle}
              className="text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{ background: appLock.enabled ? C.usd : C.surface2, color: appLock.enabled ? "#0A1413" : C.textMuted }}
            >
              {appLock.enabled ? "Activado" : "Desactivado"}
            </button>
          )}
        </div>
        <p className="text-xs" style={{ color: C.textFaint }}>
          Pide una clave (y, si está disponible, Face ID/Touch ID) cada vez que se abre la app en este dispositivo.
        </p>

        {canEdit && appLock.pinHash && !editingPin && (
          <button onClick={() => setEditingPin(true)} className="text-xs font-semibold mt-3" style={{ color: C.usd }}>
            Cambiar clave
          </button>
        )}

        {canEdit && editingPin && (
          <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
            <Field label="Clave nueva (4 a 8 números)">
              {(id) => (
                <TextInput
                  id={id}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  autoFocus
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••"
                />
              )}
            </Field>
            <Field label="Repetí la clave">
              {(id) => (
                <TextInput
                  id={id}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••"
                />
              )}
            </Field>
            {pinError && <p className="text-xs mb-2" style={{ color: C.negative }}>{pinError}</p>}
            <div className="flex gap-3 items-center">
              <PrimaryButton onClick={handleSavePin} disabled={saving}>
                {saving ? "Guardando..." : "Guardar clave"}
              </PrimaryButton>
              <button onClick={cancelEditPin} className="text-xs font-semibold" style={{ color: C.textFaint }}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {appLock.pinHash && (
        <div className="rounded-xl p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2 mb-1">
            <Fingerprint size={16} color={C.usd} />
            <span className="text-sm font-semibold" style={{ color: C.text }}>Face ID / Touch ID</span>
          </div>

          {!biometricAvailable ? (
            <p className="text-xs" style={{ color: C.textFaint }}>
              No está disponible en este navegador o dispositivo. La clave sigue funcionando igual.
            </p>
          ) : (
            <>
              <p className="text-xs mb-2" style={{ color: C.textFaint }}>
                Se registra por dispositivo: si abrís la app en otro celular o compu, hay que registrarlo ahí también. La clave siempre sirve como respaldo.
              </p>
              {biometricError && <p className="text-xs mb-2" style={{ color: C.negative }}>{biometricError}</p>}
              {canEdit &&
                (biometricRegistered ? (
                  <div className="flex items-center justify-between">
                    <span className="text-xs flex items-center gap-1" style={{ color: C.positive }}>
                      <ShieldCheck size={13} /> Registrado en este dispositivo
                    </span>
                    <button onClick={handleForgetBiometric} className="text-xs font-semibold" style={{ color: C.negative }}>
                      Quitar
                    </button>
                  </div>
                ) : (
                  <button onClick={handleRegisterBiometric} disabled={biometricBusy} className="text-xs font-semibold" style={{ color: C.usd }}>
                    {biometricBusy ? "Registrando..." : "Registrar en este dispositivo"}
                  </button>
                ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
