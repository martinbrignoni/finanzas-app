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
   * Con qué tarjeta física se pagó, cuando la tarjeta (`cardId`) tiene
   * extensiones cargadas: el id de un `CardExtension` de esa tarjeta.
   * `undefined` significa "el titular". No tiene efecto si la tarjeta no
   * tiene extensiones o si el gasto no se pagó con tarjeta.
   */
  cardExtensionId?: string;
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
  /** Fecha/hora ISO de creación del registro (no la fecha del gasto). Usado para desempatar el orden en Movimientos. */
  createdAt?: string;
  /** Fecha/hora ISO de la última modificación. Usado para desempatar el orden en Movimientos. */
  updatedAt?: string;
  /**
   * Si este movimiento se generó automáticamente a partir de una regla
   * recurrente (ver `RecurringRule`), acá queda su id. Editar o eliminar este
   * movimiento no afecta a la regla ni a otras ocurrencias ya generadas.
   */
  recurringRuleId?: string;
  /**
   * Si este movimiento es el pago de la cuota de un préstamo hipotecario
   * (ver `MortgageLoan`), acá queda su id. Se usa solo para que Inicio deje
   * de mostrar la cuota de este mes en "Vencimientos" una vez cargado el
   * movimiento; no afecta el cálculo de la tabla de amortización (siempre
   * teórica, ver `lib/mortgage.ts`), ni el saldo/proyección del préstamo.
   */
  mortgageLoanId?: string;
  /**
   * A qué integrante(s) de la familia corresponde este gasto/ingreso (ej. una
   * clase de tenis de Luli, una salida con las nenas), solo relevante cuando
   * la categoría elegida tiene `allowFamilyMembers` (ver `Category` y
   * `FamilyMember`). Puede ser uno, varios, o quedar vacío/sin definir.
   */
  familyMemberIds?: string[];
  /**
   * Reparto opcional del monto entre los integrantes elegidos en
   * `familyMemberIds` (ej. comprarle ropa a dos hijas por montos distintos:
   * cada una con lo suyo, en vez de solo compartir la etiqueta). Clave =
   * `FamilyMember.id`, valor = monto en unidades mínimas. Si no está
   * cargado (o falta algún integrante), se entiende que el monto es
   * compartido entre todos sin desglosar (ej. un almuerzo en familia).
   */
  familyMemberAmounts?: Record<string, number>;
  /**
   * Fecha/hora ISO en que este movimiento quedó marcado como conciliado
   * contra un estado de cuenta o un archivo de movimientos subido (ver
   * Cuentas → Conciliar y `lib/reconciliation.ts`). `undefined` = todavía no
   * se conciliò (o se conciliò y después se desmarcó).
   */
  reconciledAt?: string;
  /**
   * Para Ingresos en una categoría con `Category.trackOrders` activo (ej.
   * MINUCHI > Ventas): qué representa este cobro dentro del pedido. Siempre
   * va acompañado de `orderNumber`.
   */
  orderType?: "pedido" | "sena" | "saldo";
  /** Número de pedido asignado a mano por el usuario (texto libre: puede tener formato "P-123"). Ver `orderType`. */
  orderNumber?: string;
  /**
   * Vehículo (ver `Vehicle`, Configuración → Vehículos) al que corresponde
   * este gasto, obligatorio cuando la categoría elegida tiene
   * `Category.requiresVehicle` (o `trackFuel`) activo.
   */
  vehicleId?: string;
  /** Litros cargados, solo en una categoría con `Category.trackFuel` activo (ej. Combustible). Opcional. */
  fuelLiters?: number;
  /** Kilómetros recorridos desde la carga anterior. Opcional. */
  fuelKmPartial?: number;
  /** Kilómetros totales del odómetro al momento de la carga. Opcional. */
  fuelKmTotal?: number;
}

/**
 * Vehículo (ej. "Auto Martín", "Moto") al que se le puede asignar un gasto en
 * las categorías que lo requieran (ver `Category.requiresVehicle`/
 * `trackFuel` y `Transaction.vehicleId`). Se administra en Configuración →
 * Vehículos.
 */
