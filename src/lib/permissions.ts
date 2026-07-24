import type { AppUser, PermissionKey } from "../types";

export function canView(user: AppUser | null, key: PermissionKey): boolean {
  if (!user) return false;
  return user.permissions[key]?.view ?? false;
}

export function canEdit(user: AppUser | null, key: PermissionKey): boolean {
  if (!user) return false;
  return user.permissions[key]?.edit ?? false;
}

/**
 * Además del permiso de módulo (edit), determina si este usuario puede
 * editar o eliminar un registro puntual de un movimiento (Transaction,
 * Transfer, Installment, CardPayment, ContactEntry, etc. con
 * `createdByUserId`): el superusuario (`isAdmin`) puede con cualquiera, sin
 * importar quién lo cargó; el resto de los usuarios solo puede con los que
 * cargó él mismo. Los registros viejos sin `createdByUserId` (de antes de
 * este control) quedan reservados al superusuario.
 */
export function canEditOwnRecord(user: AppUser | null, record: { createdByUserId?: string }): boolean {
  if (!user) return false;
  if (user.isAdmin) return true;
  return !!record.createdByUserId && record.createdByUserId === user.id;
}
