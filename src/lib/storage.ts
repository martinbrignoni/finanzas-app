import { CURRENT_SCHEMA_VERSION, emptyFinanceData, defaultCategories, fullPermissions, type FinanceData, type Category, type AppUser } from "../types";
import { categoryFullPath } from "./categories";
import { supabase } from "./supabaseClient";
import { resolveOwnerId } from "./household";

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

  if (data.schemaVersion === 5) {
    // v6: en movimientos/cuotas/presupuestos, `category` pasa de guardar solo
    // el nombre de la hoja (ej. "Transporte") a guardar el path completo
    // (ej. "Gastos domésticos > Transporte"). Esto evita que dos categorías
    // con el mismo nombre en ramas distintas (ej. "Transporte" bajo "Gastos
    // domésticos" y bajo "Servicio doméstico") se traten como si fueran la
    // misma. Reescribimos lo ya guardado usando el árbol de categorías
    // actual: si el nombre identifica una única categoría de ese tipo, se
    // reemplaza por su path completo; si es ambiguo (ya había dos categorías
    // con ese nombre) o no se encuentra, se deja como estaba, para no
    // reasignar mal algo que no podemos saber con certeza a qué rama
    // pertenecía.
    const categories = data.categories ?? [];
    const pathsByKey = new Map<string, string[]>();
    for (const cat of categories) {
      const key = `${cat.type}::${cat.name}`;
      const list = pathsByKey.get(key) ?? [];
      list.push(categoryFullPath(cat, categories));
      pathsByKey.set(key, list);
    }
    const resolve = (name: string | undefined, type: "ingreso" | "gasto"): string | undefined => {
      if (!name) return name;
      const candidates = pathsByKey.get(`${type}::${name}`);
      return candidates && candidates.length === 1 ? candidates[0] : name;
    };
    data = {
      ...data,
      schemaVersion: 6,
      transactions: (data.transactions ?? []).map((t: any) => ({ ...t, category: resolve(t.category, t.type) })),
      installments: (data.installments ?? []).map((i: any) => (i.category ? { ...i, category: resolve(i.category, "gasto") } : i)),
      budgets: (data.budgets ?? []).map((b: any) => ({ ...b, category: resolve(b.category, "gasto") ?? b.category })),
    };
  }

  if (data.schemaVersion === 6) {
    // v7: recordatorio mensual de estado de cuenta (PDF + Excel) por caja.
    data = { ...data, schemaVersion: 7, accountStatements: [] };
  }

  if (data.schemaVersion === 7) {
    // v8: recordatorio mensual de estado de cuenta (PDF + Excel + fecha de vencimiento) por tarjeta.
    data = { ...data, schemaVersion: 8, cardStatements: [] };
  }

  if (data.schemaVersion === 8) {
    // v9: cuenta corriente con terceros (Personas): contactos y sus movimientos de deuda.
    data = { ...data, schemaVersion: 9, contacts: [], contactEntries: [] };
  }

  if (data.schemaVersion === 9) {
    // v10: el bloqueo con clave/Face ID pasa de ser uno solo compartido por
    // toda la app a uno por perfil (relevante ahora que dos logins distintos
    // pueden compartir los mismos datos). El bloqueo global que ya tenías
    // configurado se copia como punto de partida a cada perfil existente,
    // para no desproteger ni volver a pedir setup a nadie; de ahí en más
    // cada uno lo cambia de forma independiente en Configuración > Seguridad.
    const fallbackLock = data.appLock ?? { enabled: false, pinHash: null };
    data = {
      ...data,
      schemaVersion: 10,
      users: (data.users ?? []).map((u: any) => (u.lock ? u : { ...u, lock: fallbackLock })),
    };
  }

  if (data.schemaVersion === 10) {
    // v11: préstamo hipotecario con amortización francesa.
    data = { ...data, schemaVersion: 11, mortgageLoans: [] };
  }

  if (data.schemaVersion === 11) {
    // v12: movimientos recurrentes (suscripciones, sueldo, etc.).
    data = { ...data, schemaVersion: 12, recurringRules: [] };
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
  // Ídem para el permiso "personas".
  const usersConPersonas: AppUser[] = usersConNotas.map((u) =>
    u.permissions?.personas ? u : { ...u, permissions: { ...u.permissions, personas: { view: true, edit: true } } }
  );
  // Ídem para el permiso "hipoteca".
  const usersConHipoteca: AppUser[] = usersConPersonas.map((u) =>
    u.permissions?.hipoteca ? u : { ...u, permissions: { ...u.permissions, hipoteca: { view: true, edit: true } } }
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
    accountStatements: data.accountStatements ?? [],
    cardStatements: data.cardStatements ?? [],
    contacts: data.contacts ?? [],
    contactEntries: data.contactEntries ?? [],
    mortgageLoans: data.mortgageLoans ?? [],
    recurringRules: data.recurringRules ?? [],
    categories: data.categories ?? [],
    notes: data.notes ?? [],
    appLock: data.appLock ?? { enabled: false, pinHash: null },
    sortOrders: data.sortOrders ?? { banks: [], accountsByBank: [], accountsByCurrency: [] },
    users: usersConHipoteca,
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
    const authUserId = auth.user?.id;
    if (!authUserId) return emptyFinanceData();
    const userId = await resolveOwnerId(authUserId);

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
    const authUserId = auth.user?.id;
    if (!authUserId) throw new Error("No hay sesión activa, no se puede guardar.");
    const userId = await resolveOwnerId(authUserId);

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
