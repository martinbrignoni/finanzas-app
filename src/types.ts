export type Currency = "UYU" | "USD";
export type TransactionType = "ingreso" | "gasto";

/**
 * Todos los montos se guardan en "unidades mínimas" (equivalente a centésimos),
 * como enteros. Nunca se opera con decimales de punto flotante para plata.
 * Usar lib/money.ts (toMinor/fromMinor) para convertir desde/hacia el input del usuario.
 */
export interface Transaction {
  id: string;
  type: TransactionType;
  amountMinor: number;
  currency: Currency;
  /**
   * Identifica la categoría por su "path" completo (ej. "Gastos domésticos >
   * Transporte"), no solo el nombre de la hoja: dos categorías en ramas
   * distintas pueden llamarse igual y no son la misma. Ver
   * `lib/categories.ts#categoryFullPath`.
   *
   * Opcional a propósito: permite cargar un movimiento rápido sin elegir
   * categoría (ni medio de pago) y categorizarlo después. Ver el filtro de
   * "pendientes de asignar" en Movimientos.
   */
  category?: string;
  date: string; // YYYY-MM-DD
  note?: string;
  /** Cuenta bancaria asociada (opcional: un movimiento puede no estar ligado a ninguna cuenta). */
  accountId?: string;
  /**
   * Tarjeta de crédito con la que se pagó este gasto (pago único, sin cuotas).
   * Mutuamente excluyente con `accountId`: un movimiento se paga con una cuenta
   * o con una tarjeta, no con ambas. No afecta el saldo de ninguna cuenta hasta
   * que se registre el pago de esa tarjeta (CardPayment); mientras tanto suma
   * a la "deuda pendiente" de la tarjeta en la sección Tarjetas.
   */
  cardId?: string;
  /**
   * Ruta (no URL) del comprobante adjunto en el bucket "receipts" de Supabase
   * Storage, con forma `${userId}/${archivo}`. Se resuelve a una URL firmada
   * (temporal) recién al momento de mostrarla, porque el bucket es privado.
   * @deprecated usar `receiptPaths` (varios comprobantes). Se mantiene para
   * leer movimientos guardados antes de permitir más de uno; ver
   * `lib/receipts.ts#receiptPathsOf`.
   */
  receiptPath?: string;
  /** Rutas de los comprobantes adjuntos (0 o más). Reemplaza a `receiptPath`. */
  receiptPaths?: string[];
  /** Perfil (AppUser.id) que cargó este movimiento. `undefined` en movimientos guardados antes de este campo. */
  createdByUserId?: string;
}

export interface Bank {
  id: string;
  name: string;
  /** Si está activo, las cajas de este banco piden número de sucursal (ej. Santander). Configurable en Configuración → Bancos. */
  usesBranch?: boolean;
}

export interface Account {
  id: string;
  bankId: string;
  name: string; // ej. "Caja de ahorro", "Cuenta corriente"
  currency: Currency;
  initialBalanceMinor: number;
  /** Nombre del titular de la cuenta (puede no coincidir con quien usa la app, ej. cuenta a nombre de la esposa). */
  holderName?: string;
  /** Número de cuenta, para poder compartir los datos bancarios cuando te piden hacerte una transferencia. */
  accountNumber?: string;
  /** Sucursal (solo tiene sentido si el banco tiene `usesBranch` activo). */
  branch?: string;
  /**
   * Si es `false`, la caja queda oculta en el menú Cuentas y no aparece para
   * elegir al registrar un movimiento nuevo (pero sigue existiendo: sirve
   * para "mapear" cuentas que casi no usás sin que ensucien la vista).
   * `undefined` se trata como activa, para no requerir migración.
   */
  active?: boolean;
  /**
   * Fecha (YYYY-MM-DD) en la que se desactivó la caja por última vez. Se fija
   * automáticamente al pasar de activa a inactiva, para poder seguir viendo
   * la caja en Cuentas cuando se consulta el saldo a una fecha anterior a la
   * desactivación (aunque hoy esté inactiva). No se usa si `active` es `true`.
   */
  inactiveSince?: string;
  /**
   * Mensaje literal a usar al tocar "Compartir datos bancarios" en vez del
   * texto armado automáticamente (banco, cuenta, moneda, sucursal, número,
   * titular). Se edita en Configuración → Bancos.
   */
  shareMessage?: string;
  /** Si está activo, se recuerda mensualmente adjuntar el estado de cuenta (PDF y Excel) de esta caja. */
  statementReminders?: boolean;
  /**
   * Mes (YYYY-MM) desde el que se empiezan a pedir estados de cuenta. Se fija
   * al activar el recordatorio (no al crear la caja), para no reclamar
   * retroactivamente meses de antes de haberlo prendido.
   */
  statementRemindersSince?: string;
}