export interface Vehicle {
  id: string;
  name: string;
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
  /**
   * Nombre de la hoja (pestaña) del Excel que se sube en Cuentas → Conciliar
   * para identificar cuál corresponde a esta caja, cuando el archivo trae
   * varias cuentas/tarjetas juntas en un mismo libro. Sin definir = se usa
   * `name` tal cual.
   */
  reconciliationSheetName?: string;
  /**
   * Último archivo de conciliación subido para esta caja que todavía no fue
   * reemplazado por otro ni por el estado oficial (ver Conciliar movimientos).
   * Se guarda para no perderlo al cerrar el modal: sirve para ir cargando
   * movimientos pendientes de a poco y volver a revisar sin tener que
   * resubir el archivo cada vez. Se limpia solo al subir un archivo "Estado
   * oficial" (ya no hace falta seguir arrastrándolo) o al subir uno nuevo
   * (lo reemplaza).
   */
  reconciliationDraft?: ReconciliationDraft;
}

/** Ver `Account.reconciliationDraft`. */
export interface ReconciliationDraft {
  fileName: string;
  /** Fecha y hora ISO completa (no solo YYYY-MM-DD) en que se subió este archivo. */
  uploadedAt: string;
  lines: { date: string; description: string; amountMinor: number }[];
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
  /** Fecha/hora ISO de creación del registro (no la fecha del movimiento). Usado para desempatar el orden en Movimientos. */
  createdAt?: string;
  /** Fecha/hora ISO de la última modificación. Usado para desempatar el orden en Movimientos. */
  updatedAt?: string;
  /** Ver `Transaction.reconciledAt`. */
  reconciledAt?: string;
}

/** Titular adicional ("extensión") de una tarjeta: alguien más con su propia tarjeta física sobre la misma línea. */
export interface CardExtension {
  id: string;
  name: string; // ej. "Luli"
  /**
   * Perfil (`AppUser.id`) al que corresponde esta extensión, si es uno de
   * los perfiles de la app. Cuando ese perfil está activo y elige esta
   * tarjeta en Nuevo Movimiento, se preselecciona esta extensión en vez de
   * "Titular" (ver `defaultCardExtensionId` en Transactions.tsx). Opcional:
   * no hace falta vincularla si la extensión no corresponde a ningún perfil.
   */
  linkedUserId?: string;
}

