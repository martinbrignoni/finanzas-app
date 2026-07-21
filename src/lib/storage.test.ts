import { describe, it, expect, beforeEach } from "vitest";
import { LocalStorageRepository } from "./storage";

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

    expect(migrated.schemaVersion).toBe(7);
    expect(migrated.transactions).toHaveLength(1);
    expect(migrated.categories.some((c) => c.name === "Mascotas")).toBe(true);
    expect(migrated.categories.some((c) => c.name === "Alimentación")).toBe(true);
    expect(migrated.users).toHaveLength(1);
    expect(migrated.activeUserId).toBe(migrated.users[0].id);
    expect(migrated.users[0].permissions.cuentas.edit).toBe(true);
    expect(migrated.transfers).toEqual([]);
    expect(migrated.cardPayments).toEqual([]);
  });

  it("no rompe con datos vacíos (primera vez que se abre la app)", async () => {
    const repo = new LocalStorageRepository();
    const data = await repo.load();
    expect(data.schemaVersion).toBe(7);
    expect(data.users).toHaveLength(1);
    expect(data.categories.length).toBeGreaterThan(0);
    expect(data.transfers).toEqual([]);
    expect(data.cardPayments).toEqual([]);
  });
});
