import { CURRENT_SCHEMA_VERSION, emptyFinanceData, defaultCategories, fullPermissions, type FinanceData, type Category, type AppUser } from "../types";
import { supabase } from "./supabaseClient";

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

  if (data.schemaVersion === 3) {
    // v4: transferencias entre cuentas propias, separadas de los movimientos
    // de ingreso/gasto para no distorsionar totales ni presupuestos.
    data = { ...data, schemaVersion: 4, transfers: [] };
  }

  if (data.schemaVersion === 4) {
    // v5: pagos reales de tarjeta de crédito, que descuentan saldo de una cuenta.
    data = { ...data, schemaVersion: 5, cardPayments: [] };
  }

  // Agrega retroactivamente el permiso "cotizaciones" a usuarios ya
  // existentes que no lo tenían (se agregó después de que ya hubiera gente
  // usando la app), dándoles acceso por defecto para no bloquearlos.
  const usersConCotizaciones: AppUser[] = (data.users ?? []).map((u: any) =>
    u.permissions?.cotizaciones ? u : { ...u, permissions: { ...u.permissions, cotizaciones: { view: true, edit: true } } }
  );
  // Ídem para el permiso "notas".
  const usersConNotas: AppUser[] = usersConCotizaciones.map((u) =>
    u.permissions?.notas ? u : { ...u, permissions: { ...u.permissions, notas: { view: true, edit: true } } }
  );

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: data.transactions ?? [],
    cards: data.cards ?? [],
    installments: data.installments ?? [],
    budgets: data.budgets ?? [],
    banks: data.banks ?? [],
    accounts: data.accounts ?? [],
    transfers: data.transfers ?? [],
    cardPayments: data.cardPayments ?? [],
    categories: data.categories ?? [],
    notes: data.notes ?? [],
    appLock: data.appLock ?? { enabled: false, pinHash: null },
    sortOrders: data.sortOrders ?? { banks: [], accountsByBank: [], accountsByCurrency: [] },
    users: usersConNotas,
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
 * Repositorio que guarda todo el estado de la app como un único registro JSON
 * en la tabla `finance_data` de Supabase, asociado al usuario logueado. Así,
 * los mismos datos se ven desde cualquier dispositivo en el que inicies sesión.
 *
 * Nota: si dos dispositivos guardan casi al mismo tiempo sin haber recargado,
 * gana el último `save()` (no hay merge). Para uso personal, alcanza.
 */
export class SupabaseRepository implements FinanceRepository {
  async load(): Promise<FinanceData> {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) return emptyFinanceData();

    const { data, error } = await supabase
      .from("finance_data")
      .select("data")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Error leyendo datos de Supabase, se usan datos vacíos.", error);
      return emptyFinanceData();
    }
    if (!data) return emptyFinanceData();
    return migrate(data.data);
  }

  async save(data: FinanceData): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new Error("No hay sesión activa, no se puede guardar.");

    const { error } = await supabase
      .from("finance_data")
      .upsert({ user_id: userId, data, updated_at: new Date().toISOString() });

    if (error) {
      console.error("Error guardando datos en Supabase.", error);
      throw error;
    }
  }
}

/**
 * Punto único donde se decide qué repositorio usar. Hoy usa Supabase (nube,
 * sincronizado entre dispositivos). El repositorio de localStorage queda
 * disponible como referencia/fallback si en algún momento hiciera falta.
 */
export function getRepository(): FinanceRepository {
  return new SupabaseRepository();
}
