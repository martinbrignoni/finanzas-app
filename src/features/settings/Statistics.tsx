import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { theme as C } from "../../styles/theme";
import { Segment } from "../../components/ui";
import { UserBadge } from "../../components/UserBadge";
import { computeStatistics, STAT_KIND_LABELS, STAT_PERIOD_LABELS, type StatPeriod, type StatCount } from "../../lib/statistics";
import { accountLabel } from "../../lib/accounts";
import { cardLabel } from "../../lib/cards";
import { categoryDisplayName } from "../../lib/categories";
import type { FinanceData, AppUser, Account, Bank, Card, Category } from "../../types";

function StatBarList({
  title,
  items,
  emptyText = "Sin datos en este período.",
  renderLabel,
}: {
  title: string;
  items: StatCount<string | undefined>[];
  emptyText?: string;
  renderLabel: (key: string | undefined) => ReactNode;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="rounded-xl p-3 mb-3" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      <div className="text-xs font-semibold mb-2" style={{ color: C.textMuted }}>{title}</div>
      {items.length === 0 ? (
        <p className="text-xs" style={{ color: C.textFaint }}>{emptyText}</p>
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => (
            <div key={item.key ?? "__none__"}>
              <div className="flex items-center justify-between gap-2 text-xs mb-1">
                <span className="min-w-0 truncate flex items-center gap-1.5" style={{ color: C.text }}>{renderLabel(item.key)}</span>
                <span className="font-mono shrink-0" style={{ color: C.textMuted }}>{item.count}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.surface2 }}>
                <div className="h-full rounded-full" style={{ width: `${(item.count / max) * 100}%`, background: C.usd }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Conteos de movimientos (gastos/ingresos, transferencias, pagos de tarjeta,
 * compras en cuotas y movimientos con personas) agrupados por perfil, cuenta,
 * tarjeta, categoría y tipo, con filtro de período. Solo lectura, calculado
 * sobre los datos ya guardados: no requiere ni agrega tracking nuevo (a
 * diferencia de, por ejemplo, "tiempo en la app", que queda para más
 * adelante porque necesitaría instrumentar la app desde cero).
 */
export function StatisticsSettings({
  data,
  users,
  accounts,
  banks,
  cards,
  categories,
}: {
  data: FinanceData;
  users: AppUser[];
  accounts: Account[];
  banks: Bank[];
  cards: Card[];
  categories: Category[];
}) {
  const [period, setPeriod] = useState<StatPeriod>("mes");
  const stats = useMemo(() => computeStatistics(data, period), [data, period]);

  const userLabel = (id: string | undefined) => {
    const user = users.find((u) => u.id === id);
    return (
      <>
        <UserBadge users={users} userId={id} size={16} />
        <span className="truncate">{id ? user?.name ?? "Perfil eliminado" : "Sin perfil registrado"}</span>
      </>
    );
  };

  return (
    <div>
      <p className="text-xs mb-3" style={{ color: C.textMuted }}>
        Cantidad de movimientos cargados (gastos, ingresos, transferencias, pagos de tarjeta, compras en cuotas y movimientos con personas), agrupados por perfil, cuenta, tarjeta, categoría y tipo.
      </p>

      <div className="mb-3">
        <Segment
          value={period}
          onChange={setPeriod}
          options={(Object.keys(STAT_PERIOD_LABELS) as StatPeriod[]).map((p) => ({ value: p, label: STAT_PERIOD_LABELS[p] }))}
        />
      </div>

      <div
        className="rounded-xl p-4 mb-3 text-center"
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
      >
        <div className="text-3xl font-display" style={{ color: C.text }}>{stats.totalCount}</div>
        <div className="text-xs" style={{ color: C.textFaint }}>movimientos en el período</div>
      </div>

      {stats.totalCount === 0 ? (
        <div className="rounded-xl p-6 text-center text-sm" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textMuted }}>
          No hay movimientos cargados en este período.
        </div>
      ) : (
        <>
          <StatBarList title="Por perfil" items={stats.byUser} renderLabel={userLabel} />
          <StatBarList
            title="Por cuenta"
            items={stats.byAccount}
            emptyText="Ningún movimiento en este período está ligado a una cuenta."
            renderLabel={(id) => <span className="truncate">{accountLabel(accounts.find((a) => a.id === id), banks)}</span>}
          />
          <StatBarList
            title="Por tarjeta"
            items={stats.byCard}
            emptyText="Ningún movimiento en este período está ligado a una tarjeta."
            renderLabel={(id) => <span className="truncate">{cardLabel(cards.find((c) => c.id === id), banks)}</span>}
          />
          <StatBarList
            title="Por categoría"
            items={stats.byCategory.slice(0, 10)}
            emptyText="Ningún movimiento en este período tiene categoría."
            renderLabel={(cat) => <span className="truncate">{categoryDisplayName(cat, categories)}</span>}
          />
          <StatBarList
            title="Por tipo"
            items={stats.byKind}
            renderLabel={(kind) => <span className="truncate">{STAT_KIND_LABELS[kind as keyof typeof STAT_KIND_LABELS]}</span>}
          />
        </>
      )}
    </div>
  );
}
