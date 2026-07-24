import type { Card, Bank } from "../types";

/**
 * Nombre a mostrar de una tarjeta con su banco emisor delante (ej. "ITAU
 * Visa"), para distinguirla de tarjetas iguales de otros bancos en selects y
 * listados (varias tarjetas pueden llamarse igual, ej. "Visa" en dos bancos
 * distintos).
 */
export function cardLabel(card: Card | undefined, banks: Bank[]): string {
  if (!card) return "tarjeta eliminada";
  const bank = banks.find((b) => b.id === card.bankId);
  return bank ? `${bank.name} ${card.name}` : card.name;
}
