import { userColor, userInitials } from "../lib/users";
import type { AppUser } from "../types";

/**
 * Avatar circular con las iniciales de quien cargó un movimiento (ej. "MB"),
 * con color fijo por perfil, para identificarlo de un vistazo en vez de
 * texto plano "· MB" perdido en la fecha. `null` si el movimiento no tiene
 * autor registrado (movimientos cargados antes de este campo) o el perfil
 * ya no existe.
 */
export function UserBadge({
  users,
  userId,
  size = 16,
}: {
  users: AppUser[];
  userId: string | undefined;
  size?: number;
}) {
  const initials = userInitials(users, userId);
  if (!initials) return null;
  const user = users.find((u) => u.id === userId);

  return (
    <span
      title={user?.name ?? "Perfil eliminado"}
      className="inline-flex items-center justify-center rounded-full font-semibold shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(8, size * 0.42),
        lineHeight: 1,
        background: userColor(userId),
        color: "#FFFFFF",
      }}
    >
      {initials}
    </span>
  );
}
