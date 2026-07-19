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
  category: string;
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
   */
  receiptPath?: string;
}

export interface Bank {
  id: string;
  name: string;
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
  /** Ruta del comprobante adjunto en Supabase Storage (ver Transaction.receiptPath). */
  receiptPath?: string;
}

export interface Card {
  id: string;
  name: string;
  closingDay: number; // 1-31
  dueDay: number; // 1-31
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
  receiptPath?: string;
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
  /** Ruta del comprobante adjunto en Supabase Storage (ver Transaction.receiptPath). */
  receiptPath?: string;
}

export interface Budget {
  id: string;
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
  | "configuracion";

export const PERMISSION_MODULES: { key: PermissionKey; label: string }[] = [
  { key: "inicio", label: "Inicio" },
  { key: "movimientos", label: "Movimientos" },
  { key: "cuentas", label: "Cuentas" },
  { key: "tarjetas", label: "Tarjetas" },
  { key: "presupuestos", label: "Presupuestos" },
  { key: "proyeccion", label: "Proyección" },
  { key: "cotizaciones", label: "Cotizaciones" },
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
  categories: Category[];
  users: AppUser[];
  /** Perfil actualmente activo en este navegador. */
  activeUserId: string | null;
}

export const CURRENT_SCHEMA_VERSION = 5;

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
    categories: defaultCategories(),
    users: [{ id: adminId, name: "Yo", permissions: fullPermissions(true) }],
    activeUserId: adminId,
  };
}
