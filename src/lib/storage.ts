import { CURRENT_SCHEMA_VERSION, emptyFinanceData, defaultCategories, fullPermissions, type FinanceData, type Category, type AppUser } from "../types";
import { categoryFullPath, repairOrphanCategoryPaths } from "./categories";
import { supabase } from "./supabaseClient";
import { resolveOwnerId } from "./household";
import { mergeFinanceData } from "./merge";

export interface FinanceRepository {
  load(): Promise<FinanceData>;
  /** Guarda y devuelve lo que quedó efectivamente guardado (puede incluir cambios fusionados de otro dispositivo). */
  save(data: FinanceData): Promise<FinanceData>;
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
  let repairCategories = false;

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

  if (data.schemaVersion === 12) {
    // v13: auditoría (alta/modificación/baja) de movimientos, transferencias,
    // pagos de tarjeta, cuotas y movimientos con personas. No hay nada que
    // migrar de datos existentes: el historial arranca vacío a partir de acá,
    // los registros ya cargados simplemente no tienen eventos previos.
    data = { ...data, schemaVersion: 13, auditLog: [] };
  }

  if (data.schemaVersion === 13) {
    // v14: integrantes de familia asignables a gastos/ingresos en las
    // categorías que lo permitan (Configuración → Familia y → Categorías).
    data = { ...data, schemaVersion: 14, familyMembers: [] };
  }

  if (data.schemaVersion === 14) {
    // v15: tiempo en la app por perfil (Configuración → Estadísticas). No hay
    // nada que migrar de datos existentes: el registro arranca vacío a partir de acá.
    data = { ...data, schemaVersion: 15, usageSessions: [] };
  }

  if (data.schemaVersion === 15) {
    // v16: tiempo de cargar/editar cada movimiento puntual (Configuración →
    // Estadísticas). Arranca vacío, igual que usageSessions en la v15.
    data = { ...data, schemaVersion: 16, movementTimings: [] };
  }

  if (data.schemaVersion === 16) {
    // v17: vehículos (Configuración → Vehículos), para requerir vehículo y
    // registrar combustible en las categorías que lo pidan (ver
    // `Category.requiresVehicle`/`trackFuel`). Arranca vacío: no hay nada que
    // migrar de datos existentes.
    data = { ...data, schemaVersion: 17, vehicles: [] };
  }

  if (data.schemaVersion === 17) {
    // v18: módulo Recordatorios (tareas/recordatorios personales o
    // asignados, con recurrencia y notificación push). Arranca vacío: no hay
    // nada que migrar de datos existentes.
    data = { ...data, schemaVersion: 18, reminders: [], reminderRules: [] };
  }

  if (data.schemaVersion === 18) {
    // v19: repara movimientos (y cuotas, presupuestos, recurrentes, hipotecas,
    // contactos) que quedaron con el path de una categoría que se movió de
    // madre antes de que mover reescribiera los paths. Solo reasigna cuando el
    // nombre de la categoría es único (ver repairOrphanCategoryPaths).
    // Se aplica al final, sobre los datos ya normalizados (listas completas).
    repairCategories = true;
    data = { ...data, schemaVersion: 19 };
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
  // Ídem para el permiso "recordatorios".
  const usersConRecordatorios: AppUser[] = usersConHipoteca.map((u) =>
    u.permissions?.recordatorios ? u : { ...u, permissions: { ...u.permissions, recordatorios: { view: true, edit: true } } }
  );

  const normalized: FinanceData = {
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
    familyMembers: data.familyMembers ?? [],
    notes: data.notes ?? [],
    appLock: data.appLock ?? { enabled: false, pinHash: null },
    sortOrders: data.sortOrders ?? { banks: [], accountsByBank: [], accountsByCurrency: [] },
    auditLog: data.auditLog ?? [],
    usageSessions: data.usageSessions ?? [],
    movementTimings: data.movementTimings ?? [],
    vehicles: data.vehicles ?? [],
    reminders: data.reminders ?? [],
    reminderRules: data.reminderRules ?? [],
    users: usersConRecordatorios,
    activeUserId: data.activeUserId ?? null,
  };
  return repairCategories ? repairOrphanCategoryPaths(normalized).data : normalized;
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

  async save(data: FinanceData): Promise<FinanceData> {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return data;
    } catch (err) {
      console.error("Error guardando datos en localStorage.", err);
      throw err;
    }
  }
}

/** Fila de `finance_data` tal como la necesita el repositorio. */
export interface FinanceRow {
  data: unknown;
  /** `updated_at` de la fila, usado como número de versión. */
  version: string;
}

/**
 * Acceso mínimo a la tabla `finance_data`. Separado del repositorio para poder
 * testear la lógica de versiones y fusión con una implementación en memoria.
 */
