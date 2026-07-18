import { describe, it, expect } from "vitest";
import { canView, canEdit } from "./permissions";
import { fullPermissions } from "../types";
import type { AppUser } from "../types";

describe("permissions", () => {
  const viewer: AppUser = {
    id: "u1",
    name: "Viewer",
    permissions: { ...fullPermissions(false), presupuestos: { view: true, edit: false } },
  };

  it("respeta view=true / edit=false", () => {
    expect(canView(viewer, "presupuestos")).toBe(true);
    expect(canEdit(viewer, "presupuestos")).toBe(false);
  });

  it("deniega módulos sin permiso explícito", () => {
    expect(canView(viewer, "cuentas")).toBe(false);
  });

  it("deniega todo si no hay usuario activo", () => {
    expect(canView(null, "inicio")).toBe(false);
    expect(canEdit(null, "inicio")).toBe(false);
  });
});