/**
 * Estado de cuenta bancario de una caja para un mes puntual, en PDF y/o
 * Excel. Es un respaldo a nivel de cuenta (no de un movimiento puntual), por
 * eso vive separado de los comprobantes de Transaction/Transfer/CardPayment.
 */
export interface AccountStatement {
  id: string;
  accountId: string;
  month: string; // YYYY-MM
  /** Ruta (no URL) en el bucket "receipts" de Supabase Storage. */
  pdfPath?: string;
  /** Ruta (no URL) en el bucket "receipts" de Supabase Storage. */
  excelPath?: string;
}

/**
 * Movimiento de dinero entre dos cuentas propias (no es ingreso ni gasto real,
 * por eso vive separado de Transaction y no entra en los totales de
 * ingresos/gastos, presupuestos ni proyección).
 *
 * Si origen y destino tienen distinta moneda, `fromAmountMinor` es lo que sale
 * de la cuenta origen (en su moneda) y `toAmountMinor` lo que entra en la
 * cuenta destino (en su moneda); `exchangeRate` queda solo como referencia de
 * la cotización usada.
 */
export interface Transfer {
  id: string;
  date: string; // YYYY-MM-DD
  fromAccountId: string;
  toAccountId: string;
  fromAmountMinor: number;
  toAmountMinor: number;
  exchangeRate?: number;
  note?: string;
  /** @deprecated ver Transaction.receiptPath. */
  receiptPath?: string;
  /** Rutas de los comprobantes adjuntos (0 o más). */
  receiptPaths?: string[];
  /** Perfil (AppUser.id) que cargó este movimiento. */
  createdByUserId?: string;
}

export interface Card {
  id: string;
  name: string;
  closingDay: number; // 1-31
  dueDay: number; // 1-31
  /** Si está activo, se recuerda mensualmente adjuntar el estado de cuenta (PDF y Excel) de esta tarjeta. */
  statementReminders?: boolean;
  /**
   * Mes (YYYY-MM) desde el que se empiezan a pedir estados de cuenta. Se fija
   * al activar el recordatorio (no al crear la tarjeta), para no reclamar
   * retroactivamente meses de antes de haberlo prendido.
   */
  statementRemindersSince?: string;
}

/**
 * Estado de cuenta de una tarjeta de crédito para un período puntual (mes en
 * que cierra), en PDF y/o Excel. Al cargarlo se pide también la fecha real de
 * vencimiento de ese período (puede correrse por fin de semana o feriado
 * respecto al día fijo `Card.dueDay`).
 */
export interface CardStatement {
  id: string;
  cardId: string;
  month: string; // YYYY-MM (período que cierra ese mes)
  /** Ruta (no URL) en el bucket "receipts" de Supabase Storage. */
  pdfPath?: string;
  /** Ruta (no URL) en el bucket "receipts" de Supabase Storage. */
  excelPath?: string;
  /** Fecha real (YYYY-MM-DD) de vencimiento de este período. */
  dueDate?: string;
}

export interface Installment {
  id: string;
  cardId: string;
  description: string;
  currency: Currency;
  totalAmountMinor: number;
  numInstallments: number;
  startMonth: string; // YYYY-MM
  installmentAmountMinor: number;
  /**
   * Fecha real de la compra y demás campos "de movimiento", agregados cuando
   * las compras en cuotas se unificaron con el modal de Nuevo movimiento.
   * Opcionales por compatibilidad con compras en cuotas cargadas antes.
   */
  date?: string; // YYYY-MM-DD
  category?: string;
  note?: string;
  /** @deprecated ver Transaction.receiptPath. */
  receiptPath?: string;
  /** Rutas de los comprobantes adjuntos (0 o más). */
  receiptPaths?: string[];
  /** Perfil (AppUser.id) que cargó este movimiento. */
  createdByUserId?: string;
}

/**
 * Pago real de una tarjeta de crédito: dinero que efectivamente salió de una
 * cuenta propia para cancelar (total o parcialmente) el resumen de la
 * tarjeta. Se guarda separado de Installment: las cuotas son la proyección
 * de la deuda contraída, esto es el movimiento de caja real que la salda.
 */