export interface Card {
  id: string;
  name: string;
  /**
   * Banco emisor de esta tarjeta (Bank.id). Opcional solo por compatibilidad
   * con tarjetas cargadas antes de que existiera este campo: al crear una
   * tarjeta nueva se pide elegir un banco.
   */
  bankId?: string;
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
  /**
   * Titulares adicionales ("extensiones") de esta tarjeta, si los hay (ej. una
   * extensión a nombre de tu pareja). Vacío o `undefined` = solo vos la usás.
   * Editable en cualquier momento: una tarjeta puede empezar sin extensiones
   * y sumar una más adelante, o al revés.
   */
  extensions?: CardExtension[];
  /**
   * Límite de crédito de la tarjeta, como dato informativo: no bloquea ni
   * valida gastos, solo se muestra en Tarjetas para tenerlo a mano. Opcional
   * (no todas las tarjetas lo tienen cargado) y editable en cualquier momento.
   */
  creditLimitMinor?: number;
  /** Moneda del límite de crédito. Solo se usa si `creditLimitMinor` está cargado. */
  creditLimitCurrency?: Currency;
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
  /** Fecha/hora ISO de creación del registro (no la fecha de la compra). Usado para desempatar el orden en Movimientos. */
  createdAt?: string;
  /** Fecha/hora ISO de la última modificación. Usado para desempatar el orden en Movimientos. */
  updatedAt?: string;
  /** Con qué tarjeta física se hizo la compra, si la tarjeta tiene extensiones (ver Transaction.cardExtensionId). */
  cardExtensionId?: string;
  /** Ver `Transaction.familyMemberIds`. */
  familyMemberIds?: string[];
  /** Ver `Transaction.familyMemberAmounts`. */
  familyMemberAmounts?: Record<string, number>;
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
  /** Fecha/hora ISO de creación del registro (no la fecha del pago). Usado para desempatar el orden en Movimientos. */
  createdAt?: string;
  /** Fecha/hora ISO de la última modificación. Usado para desempatar el orden en Movimientos. */
  updatedAt?: string;
  /** Ver `Transaction.reconciledAt`. */
  reconciledAt?: string;
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
  /**
   * Si está activo, al cargar un gasto o ingreso en esta categoría puntual
   * (no se hereda automáticamente a subcategorías: cada una se activa por
   * separado) se puede elegir a qué integrante(s) de la familia corresponde
   * (ver `FamilyMember` y `Transaction.familyMemberIds`). Pensado para gastos
   * como una clase o una salida que a veces es de uno, a veces de otro.
   */
  allowFamilyMembers?: boolean;
  /**
   * Si está activo, al cargar un Ingreso en esta categoría puntual (se hereda
   * a las que cuelguen de ella, igual que `allowFamilyMembers`) se pide
   * elegir qué es el cobro (Pedido / Seña pedido / Saldo pedido) y un número
   * de pedido (ver `Transaction.orderType`/`orderNumber`). Pensado para
   * MINUCHI > Ventas.
   */
  trackOrders?: boolean;
  /**
   * Si está activo, al cargar un Gasto en esta categoría puntual (se hereda a
   * las que cuelguen de ella, igual que `trackOrders`) es obligatorio elegir
   * un vehículo (ver `Vehicle` y `Transaction.vehicleId`). Pensado para
   * Transporte. `trackFuel` implica esto mismo, aunque no esté tildado acá.
   */
  requiresVehicle?: boolean;
  /**
   * Si está activo, al cargar un Gasto en esta categoría puntual (se hereda
   * igual que `requiresVehicle`) se piden además litros, km parciales y km
   * totales (todos opcionales, ver `Transaction.fuelLiters`/`fuelKmPartial`/
   * `fuelKmTotal`), y se exige elegir vehículo igual que con
   * `requiresVehicle`. Pensado para Combustible.
   */
  trackFuel?: boolean;
}

/**
 * Integrante de la familia (ej. vos, tu pareja, tus hijas) al que se le puede
 * asignar un gasto o ingreso puntual en las categorías que lo permitan (ver
 * `Category.allowFamilyMembers`). Se administra en Configuración → Familia.
 */
