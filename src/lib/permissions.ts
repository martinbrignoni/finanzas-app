import type { AppUser, PermissionKey } from "../types";

export function canView(user: AppUser | null, key: PermissionKey): boolean {
  if (!user) return false;
  return user.permissions[key]?.view ?? false;
}

export function canEdit(user: AppUser | null, key: PermissionKey): boolean {
  if (!user) return false;
  return user.permissions[key]?.edit ?? false;
}
