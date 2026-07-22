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