export interface FamilyMember {
  id: string;
  name: string;
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
  /**
   * "persona" (default, sin definir = "persona"): alguien con quien llevás
   * una cuenta corriente duradera (amigo, familiar, cliente); sigue
   * apareciendo en Personas aunque el saldo llegue a cero.
   * "concepto": una discriminación puntual para agrupar un gasto que vas a
   * cobrar de una o varias fuentes sin que te importe demasiado quiénes son
   * (ej. "Regalo cumpleaños Juan"). Una vez que el saldo llega a cero en
   * todas las monedas, deja de mostrarse en la lista principal de Personas
   * (ver `lib/contacts.ts#isContactSettled`); los movimientos ya cargados
   * siguen visibles en Movimientos como cualquier otro.
   */
  kind?: "persona" | "concepto";
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
 *
 * Si en cambio `cardId` está cargado (mutuamente excluyente con `accountId`),
 * el movimiento se pagó con esa tarjeta de crédito propia: suma al consumo y
 * a la deuda pendiente de la tarjeta igual que un gasto con tarjeta (ver
 * `lib/cards.ts#cardConsumptionForMonth`), pero SIN contar como gasto tuyo
 * (no entra en Ingresos/Gastos, presupuestos ni proyección) — el signo de
 * `amountMinor` sigue rigiendo solo la cuenta corriente con la persona, no
 * si hubo o no cargo a la tarjeta.
 */
export interface ContactEntry {
  id: string;
  contactId: string;
  date: string; // YYYY-MM-DD
  amountMinor: number;
  currency: Currency;
  description: string;
  accountId?: string;
  /** Tarjeta de crédito con la que se pagó (ver comentario de la interfaz). Mutuamente excluyente con `accountId`. */
  cardId?: string;
  /** Con qué tarjeta física se pagó, si `cardId` tiene extensiones cargadas (ver `Transaction.cardExtensionId`). */
  cardExtensionId?: string;
  /** Si `cardId` está cargado y el gasto que originó este movimiento se pagó en cuotas, cuántas (solo informativo, se muestra junto a la tarjeta). */
  numInstallments?: number;
  receiptPaths?: string[];
  /** Perfil (AppUser.id) que cargó este movimiento. `undefined` en movimientos guardados antes de este campo. */
  createdByUserId?: string;
  /** Fecha/hora ISO de creación del registro (no la fecha del movimiento). Usado para desempatar el orden en Movimientos. */
  createdAt?: string;
  /** Fecha/hora ISO de la última modificación. Usado para desempatar el orden en Movimientos. */
  updatedAt?: string;
  /** Ver `Transaction.reconciledAt`. */
  reconciledAt?: string;
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
 *
 * Con `dayCountConvention: "actual365"` (ver `MortgageLoan`), `date` no tiene
 * que coincidir con un vencimiento existente: si cae entre dos vencimientos,
 * se liquida en una fila propia (interés devengado día a día desde el último
 * vencimiento pagado) y TODOS los vencimientos siguientes pasan a caer en el
 * mismo día del mes que esta fecha (igual que hace el banco al restructurar:
 * ver ejemplo real documentado en `mortgage.ts#buildFrenchScheduleActual365`).
 * Con la convención "monthly" (default), en cambio, se sigue aplicando junto
 * con la primera cuota cuyo vencimiento sea igual o posterior, sin correr el
 * día del mes.
 */
export interface MortgagePrepayment {
  id: string;
  date: string; // YYYY-MM-DD.
  amountMinor: number;
  strategy: "reduceInstallment" | "reduceTerm";
  note?: string;
}

/**
 * Cómo se calcula el interés de cada cuota de un préstamo francés:
 * - "monthly" (default): interés = saldo × tasa mensual, sin importar cuántos
 *   días tenga ese mes en particular (todos los meses "pesan" igual). Es la
 *   convención de la mayoría de los préstamos personales/prendarios.
 * - "actual365": interés = saldo × (TNA/365) × días corridos reales entre
 *   vencimientos (28, 29, 30 o 31 según el mes). Es la convención real que
 *   usan los préstamos hipotecarios en UI en Uruguay (verificada contra dos
 *   vales reales de Santander — ver comentario largo en
 *   `mortgage.ts#buildFrenchScheduleActual365`). Con esta convención, una
 *   amortización extraordinaria que no coincide con un vencimiento corre el
 *   día de vencimiento de ahí en adelante (ver `MortgagePrepayment`).
 * Solo tiene efecto con `system: "frances"` (o sin definir, que es lo mismo);
 * se ignora en "aleman"/"americano".
 */
export type DayCountConvention = "monthly" | "actual365";

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
   * Fecha en que se solicitó/desembolsó el préstamo.
   * - Con `dayCountConvention: "monthly"` (default): informativa, no ajusta
   *   la tabla — el cálculo de intereses de la primera cuota siempre asume
   *   un mes completo exacto a partir de `startDate` hacia atrás.
   * - Con `"actual365"`: SÍ afecta el cálculo — el interés de la primera
   *   cuota se devenga por los días reales entre esta fecha y `startDate`
   *   (que casi nunca es exactamente un mes: en el hipotecario UI real que
   *   se usó para validar esta convención, fueron 29 días, no 30). Cargarla
   *   bien acá es importante para que la cuota 1 (y por lo tanto toda la
   *   tabla, que arrastra el saldo de ahí) cierre lo más cerca posible de la
   *   real del banco.
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
   * Cómo se calcula el interés de cada cuota (solo tiene efecto con
   * `system: "frances"`). Ver `DayCountConvention`. Sin definir = "monthly"
   * (préstamos cargados antes de agregar este campo, y la convención
   * correcta para préstamos que no son el hipotecario UI en Uruguay).
   */
  dayCountConvention?: DayCountConvention;
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
  /**
   * Categoría (ruta completa) a la que se imputa la cuota generada
   * automáticamente al vencer (ver `lib/mortgage.ts#generateDueMortgagePayments`).
   * Sin definir (o sin `paymentAccountId`/`paymentAutomationStartDate`) = no
   * se generan cuotas solas para este préstamo. En préstamos en UI, la cuota
   * (en UI) se convierte a UYU con la cotización de la UI más cercana a la
   * fecha de vencimiento (antes o después, ver `fetchNearestRateForDate`),
   * porque `Transaction.currency` no admite "UI" — el movimiento generado
   * queda en UYU, editable después si el banco terminó cobrando con otra
   * cotización.
   */
  paymentCategory?: string;
  /** Cuenta desde la que se debita la cuota generada automáticamente (en UYU si el préstamo está en UI, o en la moneda del préstamo si es UYU/USD). */
  paymentAccountId?: string;
  /**
   * A partir de qué fecha (inclusive) se generan cuotas solas: los
   * vencimientos anteriores a esta fecha no se reclaman en "Vencimientos" ni
   * se generan como movimiento (se consideran ya resueltos/pagos). Se
   * completa sola con la fecha de hoy la primera vez que se cargan
   * `paymentCategory`/`paymentAccountId`, pero se puede editar.
   */
  paymentAutomationStartDate?: string; // YYYY-MM-DD
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
  | "recordatorios"
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
  { key: "recordatorios", label: "Recordatorios" },
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
  /**
   * Qué vista quedó elegida en Cuentas ("Por banco" o "Por moneda") para este
   * perfil en particular (cada perfil la mantiene de forma independiente).
   * `undefined` (perfil nuevo o dato guardado antes de este campo) se trata
   * como "banco".
   */
  accountsViewMode?: "banco" | "moneda";
}

/**
 * Subconjunto de módulos sobre los que tiene sentido avisar "otro perfil hizo
 * un cambio" (se excluyen inicio/proyección/cotizaciones/configuración, que
 * no son datos que alguien "carga" y por ende no generan aviso).
 */
export type NotifiableModuleKey = Extract<
  PermissionKey,
  "movimientos" | "cuentas" | "tarjetas" | "presupuestos" | "notas" | "personas" | "hipoteca" | "recordatorios"
>;

export const NOTIFIABLE_MODULES: { key: NotifiableModuleKey; label: string }[] = PERMISSION_MODULES.filter(
  (m): m is { key: NotifiableModuleKey; label: string } =>
    (["movimientos", "cuentas", "tarjetas", "presupuestos", "notas", "personas", "hipoteca", "recordatorios"] as PermissionKey[]).includes(m.key)
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

export type RecurrencePeriod = "diaria" | "semanal" | "mensual" | "trimestral" | "anual";

export const RECURRENCE_PERIOD_LABELS: Record<RecurrencePeriod, string> = {
  diaria: "Diaria",
  semanal: "Semanal",
  mensual: "Mensual",
  trimestral: "Trimestral",
  anual: "Anual",
};

/**
 * Regla de un movimiento (gasto o ingreso) que se repite solo, sin tener que
 * cargarlo a mano cada vez (ej. una suscripción, el sueldo, un alquiler).
 * Cada vez que se abre la app se generan como `Transaction` normales (ver
 * `lib/recurring.ts`) todas las ocurrencias vencidas desde `nextDueDate`
 * hasta hoy, y `nextDueDate` avanza un período. Los movimientos ya generados
 * quedan totalmente editables/eliminables como cualquier otro (ver
 * `Transaction.recurringRuleId`); cambiar el monto acá solo afecta a las
 * ocurrencias futuras, no a las ya generadas.
 */
export interface RecurringRule {
  id: string;
  type: TransactionType;
  /** Ej. "Netflix", "Sueldo". Se usa como categoría/nota si no se elige una categoría. */
  description: string;
  amountMinor: number;
  currency: Currency;
  category?: string;
  note?: string;
  accountId?: string;
  /** Solo aplica si `type` es "gasto" (igual que en Transaction). */
  cardId?: string;
  /**
   * IVA Compras (gasto) / IVA Ventas (ingreso), igual que en el modal de
   * Nuevo Movimiento: cada ocurrencia generada registra el monto neto
   * (`amountMinor` menos este importe) y, aparte, un movimiento en Personas
   * contra Gustavo Brignoni por este importe (ver `lib/recurring.ts` y
   * `lib/contacts.ts#IVA_CONTACT_NAME`).
   */
  ivaAmountMinor?: number;
  /**
   * Persona/concepto como medio de pago (mutuamente excluyente con
   * `accountId`/`cardId`): cada ocurrencia generada registra además un
   * movimiento en Personas con este contacto. Si `personaAmountMinor` no
   * está cargado, se asume el 100% de `amountMinor`.
   */
  personaContactId?: string;
  personaAmountMinor?: number;
  period: RecurrencePeriod;
  /** Próxima fecha (YYYY-MM-DD) en que corresponde generar el movimiento. */
  nextDueDate: string;
  /** Si es `false`, no se generan más ocurrencias ("dar de baja"), pero se conserva el historial ya generado. */
  active: boolean;
  createdByUserId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type ReminderPriority = "baja" | "media" | "alta";

export const REMINDER_PRIORITY_LABELS: Record<ReminderPriority, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
};

/** Un ítem de checklist dentro de un recordatorio/tarea (ver `Reminder.subtasks`). */
export interface ReminderSubtask {
  id: string;
  text: string;
  done: boolean;
}

/**
 * Recordatorio o tarea puntual del módulo Recordatorios: personal (sin
 * asignar a nadie, visible solo para quien lo creó) o compartido/asignado a
 * uno o más perfiles del hogar (ver `AppUser`). Se puede ver como lista o
 * como calendario.
 *
 * Si `notify` está activo y tiene `time` cargado, se manda una notificación
 * push a los perfiles de `assignedUserIds` (o al creador si no hay nadie
 * asignado) a esa fecha/hora exacta, aunque la app esté cerrada — lo hace la
 * función programada `supabase/functions/send-reminders`, que corre cada
 * pocos minutos (ver `notifiedAt`). Sin `time` (recordatorio "de todo el
 * día") no se manda push puntual, aunque `notify` esté activo.
 */
export interface Reminder {
  id: string;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  /** HH:MM (24hs). Sin definir = "todo el día". */
  time?: string;
  priority: ReminderPriority;
  /** Perfiles (AppUser.id) a los que corresponde. Vacío = personal (ver comentario de la interfaz). */
  assignedUserIds: string[];
  /** Perfil (AppUser.id) que lo creó. `undefined` en registros muy viejos (no debería pasar en la práctica: el módulo nace después de este campo existir). */
  createdByUserId?: string;
  done: boolean;
  doneAt?: string;
  subtasks?: ReminderSubtask[];
  /** Si esta ocurrencia se generó a partir de una `ReminderRule` recurrente, el id de esa regla. Editar/completar/borrar esta ocurrencia no afecta a la regla ni a otras ocurrencias. */
  reminderRuleId?: string;
  /** Si está activo, se manda push a los asignados en la fecha/hora (ver comentario de la interfaz). */
  notify: boolean;
  /** Fecha/hora ISO en que efectivamente se mandó el push de este recordatorio, para no reenviarlo. `undefined` = todavía no se mandó (o no corresponde: sin `time`, o ya pasó la fecha sin que corriera la función). */
  notifiedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Regla de un recordatorio/tarea que se repite solo (ej. "sacar la basura
 * todos los lunes", "pagar tal servicio el día 10 de cada mes"), sin tener
 * que cargarlo a mano cada vez. Funciona igual que `RecurringRule` (ver
 * `lib/recurring.ts`) pero para `Reminder`: tanto al abrir la app como en
 * cada corrida de la función programada de notificaciones (ver
 * `Reminder.notify`) se generan como `Reminder` normales todas las
 * ocurrencias vencidas desde `nextDueDate`, y `nextDueDate` avanza un
 * período. Cada ocurrencia generada queda totalmente independiente:
 * completarla, editarla o borrarla no afecta a la regla ni a otras
 * ocurrencias ya generadas.
 */
export interface ReminderRule {
  id: string;
  title: string;
  description?: string;
  time?: string;
  priority: ReminderPriority;
  assignedUserIds: string[];
  /** Texto de las subtareas a copiar (con `done: false`) en cada ocurrencia nueva. */
  subtasksTemplate?: string[];
  notify: boolean;
  period: RecurrencePeriod;
  /** Próxima fecha (YYYY-MM-DD) en que corresponde generar el recordatorio. */
  nextDueDate: string;
  /** Si es `false`, no se generan más ocurrencias ("dar de baja"), pero se conserva el historial ya generado. */
  active: boolean;
  createdByUserId?: string;
  createdAt?: string;
  updatedAt?: string;
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

/** Tipo de registro del libro mayor que puede quedar auditado (ver `AuditEntry`). */
export type AuditEntityType = "transaction" | "transfer" | "cardPayment" | "installment" | "contactEntry";

export type AuditAction = "create" | "update" | "delete";

/** Un campo que cambió en una modificación, ya en texto listo para mostrar (ver `lib/audit.ts`). */
export interface AuditFieldChange {
  field: string;
  before: string;
  after: string;
}

/**
 * Evento de auditoría: alta, modificación o baja de un movimiento,
 * transferencia, pago de tarjeta, cuota o movimiento con personas. Se guarda
 * aparte del registro en sí (no como parte de `Transaction`, etc.) para que
 * la baja también quede registrada aunque el registro ya no exista, y para
 * no perder el historial de una edición aunque el registro se borre después.
 * `summary` y los textos de `changes` quedan fijados en el momento en que
 * ocurrió el evento (no se recalculan después), para poder seguir
 * identificando de qué se trataba aunque después se borren o renombren la
 * cuenta, tarjeta, categoría o persona relacionadas.
 */
export interface AuditEntry {
  id: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  /** Fecha/hora ISO en que ocurrió el alta, la modificación o la baja. */
  at: string;
  /** Perfil (AppUser.id) que hizo el cambio. `null` si no se pudo determinar. */
  userId: string | null;
  /** Texto descriptivo del registro (ej. "Alimentación · $ 1.500 · 12/03/2026"), para identificarlo aunque se haya borrado. */
  summary: string;
  /** Solo en "update": qué campos cambiaron, de antes a después. Ausente si la acción no fue una modificación. */
  changes?: AuditFieldChange[];
}

/**
 * Bloque continuo de tiempo que un perfil pasó con la app abierta y visible
 * (ver Configuración → Estadísticas y `lib/usage.ts`). Se abre uno nuevo al
 * activar un perfil o al volver a poner la pestaña en primer plano, y se
 * cierra (fijando `durationSeconds` final) cuando la pestaña pasa a segundo
 * plano, se cierra, o se cambia de perfil activo. Mientras un bloque sigue
 * abierto, se va actualizando cada pocos minutos (no en cada segundo, para no
 * multiplicar los guardados) para no perder casi nada si el navegador se
 * cierra de golpe.
 *
 * OJO: si el mismo perfil tiene la app abierta en dos dispositivos a la vez,
 * el tiempo de ambos se cuenta por separado (no hay forma simple de saber si
 * es la misma "presencia" sin instrumentar mucho más); para el uso
 * personal/familiar de esta app, alcanza como aproximación. Ver
 * `MovementTimingEntry` para el tiempo puntual de cargar/editar un movimiento
 * (algo más chico y específico que esto).
 */
export interface UsageSession {
  id: string;
  /** Perfil (AppUser.id) dueño de este bloque. */
  userId: string;
  /** Fecha (YYYY-MM-DD) en que empezó el bloque, para agrupar por período igual que el resto de Estadísticas. */
  date: string;
  startedAt: string; // ISO datetime
  /** Último momento confirmado activo dentro de este bloque (se actualiza mientras sigue abierto). */
  lastActiveAt: string; // ISO datetime
  /** Duración de este bloque hasta `lastActiveAt`, en segundos. */
  durationSeconds: number;
}

/**
 * Cuánto tardó cargar o editar un movimiento puntual (gasto/ingreso,
 * transferencia, pago de tarjeta, cuota o movimiento con persona): desde que
 * se abrió el modal (con "+" para uno nuevo, o "Editar" sobre uno existente)
 * hasta que se tocó "Guardar" con éxito. Se guarda una entrada por cada vez
 * que se guarda (no se pisa ni se acumula en el momento): si un mismo
 * registro se edita varias veces, hay una entrada por cada edición, y el
 * tiempo total dedicado a ese registro puntual es la suma de todas — ver
 * Configuración → Estadísticas, que promedia estas entradas. No se registra
 * nada si se cierra el modal sin guardar (cancelar no cuenta).
 */
/** Tipo de movimiento a efectos de tiempo/estadísticas (mismo vocabulario que `StatKind` en `lib/statistics.ts`). */
export type MovementTimingKind = "gasto" | "ingreso" | "transferencia" | "pagoTarjeta" | "cuotas" | "personas";

export interface MovementTimingEntry {
  id: string;
  /** Perfil (AppUser.id) que guardó. `undefined` si no había perfil activo. */
  userId?: string;
  /** "create" = el modal se abrió para cargar un movimiento nuevo. "edit" = se abrió con "Editar" sobre uno existente. */
  action: "create" | "edit";
  kind: MovementTimingKind;
  /** Id del registro guardado (`Transaction`/`Transfer`/`CardPayment`/`Installment`/`ContactEntry`), para poder sumar el tiempo total dedicado a un registro puntual si se lo edita más de una vez. */
  entityId: string;
  /** Segundos entre abrir el modal y guardar. */
  seconds: number;
  /** Fecha (YYYY-MM-DD) en que se guardó, para agrupar por período igual que el resto de Estadísticas. */
  date: string;
  at: string; // ISO datetime completo
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
  recurringRules: RecurringRule[];
  categories: Category[];
  familyMembers: FamilyMember[];
  notes: Note[];
  appLock: AppLock;
  sortOrders: SortOrders;
  /** Historial de altas/modificaciones/bajas de movimientos, transferencias, pagos de tarjeta, cuotas y movimientos con personas. Ver "Auditoría" en Configuración. */
  auditLog: AuditEntry[];
  /** Bloques de tiempo con la app abierta por perfil, ver `UsageSession`. Se muestra en Configuración → Estadísticas. */
  usageSessions: UsageSession[];
  /** Tiempo de cargar/editar cada movimiento puntual, ver `MovementTimingEntry`. Se muestra en Configuración → Estadísticas. */
  movementTimings: MovementTimingEntry[];
  /** Vehículos administrables en Configuración → Vehículos, ver `Vehicle`. */
  vehicles: Vehicle[];
  /** Recordatorios/tareas puntuales del módulo Recordatorios, ver `Reminder`. */
  reminders: Reminder[];
  /** Reglas de recordatorios/tareas recurrentes, ver `ReminderRule`. */
  reminderRules: ReminderRule[];
  users: AppUser[];
  /** Perfil actualmente activo en este navegador. */
  activeUserId: string | null;
}

export const CURRENT_SCHEMA_VERSION = 18;

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
    recurringRules: [],
    categories: defaultCategories(),
    familyMembers: [],
    notes: [],
    appLock: { enabled: false, pinHash: null },
    sortOrders: { banks: [], accountsByBank: [], accountsByCurrency: [] },
    auditLog: [],
    usageSessions: [],
    movementTimings: [],
    vehicles: [],
    reminders: [],
    reminderRules: [],
    users: [{ id: adminId, name: "Yo", permissions: fullPermissions(true) }],
    activeUserId: adminId,
  };
}