export interface CardPayment {
  id: string;
  cardId: string;
  accountId: string;
  date: string; // YYYY-MM-DD
  amountMinor: number;
  currency: Currency;
  note?: string;
  /** @deprecated ver Transaction.receiptPath. */
  receiptPath?: string;
  /** Rutas de los comprobantes adjuntos (0 o más). */
  receiptPaths?: string[];
  /** Perfil (AppUser.id) que cargó este movimiento. */
  createdByUserId?: string;
}

export interface Budget {
  id: string;
  /** Path completo de la categoría (ver `Transaction.category`). */
  category: string;
  currency: Currency;
  limitMinor: number;
}

/** Categoría administrable por el usuario (antes eran constantes fijas en el código). */
export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  /**
   * Categoría padre en la jerarquía Categoría madre → Categoría → Subcategoría.
   * Sin `parentId`, es una Categoría madre (primer nivel). Opcional por
   * compatibilidad con categorías cargadas antes de este esquema: todas
   * quedan como categoría madre automáticamente.
   */
  parentId?: string;
}

/**
 * Persona o empresa con la que llevás una cuenta corriente informal: plata
 * que vos ponés por ella o que ella pone por vos, y que se salda de vez en
 * cuando (ej. un amigo, un cliente del estudio, tu padre). No es un usuario
 * de la app, solo un contacto para llevar la cuenta.
 */
export interface Contact {
  id: string;
  name: string;
  /**
   * Etiqueta libre para organizar y filtrar (ej. "Personas", "Clientes",
   * "Familia"). Sin categoría, el contacto queda sin agrupar.
   */
  category?: string;
  note?: string;
}

/**
 * Movimiento de la cuenta corriente con un `Contact`. `amountMinor` es un
 * monto con signo: positivo suma a favor tuyo (le pagaste algo, le
 * prestaste plata, o te está devolviendo menos de lo que te debía);
 * negativo resta a favor tuyo (te pagó, te devolvió plata, o le debés vos).
 * El saldo de un contacto es la suma de sus entries por moneda: positivo =
 * te debe, negativo = le debés.
 *
 * Si `accountId` está cargado, el movimiento también impacta el saldo real
 * de esa caja: sale plata de la cuenta cuando `amountMinor` es positivo
 * (vos pusiste la plata), entra cuando es negativo (recibiste plata). Sin
 * `accountId`, es solo informativo y no mueve ninguna cuenta (ej. "mi papá
 * pagó directamente la luz de mi casa", sin que pase por una cuenta tuya).
 */
export interface ContactEntry {
  id: string;
  contactId: string;
  date: string; // YYYY-MM-DD
  amountMinor: number;
  currency: Currency;
  description: string;
  accountId?: string;
  receiptPaths?: string[];
}

/**
 * Amortización extraordinaria (pago extra de capital) sobre un préstamo
 * hipotecario. Al aplicarse, según `strategy`, se recalcula toda la tabla de
 * amortización desde ese punto en adelante:
 * - "reduceInstallment": el plazo original no cambia, pero la cuota baja
 *   (mismo número de cuotas restantes, con el nuevo saldo).
 * - "reduceTerm": la cuota queda igual, pero el préstamo se cancela antes
 *   (se recalcula cuántas cuotas hacen falta con ese mismo importe).
 * No se puede bajar cuota y plazo a la vez con un mismo pago extra.
 */
export interface MortgagePrepayment {
  id: string;
  date: string; // YYYY-MM-DD. Se aplica junto con la primera cuota cuyo vencimiento sea igual o posterior.
  amountMinor: number;
  strategy: "reduceInstallment" | "reduceTerm";
  note?: string;
}

/**
 * Moneda de un préstamo. Además de pesos y dólares, los préstamos
 * hipotecarios en Uruguay suelen pactarse en Unidades Indexadas (UI),
 * ajustadas por inflación. No es lo mismo que `Currency` (la de cuentas y
 * movimientos), que no incluye UI.
 */
export type MortgageCurrency = "UYU" | "USD" | "UI";

