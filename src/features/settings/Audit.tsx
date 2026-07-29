import { useState } from "react";
import { Search, X, History } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { TextInput, Segment } from "../../components/ui";
import { formatDateTimeDMY } from "../../lib/dates";
import { entityTypeLabel, auditActionLabel } from "../../lib/audit";
import { UserBadge } from "../../components/UserBadge";
import type { AppUser, AuditEntry, AuditAction } from "../../types";

const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");
function normalizeText(s: string): string {
  return s.normalize("NFD").replace(DIACRITICS_RE, "").toLowerCase();
}

/**
 * Historial completo de altas, modificaciones y bajas de movimientos,
 * transferencias, pagos de tarjeta, cuotas y movimientos con personas. Es la
 * única forma de consultar una baja: el registro ya no existe en ningún otro
 * lado de la app, así que no hay una fila propia sobre la que hacer clic (a
 * diferencia de un registro vigente, que además tiene su propio botón
 * "Auditoría" en Movimientos).
 */
export function AuditSettings({ auditLog, users }: { auditLog: AuditEntry[]; users: AppUser[] }) {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<AuditAction | "todas">("todas");

  const actionColor = (action: AuditAction) => (action === "delete" ? C.negative : action === "create" ? C.positive : C.text);

  const filtered = [...auditLog]
    .sort((a, b) => b.at.localeCompare(a.at))
    .filter((e) => actionFilter === "todas" || e.action === actionFilter)
    .filter((e) => {
      if (!search.trim()) return true;
      const userName = users.find((u) => u.id === e.userId)?.name ?? "";
      const haystack = normalizeText(`${e.summary} ${entityTypeLabel(e.entityType)} ${userName}`);
      return haystack.includes(normalizeText(search.trim()));
    });

  return (
    <div>
      <p className="text-xs mb-3" style={{ color: C.textMuted }}>
        Alta, modificación y baja de cada movimiento, transferencia, pago de tarjeta, cuota y movimiento con persona. Las bajas solo se pueden consultar acá: el registro ya no existe en ningún otro lado.
      </p>

      <div className="relative mb-3">
        <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.textFaint }} />
        <TextInput
          aria-label="Buscar en auditoría"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por descripción o persona..."
          style={{ paddingLeft: 32, paddingRight: search ? 32 : undefined }}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            aria-label="Limpiar búsqueda"
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: C.textFaint }}
          >
            <X size={15} />
          </button>
        )}
      </div>

      <div className="mb-3">
        <Segment
          value={actionFilter}
          onChange={setActionFilter}
          options={[
            { value: "todas", label: "Todas" },
            { value: "create", label: "Altas" },
            { value: "update", label: "Modificaciones" },
            { value: "delete", label: "Bajas" },
          ]}
        />
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl p-6 text-center text-sm" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textMuted }}>
          {auditLog.length === 0 ? "Todavía no hay eventos de auditoría registrados." : "Sin resultados para este filtro."}
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((entry) => (
          <div key={entry.id} className="rounded-xl p-3" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: "rgba(150,150,150,0.15)" }}
                >
                  <History size={14} color={actionColor(entry.action)} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm truncate" style={{ color: C.text }}>{entry.summary}</div>
                  <div className="text-xs" style={{ color: C.textFaint }}>{entityTypeLabel(entry.entityType)}</div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-semibold" style={{ color: actionColor(entry.action) }}>{auditActionLabel(entry.action)}</div>
                <div className="text-xs" style={{ color: C.textFaint }}>{formatDateTimeDMY(entry.at)}</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <UserBadge users={users} userId={entry.userId ?? undefined} />
              <span className="text-xs" style={{ color: C.textFaint }}>
                {users.find((u) => u.id === entry.userId)?.name ?? "Perfil eliminado"}
              </span>
            </div>
            {entry.changes && entry.changes.length > 0 && (
              <ul className="space-y-0.5">
                {entry.changes.map((c) => (
                  <li key={c.field} className="text-xs" style={{ color: C.textMuted }}>
                    <span style={{ color: C.text }}>{c.field}:</span> {c.before} → {c.after}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
