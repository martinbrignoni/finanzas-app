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
 * Paleta sugerida (no depende de modo claro/oscuro) para elegir el color de
 * avatar de un perfil en Configuración > Usuarios: colores saturados que se
 * leen bien con texto blanco en ambos modos.
 */
export const AVATAR_PALETTE = [
  "#6FBF8B", // verde
  "#D97FA8", // magenta
  "#4FA8A0", // verde azulado
  "#D9A441", // dorado
  "#8B7FD9", // violeta
  "#5FA8D9", // azul
  "#D9776A", // coral
];

/**
 * Color del avatar de un perfil: el que haya elegido explícitamente
 * (`AppUser.color`), o si no eligió ninguno, uno automático pero estable
 * (mismo perfil = mismo color siempre) en base a su id.
 */
export function userColor(user: AppUser | undefined): string {
  if (!user) return "#5E706C";
  if (user.color) return user.color;
  let hash = 0;
  for (let i = 0; i < user.id.length; i++) hash = (hash * 31 + user.id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}