export interface FinanceRowStore {
  /** Id del dueño de los datos (el propio usuario o el dueño del hogar). Lanza error si no se puede determinar. */
  ownerId(): Promise<string>;
  fetch(ownerId: string): Promise<FinanceRow | null>;
  /** Actualiza solo si la versión sigue siendo `expectedVersion`. Devuelve la versión nueva, o `null` si no se actualizó nada. */
  updateIfVersion(ownerId: string, data: FinanceData, expectedVersion: string): Promise<string | null>;
  /** Crea la fila. Devuelve la versión nueva, o `null` si ya existía. */
  insert(ownerId: string, data: FinanceData): Promise<string | null>;
}

export class ConcurrentSaveError extends Error {}

const supabaseRowStore: FinanceRowStore = {
  async ownerId() {
    const { data: auth, error } = await supabase.auth.getUser();
    if (error) throw error;
    const authUserId = auth.user?.id;
    if (!authUserId) throw new Error("No hay sesión activa.");
    return resolveOwnerId(authUserId);
  },
  async fetch(ownerId) {
    const { data, error } = await supabase.from("finance_data").select("data, updated_at").eq("user_id", ownerId).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    // "" = fila sin `updated_at` (no debería pasar, pero se contempla).
    return { data: data.data, version: data.updated_at ? String(data.updated_at) : "" };
  },
  async updateIfVersion(ownerId, data, expectedVersion) {
    const base = supabase.from("finance_data").update({ data, updated_at: new Date().toISOString() }).eq("user_id", ownerId);
    const filtered = expectedVersion === "" ? base.is("updated_at", null) : base.eq("updated_at", expectedVersion);
    const { data: rows, error } = await filtered.select("updated_at");
    if (error) throw error;
    return rows && rows.length > 0 ? String(rows[0].updated_at) : null;
  },
  async insert(ownerId, data) {
    const { data: rows, error } = await supabase
      .from("finance_data")
      .insert({ user_id: ownerId, data, updated_at: new Date().toISOString() })
      .select("updated_at");
    if (error) {
      if (error.code === "23505") return null; // ya existe la fila (la creó otro dispositivo)
      throw error;
    }
    return rows && rows.length > 0 ? String(rows[0].updated_at) : null;
  },
};

const MAX_SAVE_ATTEMPTS = 4;

/**
 * Repositorio que guarda todo el estado de la app como un único registro JSON
 * en la tabla `finance_data` de Supabase (del usuario o del dueño del hogar).
 *
 * Protecciones contra pérdida de datos:
 *  - `load()` lanza error si no puede leer: nunca devuelve datos vacíos por
 *    un problema de red (antes eso terminaba guardando vacío en la nube).
 *  - `save()` escribe solo si la fila sigue en la versión que leímos
 *    (`updated_at`). Si otro dispositivo guardó en el medio, trae lo nuevo,
 *    fusiona los dos lados (ver lib/merge.ts) y reintenta. Devuelve lo que
 *    quedó efectivamente guardado, que puede incluir cambios del otro lado.
 */
export class SupabaseRepository implements FinanceRepository {
  private ownerIdCache: string | null = null;
  /** Lo último que sabemos que está en el servidor, y su versión. */
  private base: FinanceData | null = null;
  private version: string | null = null;

  constructor(private readonly store: FinanceRowStore = supabaseRowStore) {}

  private async owner(): Promise<string> {
    if (!this.ownerIdCache) this.ownerIdCache = await this.store.ownerId();
    return this.ownerIdCache;
  }

  async load(): Promise<FinanceData> {
    const ownerId = await this.owner();
    const row = await this.store.fetch(ownerId);
    const loaded = row ? migrate(row.data) : emptyFinanceData();
    this.base = loaded;
    this.version = row?.version ?? null;
    return loaded;
  }

  async save(data: FinanceData): Promise<FinanceData> {
    if (!this.base) throw new Error("No se puede guardar antes de cargar los datos.");
    const ownerId = await this.owner();
    let toWrite = data;

    for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt++) {
      const newVersion =
        this.version === null
          ? await this.store.insert(ownerId, toWrite)
          : await this.store.updateIfVersion(ownerId, toWrite, this.version);

      if (newVersion !== null) {
        this.base = toWrite;
        this.version = newVersion;
        return toWrite;
      }

      // No se escribió: alguien guardó en el medio (o la fila no existe / no hay permiso).
      const remoteRow = await this.store.fetch(ownerId);
      if (!remoteRow) {
        if (this.version === null) throw new Error("No se pudo crear el registro de datos.");
        throw new Error("El registro de datos ya no existe en el servidor.");
      }
      if (remoteRow.version === this.version) {
        // Nadie cambió nada y aun así no se pudo escribir: es un problema de permisos, no un conflicto.
        throw new Error("El servidor rechazó el guardado (sin permiso para modificar los datos).");
      }
      const remote = migrate(remoteRow.data);
      toWrite = mergeFinanceData(this.base, toWrite, remote);
      this.base = remote;
      this.version = remoteRow.version;
    }
    throw new ConcurrentSaveError("Otros dispositivos están guardando a la vez. Probá de nuevo en unos segundos.");
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
