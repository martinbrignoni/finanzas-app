import { CURRENT_SCHEMA_VERSION, emptyFinanceData, defaultCategories, fullPermissions, type FinanceData, type Category } from "../types";

export interface FinanceRepository {
  load(): Promise<FinanceData>;
  save(data: FinanceData): Promise<void>;
}

const STORAGE_KEY = "finanzas:data";

/**
 * Corre migraciones de esquema cuando cambia la forma de los datos guardados.
 * Agregá un `case` acá cada vez que subas CURRENT_SCHEMA_VERSION en types.ts,
 * así los usuarios existentes no pierden su información.
 */
function migrate(raw: any): FinanceData {
  if (!raw || typeof raw !== "object") return emptyFinanceData();
  let data = raw as FinanceData;

  if (data.schemaVersion === undefined) {
    data = { ...data, schemaVersion: 1 };
  }

  if (data.schemaVersion === 1) {
    // v2: se agrega el módulo de cuentas (bancos + cajas). Los datos previos
    // quedan intactos, simplemente no tienen cuentas asociadas todavía.
    data = { ...data, schemaVersion: 2, banks: [], accounts: [] };
  }

  if (data.schemaVersion === 2) {
    // v3: categorías administrables (antes eran una constante fija en el código)
    // y usuarios con permisos. Se arma la lista de categorías a partir de las
    // que ya venías usando en movimientos/presupuestos, para no perder ninguna,
    // y se crea un usuario "Yo" con acceso total para no bloquearte al abrir la app.
    const base = defaultCategories();
    const seen = new Set(base.map((c) => c.name.toLowerCase()));
    const extra: Category[] = [];
    (data.transactions ?? []).forEach((t: any) => {
      if (t.category && !seen.has(String(t.category).toLowerCase())) {
        seen.add(String(t.category).toLowerCase());
        extra.push({ id: crypto.randomUUID(), name: t.category, type: t.type === "ingreso" ? "ingreso" : "gasto" });
      }
    });
    (data.budgets ?? []).forEach((b: any) => {
      if (b.category && !seen.has(String(b.category).toLowerCase())) {
        seen.add(String(b.category).toLowerCase());
        extra.push({ id: crypto.randomUUID(), name: b.category, type: "gasto" });
      }
    });
    const adminId = crypto.randomUUID();
    data = {
      ...data,
      schemaVersion: 3,
      categories: [...base, ...extra],
      users: [{ id: adminId, name: "Yo", permissions: fullPermissions(true) }],
      activeUserId: adminId,
    };
  }

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: data.transactions ?? [],
    cards: data.cards ?? [],
    installments: data.installments ?? [],
    budgets: data.budgets ?? [],
    banks: data.banks ?? [],
    accounts: data.accounts ?? [],
    categories: data.categories ?? [],
    users: data.users ?? [],
    activeUserId: data.activeUserId ?? null,
  };
}

export class LocalStorageRepository implements FinanceRepository {
  async load(): Promise<FinanceData> {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyFinanceData();
      return migrate(JSON.parse(raw));
    } catch (err) {
      console.error("Error leyendo datos de localStorage, se usan datos vacíos.", err);
      return emptyFinanceData();
    }
  }

  async save(data: FinanceData): Promise<void> {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error("Error guardando datos en localStorage.", err);
      throw err;
    }
  }
}

/**
 * Punto único donde se decide qué repositorio usar. El día que armes un backend,
 * acá agregás `new ApiRepository(baseUrl)` según una variable de entorno, y
 * ningún componente de la UI se entera del cambio.
 */
export function getRepository(): FinanceRepository {
  return new LocalStorageRepository();
}
