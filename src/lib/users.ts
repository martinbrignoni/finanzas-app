import type { AppUser } from "../types";

/**
 * Iniciales de un perfil (ej. "Martín Brignoni" -> "MB"), para marcar de un
 * vistazo quién cargó cada movimiento en Movimientos. `undefined` si no se
 * encuentra el perfil (ej. se borró) o no tiene nombre.
 */
export function userInitials(users: AppUser[], userId: string | undefined): string | undefined {
  if (!userId) return undefined;
  const user = users.find((u) => u.id === userId);
  const name = user?.name.trim();
  if (!name) return undefined;
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return undefined;
  const first = parts[0][0];
  const last = parts[parts.length - 1][0];
  return (parts.length > 1 ? first + last : first).toUpperCase();
}

/**
 * Paleta fija (no depende de modo claro/oscuro) para los avatares de perfil:
 * colores saturados que se leen bien con texto blanco en ambos modos.
 */
const AVATAR_PALETTE = ["#4FA8A0", "#D9A441", "#8B7FD9", "#5FA8D9", "#D97FA8", "#6FBF8B", "#D9776A"];

/** Color determinístico para el avatar de un perfil (mismo perfil = mismo color siempre). */
export function userColor(userId: string | undefined): string {
  if (!userId) return "#5E706C";
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}
