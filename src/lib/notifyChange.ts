import type {
  FinanceData, NotifiableModuleKey, Transaction, Transfer, Installment, CardPayment,
  Note, ContactEntry, MortgageLoan, Budget, Bank, Account, Card, CardStatement, AccountStatement,
} from "../types";
import { supabase } from "./supabaseClient";
import { formatMoney } from "./money";

/** Qué campos de FinanceData corresponden a cada módulo notificable. */
const FIELDS_BY_CATEGORY: Record<NotifiableModuleKey, (keyof FinanceData)[]> = {
  movimientos: ["transactions", "transfers", "installments", "cardPayments"],
  cuentas: ["banks", "accounts", "accountStatements"],
  tarjetas: ["cards", "cardStatements"],
  presupuestos: ["budgets"],
  notas: ["notes"],
  personas: ["contacts", "contactEntries"],
  hipoteca: ["mortgageLoans"],
};

/**
 * Compara dos estados de FinanceData y devuelve qué módulos "notificables"
 * cambiaron (se agregó, editó o borró algo). Compara por contenido (no solo
 * por longitud) para no perderse ediciones que no cambian la cantidad de
 * elementos. Deliberadamente ignora otros campos (users, appLock,
 * sortOrders, categories, activeUserId, schemaVersion): esos son ajustes de
 * configuración/preferencias, no "alguien cargó algo".
 */
export function detectChangedCategories(prev: FinanceData, next: FinanceData): NotifiableModuleKey[] {
  const changed: NotifiableModuleKey[] = [];
  (Object.keys(FIELDS_BY_CATEGORY) as NotifiableModuleKey[]).forEach((key) => {
    const fields = FIELDS_BY_CATEGORY[key];
    const isDifferent = fields.some((f) => JSON.stringify(prev[f]) !== JSON.stringify(next[f]));
    if (isDifferent) changed.push(key);
  });
  return changed;
}

function byId<T extends { id: string }>(arr: T[]): Map<string, T> {
  return new Map(arr.map((x) => [x.id, x]));
}

/** Elementos nuevos (id que no estaba antes) y editados (mismo id, contenido distinto). No incluye borrados: no aportan tanto detalle y complican el mensaje. */
function diffArray<T extends { id: string }>(prevArr: T[], nextArr: T[]): { added: T[]; edited: T[] } {
  const prevMap = byId(prevArr);
  const added: T[] = [];
  const edited: T[] = [];
  for (const item of nextArr) {
    const old = prevMap.get(item.id);
    if (!old) added.push(item);
    else if (JSON.stringify(old) !== JSON.stringify(item)) edited.push(item);
  }
  return { added, edited };
}

const lastSegment = (path?: string) => (path ? path.split(">").pop()!.trim() : undefined);

function describeTransaction(t: Transaction, verb: string): string {
  const kind = t.type === "gasto" ? "gasto" : "ingreso";
  const cat = lastSegment(t.category);
  return `${verb} un ${kind} de ${formatMoney(t.amountMinor, t.currency)}${cat ? ` en ${cat}` : ""}`;
}
function describeTransfer(t: Transfer, verb: string): string {
  return `${verb} una transferencia de ${formatMoney(t.fromAmountMinor, "UYU")}`;
}
function describeInstallment(i: Installment, verb: string): string {
  return `${verb} una compra en cuotas: ${i.description} (${formatMoney(i.totalAmountMinor, i.currency)}, ${i.numInstallments} cuotas)`;
}
function describeCardPayment(p: CardPayment, verb: string): string {
  return `${verb} un pago de tarjeta de ${formatMoney(p.amountMinor, p.currency)}`;
}
function describeNote(n: Note, verb: string): string {
  const preview = n.text.trim().slice(0, 60);
  return `${verb} una nota: "${preview}${n.text.trim().length > 60 ? "…" : ""}"`;
}
function describeContactEntry(e: ContactEntry, verb: string): string {
  return `${verb} un movimiento de personas de ${formatMoney(Math.abs(e.amountMinor), e.currency)}: ${e.description}`;
}
function describeMortgageLoan(m: MortgageLoan, verb: string): string {
  return `${verb} el préstamo "${m.name}"`;
}
function describeBudget(b: Budget, verb: string): string {
  const cat = lastSegment(b.category);
  return `${verb} un presupuesto${cat ? ` de ${cat}` : ""}: ${formatMoney(b.limitMinor, b.currency)}`;
}
function describeBank(b: Bank, verb: string): string {
  return `${verb} el banco "${b.name}"`;
}
function describeAccount(a: Account, verb: string): string {
  return `${verb} la caja "${a.name}"`;
}
function describeCard(c: Card, verb: string): string {
  return `${verb} la tarjeta "${c.name}"`;
}

