import { describe, it, expect, beforeEach } from "vitest";
import { LocalStorageRepository } from "./storage";
import { CURRENT_SCHEMA_VERSION } from "../types";

/** Colecciones agregadas por las migraciones v13 a v18: tienen que existir (vacías) después de migrar. */
const expectNewCollectionsEmpty = (data: Awaited<ReturnType<LocalStorageRepository["load"]>>) => {
  expect(data.auditLog).toEqual([]);
  expect(data.familyMembers).toEqual([]);
  expect(data.usageSessions).toEqual([]);
  expect(data.movementTimings).toEqual([]);
  expect(data.vehicles).toEqual([]);
  expect(data.reminders).toEqual([]);
  expect(data.reminderRules).toEqual([]);
};

describe("LocalStorageRepository migration", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("migra datos v2 (sin categorías/usuarios) preservando categorías en uso y creando un usuario con acceso total", async () => {
    const v2Data = {
      schemaVersion: 2,
      transactions: [
        { id: "t1", type: "gasto", amountMinor: 1000, currency: "UYU", category: "Mascotas", date: "2026-06-01" },
      ],
      cards: [],
      installments: [],
      budgets: [{ id: "b1", category: "Alimentación", currency: "UYU", limitMinor: 5000 }],
      banks: [],
      accounts: [],
    };
    window.localStorage.setItem("finanzas:data", JSON.stringify(v2Data));

    const repo = new LocalStorageRepository();
    const migrated = await repo.load();

    // Siempre la versión actual: así el test no queda viejo cada vez que se agrega una migración.
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.transactions).toHaveLength(1);
    expect(migrated.categories.some((c) => c.name === "Mascotas")).toBe(true);
    expect(migrated.categories.some((c) => c.name === "Alimentación")).toBe(true);
    expect(migrated.users).toHaveLength(1);
    expect(migrated.activeUserId).toBe(migrated.users[0].id);
    expect(migrated.users[0].permissions.cuentas.edit).toBe(true);
    expect(migrated.transfers).toEqual([]);
    expect(migrated.cardPayments).toEqual([]);
    expect(migrated.users[0].permissions.recordatorios.edit).toBe(true);
    expectNewCollectionsEmpty(migrated);
  });

  it("no rompe con datos vacíos (primera vez que se abre la app)", async () => {
    const repo = new LocalStorageRepository();
    const data = await repo.load();
    expect(data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(data.users).toHaveLength(1);
    expect(data.categories.length).toBeGreaterThan(0);
    expect(data.transfers).toEqual([]);
    expect(data.cardPayments).toEqual([]);
    expectNewCollectionsEmpty(data);
  });

  it("migra de la v17 a la actual sin perder movimientos ni usuarios existentes", async () => {
    const v17Data = {
      schemaVersion: 17,
      transactions: [
        { id: "t1", type: "gasto", amountMinor: 276000, currency: "UYU", category: "Supermercado", date: "2026-11-17" },
        { id: "t2", type: "ingreso", amountMinor: 150000, currency: "USD", category: "Sueldo", date: "2026-11-01" },
      ],
      categories: [{ id: "c1", name: "Supermercado" }, { id: "c2", name: "Sueldo" }],
      users: [{ id: "u1", name: "Martín", permissions: { cuentas: { view: true, edit: true } } }],
      activeUserId: "u1",
      vehicles: [{ id: "v1", name: "Auto" }],
    };
    window.localStorage.setItem("finanzas:data", JSON.stringify(v17Data));

    const data = await new LocalStorageRepository().load();

    expect(data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(data.transactions).toEqual(v17Data.transactions);
    expect(data.categories).toEqual(v17Data.categories);
    expect(data.vehicles).toEqual(v17Data.vehicles);
    expect(data.users).toHaveLength(1);
    expect(data.users[0].id).toBe("u1");
    expect(data.users[0].permissions.cuentas.edit).toBe(true);
    // Los permisos que se agregaron después se dan por defecto, para no bloquear a nadie.
    expect(data.users[0].permissions.recordatorios).toEqual({ view: true, edit: true });
    expect(data.activeUserId).toBe("u1");
    expect(data.reminders).toEqual([]);
    expect(data.reminderRules).toEqual([]);
  });

  it("v19 repara movimientos huérfanos de una categoría que se movió de madre", async () => {
    const v18 = {
      schemaVersion: 18,
      transactions: [{ id: "t1", type: "gasto", amountMinor: 1000, currency: "UYU", category: "Hogar > Seguro", date: "2026-06-01" }],
      categories: [
        { id: "hogar", name: "Hogar", type: "gasto" },
        { id: "auto", name: "Auto", type: "gasto" },
        { id: "seguro", name: "Seguro", type: "gasto", parentId: "auto" },
      ],
      users: [],
    };
    window.localStorage.setItem("finanzas:data", JSON.stringify(v18));
    const migrated = await new LocalStorageRepository().load();
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.transactions[0].category).toBe("Auto > Seguro");
  });
});
