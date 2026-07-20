/**
 * Face ID / Touch ID (o su equivalente Android) vía WebAuthn, como atajo
 * para no tener que tipear el PIN en el dispositivo donde se registró.
 *
 * Importante: esto queda guardado por DISPOSITIVO/NAVEGADOR (en localStorage,
 * no viaja con los datos sincronizados de Supabase). Si abrís la app en otro
 * celular o compu, ahí vas a tener que registrar Face ID/Touch ID de nuevo
 * (o usar el PIN, que sí es el mismo en todos lados).
 *
 * También es una verificación "liviana": confiamos en que el navegador y el
 * sistema operativo hicieron bien la verificación biométrica al resolver
 * `navigator.credentials.get()`, sin un servidor propio que valide la firma
 * criptográfica (eso requeriría backend). Para el objetivo de esto —una
 * pantalla de privacidad, no una bóveda bancaria— alcanza y sobra.
 */

const CREDENTIAL_ID_KEY = "finanzas:biometric_credential_id";

function bufferToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuffer(b64: string): ArrayBuffer {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
}

/** ¿Este navegador/dispositivo soporta un autenticador de plataforma (Face ID, Touch ID, huella, etc.)? */
export async function isBiometricAvailable(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) {
    return false;
  }
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** ¿Ya se registró Face ID/Touch ID en ESTE dispositivo/navegador? */
export function hasBiometricCredential(): boolean {
  return !!localStorage.getItem(CREDENTIAL_ID_KEY);
}

/** Registra Face ID/Touch ID en este dispositivo (dispara el prompt nativo del sistema). */
export async function registerBiometric(label: string): Promise<void> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Finanzas" },
      user: { id: userId, name: label, displayName: label },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 }, // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
      timeout: 60000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error("No se pudo registrar Face ID/Touch ID en este dispositivo.");
  localStorage.setItem(CREDENTIAL_ID_KEY, bufferToBase64(credential.rawId));
}

/** Pide Face ID/Touch ID en este dispositivo. Devuelve true si el usuario pasó la verificación. */
export async function verifyBiometric(): Promise<boolean> {
  const stored = localStorage.getItem(CREDENTIAL_ID_KEY);
  if (!stored) return false;

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: base64ToBuffer(stored), type: "public-key" }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    return !!assertion;
  } catch {
    // El usuario canceló, falló la verificación, o el navegador la bloqueó.
    return false;
  }
}

/** Olvida el registro de Face ID/Touch ID en este dispositivo. */
export function forgetBiometric(): void {
  localStorage.removeItem(CREDENTIAL_ID_KEY);
}