/**
 * Sistema de amortización del préstamo:
 * - "frances": cuota fija; el interés baja y la amortización de capital sube
 *   mes a mes. El más común en préstamos personales e hipotecarios.
 * - "aleman": amortización de capital fija por período; la cuota total baja
 *   mes a mes porque el interés se calcula sobre un saldo cada vez menor.
 * - "americano": durante el plazo solo se pagan intereses; el capital se
 *   cancela entero en la última cuota ("bullet").
 * Sin definir, se asume "frances" (compatibilidad con préstamos cargados
 * antes de agregar este campo).
 */
export type AmortizationSystem = "frances" | "aleman" | "americano";

/**
 * Préstamo con amortización por sistema francés, alemán o americano (ver
 * `system`). La tabla de amortización completa (cuota, interés, capital,
 * saldo por período) se calcula siempre a partir de estos datos base + las
 * amortizaciones extraordinarias, nunca se guarda cuota por cuota. Ver
 * `lib/mortgage.ts#buildSchedule`.
 */
export interface MortgageLoan {
  id: string;
  name: string;
  principalMinor: number;
  currency: MortgageCurrency;
  /**
   * Tasa anual en porcentaje (ej. 4.5 para 4.5% anual). Su significado
   * depende de `rateType`:
   * - "nominal" (TNA): se divide entre 12 para obtener la tasa mensual
   *   (ej. 12% anual -> 1% mensual). Es la convención de préstamos
   *   personales/prendarios.
   * - "effective" (TEA): es la tasa anual real ya compuesta; la tasa
   *   mensual equivalente se obtiene con `(1+TEA)^(1/12) - 1`, que da un
   *   valor mensual más bajo que TNA/12. Es la convención habitual con la
   *   que los bancos en Uruguay cotizan los préstamos hipotecarios,
   *   sobre todo en UI.
   * Sin definir = "nominal" (compatibilidad con préstamos cargados antes
   * de agregar este campo).
   */
  annualRatePct: number;
  rateType?: "nominal" | "effective";
  /** Plazo de amortización regular en meses (ej. 240 para 20 años), sin contar los meses de gracia. */
  termMonths: number;
  /** Fecha de la primera cuota (de gracia, si hay, o si no la primera regular). Las siguientes vencen el mismo día de cada mes. */
  startDate: string; // YYYY-MM-DD
  /**
   * Fecha en que se solicitó/desembolsó el préstamo. Informativa: sirve para
   * ver cuánto tiempo pasa hasta la primera cuota (lo normal es ~1 mes). El
   * cálculo de intereses de la primera cuota siempre asume ese mes completo
   * a partir de `startDate` hacia atrás, así que si el desfasaje real no es
   * de un mes exacto, este dato es solo de referencia y no ajusta la tabla.
   */
  requestDate?: string; // YYYY-MM-DD
  /** Cantidad de cuotas de gracia al inicio del préstamo, antes de que arranque la amortización regular. 0 o sin definir = sin gracia. */
  gracePeriodMonths?: number;
  /**
   * Qué pasa con el interés durante el período de gracia (solo aplica si
   * `gracePeriodMonths` > 0):
   * - "interestOnly": se paga solo el interés cada cuota de gracia; el saldo no baja.
   * - "capitalized": no se paga nada; el interés se suma al saldo, que crece
   *   hasta que arranca la amortización regular.
   * Sin definir = "interestOnly".
   */
  graceType?: "interestOnly" | "capitalized";
  /** Sin definir = "frances" (préstamos cargados antes de agregar este campo). */
  system?: AmortizationSystem;
  /**
   * Ajuste manual, en centésimos, para reconciliar contra la cuota real que
   * cobra el banco cuando queda una diferencia mínima que no se puede
   * replicar exacto (redondeo de tasa, convención de días, etc.). Se suma
   * (puede ser negativo) al interés y a la cuota de cada período regular
   * (no a los de gracia); no toca la amortización de capital ni el saldo,
   * que siguen el cálculo teórico. Sin definir o 0 = sin ajuste.
   */
  paymentAdjustmentMinor?: number;
  prepayments: MortgagePrepayment[];
  note?: string;
  /**
   * Datos informativos de referencia en USD: no afectan el cálculo de la
   * cuota (que siempre se hace en `currency`/`principalMinor`), pero son
   * útiles en préstamos en UYU/UI donde el valor de la propiedad y el
   * importe solicitado suelen pactarse en dólares.
   */
  propertyValueUsdMinor?: number;
  requestedAmountUsdMinor?: number;
  /**
   * TC USD -> UYU y cotización de la UI (en pesos) a la fecha del préstamo,
   * sugeridos automáticamente desde Cotizaciones pero editables. Se usan
   * solo para mostrar la conversión de `requestedAmountUsdMinor` a pesos y UI.
   */
  referenceUsdToUyuRate?: number;
  referenceUiRate?: number;
}

