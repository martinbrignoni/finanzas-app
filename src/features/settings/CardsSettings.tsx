import { CreditCard, Landmark, Pencil, Trash2, Plus } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { IconBtn, Segment } from "../../components/ui";
import { cardLabel } from "../../lib/cards";
import { formatMoney } from "../../lib/money";
import type { Bank, Card } from "../../types";

/**
 * Alta, edición y baja de tarjetas de crédito (antes se hacía directamente
 * desde Tarjetas, que ahora es solo para ver consumo/deuda; los gastos y
 * pagos se cargan desde el "+" de Movimientos). El banco emisor, día de
 * cierre/vencimiento, límite y extensiones se administran acá.
 */
export function CardsSettings({
  cards,
  banks,
  canEdit,
  onAdd,
  onEdit,
  onDelete,
  onUpdate,
}: {
  cards: Card[];
  banks: Bank[];
  canEdit: boolean;
  onAdd: () => void;
  onEdit: (c: Card) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, partial: Partial<Card>) => void;
}) {
  const unassignedCards = cards.filter((c) => !c.bankId || !banks.some((b) => b.id === c.bankId));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs" style={{ color: C.textMuted }}>
          Cierre, vencimiento, límite y titulares adicionales de cada tarjeta.
        </p>
        {canEdit && banks.length > 0 && (
          <button
            onClick={onAdd}
            aria-label="Nueva tarjeta"
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 ml-2"
            style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text }}
          >
            <Plus size={18} />
          </button>
        )}
      </div>

      {canEdit && banks.length === 0 && (
        <div className="rounded-xl p-4 text-center text-xs mb-3" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textFaint }}>
          Agregá primero un banco en Cajas y Bancos para poder crear tarjetas.
        </div>
      )}

      {cards.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: C.textMuted }}>
          Todavía no agregaste tarjetas.
        </p>
      ) : (
        <div className="space-y-4">
          {banks.map((bank) => {
            const bankCards = cards.filter((c) => c.bankId === bank.id);
            if (bankCards.length === 0) return null;
            return (
              <div key={bank.id}>
                <div className="flex items-center gap-1.5 mb-2 px-1">
                  <Landmark size={13} color={C.textFaint} />
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.textFaint }}>{bank.name}</span>
                </div>
                <div className="space-y-2">
                  {bankCards.map((card) => (
                    <CardSettingsRow key={card.id} card={card} banks={banks} canEdit={canEdit} onEdit={onEdit} onDelete={onDelete} onUpdate={onUpdate} />
                  ))}
                </div>
              </div>
            );
          })}

          {unassignedCards.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2 px-1">
                <CreditCard size={13} color={C.textFaint} />
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.textFaint }}>Sin banco asignado</span>
              </div>
              <div className="space-y-2">
                {unassignedCards.map((card) => (
                  <CardSettingsRow key={card.id} card={card} banks={banks} canEdit={canEdit} onEdit={onEdit} onDelete={onDelete} onUpdate={onUpdate} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CardSettingsRow({
  card,
  banks,
  canEdit,
  onEdit,
  onDelete,
  onUpdate,
}: {
  card: Card;
  banks: Bank[];
  canEdit: boolean;
  onEdit: (c: Card) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, partial: Partial<Card>) => void;
}) {
  const active = card.active !== false;
  return (
    <div className="rounded-xl p-3" style={{ background: C.surface, border: `1px solid ${C.border}`, opacity: active ? 1 : 0.75 }}>
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: C.surface3 }}>
          <CreditCard size={15} color={C.usd} />
        </div>
        <div className="min-w-0">
          <div className="text-sm truncate" style={{ color: C.text }}>{cardLabel(card, banks)}</div>
          <div className="text-xs" style={{ color: C.textFaint }}>
            Cierre día {card.closingDay} · Vence día {card.dueDay}
            {card.creditLimitMinor != null && ` · Límite ${formatMoney(card.creditLimitMinor, card.creditLimitCurrency ?? "UYU")}`}
            {card.extensions && card.extensions.length > 0 && ` · ${card.extensions.length} extensión${card.extensions.length > 1 ? "es" : ""}`}
          </div>
        </div>
      </div>
      {canEdit && (
        <div className="flex gap-1 shrink-0">
          <IconBtn label="Editar tarjeta" onClick={() => onEdit(card)}><Pencil size={15} /></IconBtn>
          <IconBtn label="Eliminar tarjeta" danger onClick={() => onDelete(card.id)}><Trash2 size={15} /></IconBtn>
        </div>
      )}
    </div>
      {canEdit && (
        <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5" style={{ borderTop: `1px solid ${C.border}` }}>
          <span className="text-[11px]" style={{ color: C.textFaint }}>
            {active
              ? "Aparece para elegir al cargar gastos."
              : "No aparece para cargar gastos nuevos. Conserva su historia y, si tiene deuda, sigue en Vencimientos."}
          </span>
          <Segment
            value={active ? "on" : "off"}
            onChange={(v) => onUpdate(card.id, { active: v === "on" ? undefined : false })}
            options={[{ value: "on", label: "Activa" }, { value: "off", label: "Inactiva" }]}
          />
        </div>
      )}
    </div>
  );
}
