/**
 * Hashea un texto (ej. un PIN) con SHA-256 usando la Web Crypto API nativa
 * del navegador, y lo devuelve como string hexadecimal. Nunca guardamos el
 * PIN en texto plano, aunque sea un candado de privacidad local y no una
 * seguridad "real" de servidor.
 */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