/**
 * Cada módulo/pestaña de la app es una "clave de permiso". Se usa tanto para
 * decidir qué pestañas ve un usuario como qué puede modificar en cada una.
 */
export type PermissionKey =
  | "inicio"
  | "movimientos"
  | "cuentas"
  | "tarjetas"
  | "presupuestos"
  | "proyeccion"
  | "cotizaciones"
  | "notas"
  | "personas"
  | "hipoteca"
  | "configuracion";

export const PERMISSION_MODULES: { key: PermissionKey; label: string }[] = [
  { key: "inicio", label: "Inicio" },
  { key: "movimientos", label: "Movimientos" },
  { key: "cuentas", label: "Cuentas" },
  { key: "tarjetas", label: "Tarjetas" },
  { key: "presupuestos", label: "Presupuestos" },
  { key: "proyeccion", label: "Proyección" },
  { key: "cotizaciones", label: "Cotizaciones" },
  { key: "notas", label: "Notas" },
  { key: "personas", label: "Personas" },
  { key: "hipoteca", label: "Hipoteca" },
  { key: "configuracion", label: "Configuración" },
];

export interface ModulePermission {
  view: boolean;
  edit: boolean; // agregar/editar/eliminar dentro del módulo (implica view)
}

export type PermissionSet = Record<PermissionKey, ModulePermission>;

/**
 * IMPORTANTE: esto es una organización de la interfaz, no seguridad real.
 * No hay contraseña ni backend detrás: cualquiera con acceso al navegador
 * puede ver todos los datos igual. Sirve para evitar errores por descuido
 * entre personas de confianza que comparten la app, no para proteger
 * información de gente que no debería verla.
 */
export interface AppUser {
  id: string;
  name: string;
  permissions: PermissionSet;
  /**
   * Email de un login de Supabase Auth separado (ej. el de tu pareja) que
   * queda "atado" a este perfil: cuando esa persona inicia sesión con su
   * propio usuario, la app la fija automáticamente en este perfil y le
   * oculta el selector de perfiles, salvo que `isAdmin` sea true.
   */
  authEmail?: string;
  /**
   * Superusuario: puede ver y cambiar entre todos los perfiles, sin importar
   * con qué login de Supabase Auth haya entrado.
   */
  isAdmin?: boolean;
  /**
   * Bloqueo con clave/Face ID-Touch ID propio de este perfil (independiente
   * del de otros perfiles). Si no está definido, el perfil no pide nada al
   * abrir la app.
   */
  lock?: AppLock;
  /**
   * Color del avatar de este perfil en Movimientos (ej. "MB" en verde). Si
   * no se eligió ninguno, se asigna uno automático y estable en base al id.
   */
  color?: string;
  /** Preferencia de notificaciones push de este perfil. Sin definir = desactivadas. */
  notifications?: NotificationPrefs;
}

/**
 * Subconjunto de módulos sobre los que tiene sentido avisar "otro perfil hizo
 * un cambio" (se excluyen inicio/proyección/cotizaciones/configuración, que
 * no son datos que alguien "carga" y por ende no generan aviso).
 */
export type NotifiableModuleKey = Extract<
  PermissionKey,
  "movimientos" | "cuentas" | "tarjetas" | "presupuestos" | "notas" | "personas" | "hipoteca"
>;

export const NOTIFIABLE_MODULES: { key: NotifiableModuleKey; label: string }[] = PERMISSION_MODULES.filter(
  (m): m is { key: NotifiableModuleKey; label: string } =>
    (["movimientos", "cuentas", "tarjetas", "presupuestos", "notas", "personas", "hipoteca"] as PermissionKey[]).includes(m.key)
);

/**
 * Preferencia de notificaciones push de un perfil: si quiere recibir avisos
 * cuando OTRO perfil del mismo hogar carga o cambia algo, y sobre qué
 * módulos. No tiene nada que ver con la suscripción técnica del navegador
 * (eso vive en la tabla `push_subscriptions`, por dispositivo): esto es solo
 * la preferencia de la persona, compartida entre todos sus dispositivos.
 */
export interface NotificationPrefs {
  enabled: boolean;
  /** Por módulo: `false` explícito lo excluye. Sin entrada = incluido (default true mientras `enabled` sea true). */
  categories: Partial<Record<NotifiableModuleKey, boolean>>;
}