/**
 * Arma, por cada módulo que cambió, una lista de líneas de detalle legibles
 * ("agregó un gasto de $500 en Alimentación") para que la notificación diga
 * algo concreto en vez de solo el nombre del módulo. Los estados de
 * cuenta/tarjeta (AccountStatement/CardStatement) no se detallan uno por uno
 * (son archivos adjuntos, no hay mucho para describir en una línea corta).
 */
export function describeChangesByCategory(prev: FinanceData, next: FinanceData): Record<NotifiableModuleKey, string[]> {
  const result: Record<NotifiableModuleKey, string[]> = {
    movimientos: [],
    cuentas: [],
    tarjetas: [],
    presupuestos: [],
    notas: [],
    personas: [],
    hipoteca: [],
  };

  const pushDiff = <T extends { id: string }>(
    category: NotifiableModuleKey,
    prevArr: T[],
    nextArr: T[],
    describe: (item: T, verb: string) => string
  ) => {
    const { added, edited } = diffArray(prevArr, nextArr);
    added.forEach((item) => result[category].push(describe(item, "Agregó")));
    edited.forEach((item) => result[category].push(describe(item, "Editó")));
  };

  pushDiff("movimientos", prev.transactions, next.transactions, describeTransaction);
  pushDiff("movimientos", prev.transfers, next.transfers, describeTransfer);
  pushDiff("movimientos", prev.installments, next.installments, describeInstallment);
  pushDiff("movimientos", prev.cardPayments, next.cardPayments, describeCardPayment);

  pushDiff("cuentas", prev.banks, next.banks, describeBank);
  pushDiff("cuentas", prev.accounts, next.accounts, describeAccount);
  if (JSON.stringify(prev.accountStatements) !== JSON.stringify(next.accountStatements)) {
    const { added, edited } = diffArray<AccountStatement>(prev.accountStatements, next.accountStatements);
    if (added.length || edited.length) result.cuentas.push("Actualizó un estado de cuenta");
  }

  pushDiff("tarjetas", prev.cards, next.cards, describeCard);
  if (JSON.stringify(prev.cardStatements) !== JSON.stringify(next.cardStatements)) {
    const { added, edited } = diffArray<CardStatement>(prev.cardStatements, next.cardStatements);
    if (added.length || edited.length) result.tarjetas.push("Actualizó un estado de cuenta de tarjeta");
  }

  pushDiff("presupuestos", prev.budgets, next.budgets, describeBudget);
  pushDiff("notas", prev.notes, next.notes, describeNote);
  pushDiff("personas", prev.contactEntries, next.contactEntries, describeContactEntry);
  pushDiff("hipoteca", prev.mortgageLoans, next.mortgageLoans, describeMortgageLoan);

  return result;
}

/**
 * Avisa (fire-and-forget) a la Edge Function `notify-change` de que este
 * perfil hizo cambios en ciertos módulos, con el detalle de qué cambió, para
 * que le mande un push a los demás perfiles del hogar que lo tengan
 * habilitado. No bloquea ni rompe el guardado si falla (ej. función todavía
 * no desplegada): solo lo loguea.
 */
export function notifyOtherDevices(
  actorUserId: string,
  actorName: string,
  changesByCategory: Record<NotifiableModuleKey, string[]>
): void {
  const categories = (Object.keys(changesByCategory) as NotifiableModuleKey[]).filter(
    (k) => changesByCategory[k].length > 0
  );
  if (categories.length === 0) return;
  const details = categories.flatMap((k) => changesByCategory[k]).slice(0, 5);

  supabase.functions
    .invoke("notify-change", { body: { actorUserId, actorName, categories, details } })
    .then(({ data, error }) => {
      if (error) console.error("No se pudo avisar a otros dispositivos.", error);
      else console.log("[notify-change]", data);
    })
    .catch((err) => console.error("No se pudo avisar a otros dispositivos.", err));
}