/** Nota de texto libre dejada por un perfil, visible para todos los perfiles que comparten la app. */
export interface Note {
  id: string;
  /** Perfil (AppUser.id) que escribió la nota. */
  userId: string;
  text: string;
  createdAt: string; // ISO datetime
  updatedAt?: string; // ISO datetime
}

/**
 * Bloqueo de acceso a la app (además del login de Supabase): un PIN que se
 * pide cada vez que se abre la app, con Face ID/Touch ID como atajo opcional.
 * Es una pantalla de privacidad local, no una capa de seguridad real del
 * servidor (el PIN se guarda hasheado, pero cualquiera con la sesión de
 * Supabase iniciada y sin el PIN igual podría acceder a los datos vía
 * Supabase directamente). El registro de Face ID/Touch ID (WebAuthn) queda
 * guardado por dispositivo/navegador, no viaja con este dato sincronizado.
 */
export interface AppLock {
  enabled: boolean;
  /** Hash SHA-256 (hex) del PIN. `null` si todavía no se configuró ninguno. */
  pinHash: string | null;
}

/**
 * Orden manual (persistente hasta que el usuario lo cambie) de bancos y
 * cajas en la sección Cuentas. Guarda arrays de ids; los elementos que no
 * aparecen todavía en el array (bancos/cajas nuevos) se ubican al final, en
 * el orden en que ya venían. El orden de "Por banco" y el de "Por moneda"
 * son independientes entre sí.
 */
export interface SortOrders {
  /** Orden de los bancos en la vista "Por banco". */
  banks: string[];
  /** Orden de las cajas dentro de cada banco, en la vista "Por banco". */
  accountsByBank: string[];
  /** Orden de las cajas dentro de cada moneda, en la vista "Por moneda". */
  accountsByCurrency: string[];
}

export interface FinanceData {
  schemaVersion: number;
  transactions: Transaction[];
  cards: Card[];
  installments: Installment[];
  budgets: Budget[];
  banks: Bank[];
  accounts: Account[];
  transfers: Transfer[];
  cardPayments: CardPayment[];
  accountStatements: AccountStatement[];
  cardStatements: CardStatement[];
  contacts: Contact[];
  contactEntries: ContactEntry[];
  mortgageLoans: MortgageLoan[];
  categories: Category[];
  notes: Note[];
  appLock: AppLock;
  sortOrders: SortOrders;
  users: AppUser[];
  /** Perfil actualmente activo en este navegador. */
  activeUserId: string | null;
}

export const CURRENT_SCHEMA_VERSION = 11;

/** Solo se usan para poblar categorías por defecto en instalaciones nuevas o migraciones. */
export const DEFAULT_EXPENSE_CATEGORY_NAMES = [
  "Alimentación",
  "Vivienda",
  "Transporte",
  "Salud",
  "Ocio",
  "Servicios",
  "Educación",
  "Otros",
];

export const DEFAULT_INCOME_CATEGORY_NAMES = ["Sueldo", "Freelance", "Otros ingresos"];

export function fullPermissions(value: boolean): PermissionSet {
  const set = {} as PermissionSet;
  PERMISSION_MODULES.forEach((m) => {
    set[m.key] = { view: value, edit: value };
  });
  return set;
}

export function defaultCategories(): Category[] {
  return [
    ...DEFAULT_EXPENSE_CATEGORY_NAMES.map((name) => ({ id: crypto.randomUUID(), name, type: "gasto" as const })),
    ...DEFAULT_INCOME_CATEGORY_NAMES.map((name) => ({ id: crypto.randomUUID(), name, type: "ingreso" as const })),
  ];
}

export function emptyFinanceData(): FinanceData {
  const adminId = crypto.randomUUID();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    transactions: [],
    cards: [],
    installments: [],
    budgets: [],
    banks: [],
    accounts: [],
    transfers: [],
    cardPayments: [],
    accountStatements: [],
    cardStatements: [],
    contacts: [],
    contactEntries: [],
    mortgageLoans: [],
    categories: defaultCategories(),
    notes: [],
    appLock: { enabled: false, pinHash: null },
    sortOrders: { banks: [], accountsByBank: [], accountsByCurrency: [] },
    users: [{ id: adminId, name: "Yo", permissions: fullPermissions(true) }],
    activeUserId: adminId,
  };
}
