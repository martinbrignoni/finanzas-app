import { Fragment, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Check, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Bell, Repeat } from "lucide-react";
import { theme as C } from "../../styles/theme";
import { Modal, Field, TextInput, TextArea, Select, Segment, PrimaryButton, IconBtn, SwipeableRow } from "../../components/ui";
import { todayISO, formatDateDMY, dayLabel, capitalize, monthLabel, monthKeyOf, addMonths, currentMonthKey } from "../../lib/dates";
import { sortReminders, isReminderOverdue, assignedLabel, upcomingReminderOccurrencesInMonth } from "../../lib/reminders";
import { RECURRENCE_PERIOD_LABELS, REMINDER_PRIORITY_LABELS } from "../../types";
import type { Reminder, ReminderRule, ReminderSubtask, ReminderPriority, RecurrencePeriod, AppUser } from "../../types";

/** Color de la prioridad, leído en cada render (no en el módulo) para reaccionar a claro/oscuro (ver comentario de `getInputStyle` en ui.tsx). */
function priorityColor(p: ReminderPriority): string {
  if (p === "alta") return C.negative;
  if (p === "media") return C.uyu;
  return C.textFaint;
}

type ViewMode = "lista" | "calendario" | "recurrentes";
type ListFilter = "pendientes" | "todos" | "mios";

/**
 * Módulo Recordatorios: tareas/recordatorios personales o asignados a uno o
 * varios perfiles del hogar, con prioridad, subtareas y recurrencia opcional
 * (ver `ReminderRule`). Se puede ver como lista agrupada por día o como
 * calendario mensual. Si un recordatorio tiene hora y notificación
 * activadas, se manda un push a los asignados a esa hora exacta (ver
 * `supabase/functions/send-reminders`), aunque la app esté cerrada.
 */
export function Reminders({
  reminders,
  reminderRules,
  users,
  activeUser,
  canEdit,
  onAdd,
  onEdit,
  onDelete,
  onToggleDone,
  onToggleSubtask,
  onAddRule,
  onEditRule,
  onToggleRuleActive,
  onDeleteRule,
}: {
  reminders: Reminder[];
  reminderRules: ReminderRule[];
  users: AppUser[];
  activeUser: AppUser | null;
  canEdit: boolean;
  onAdd: () => void;
  onEdit: (r: Reminder) => void;
  onDelete: (id: string) => void;
  onToggleDone: (r: Reminder) => void;
  onToggleSubtask: (reminderId: string, subtaskId: string) => void;
  onAddRule: () => void;
  onEditRule: (r: ReminderRule) => void;
  onToggleRuleActive: (r: ReminderRule) => void;
  onDeleteRule: (id: string) => void;
}) {
  const [view, setView] = useState<ViewMode>("lista");
  const [filter, setFilter] = useState<ListFilter>("pendientes");
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(() => currentMonthKey());
  const [calSelectedDate, setCalSelectedDate] = useState<string | null>(null);

  const visibleReminders = useMemo(() => {
    let items = reminders;
    if (filter === "mios") {
      items = items.filter(
        (r) => r.assignedUserIds.includes(activeUser?.id ?? "") || (r.assignedUserIds.length === 0 && r.createdByUserId === activeUser?.id)
      );
    } else if (filter === "pendientes") {
      items = items.filter((r) => !r.done);
    }
    return sortReminders(items);
  }, [reminders, filter, activeUser]);

  return (
    <div className="pb-24">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-2xl font-display" style={{ color: C.text }}>Recordatorios</h1>
        {canEdit && (
          <button
            onClick={view === "recurrentes" ? onAddRule : onAdd}
            aria-label={view === "recurrentes" ? "Nuevo recordatorio recurrente" : "Nuevo recordatorio"}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text }}
          >
            <Plus size={18} />
          </button>
        )}
      </div>

      <div className="mb-3">
        <Segment
          value={view}
          onChange={setView}
          options={[
            { value: "lista", label: "Lista" },
            { value: "calendario", label: "Calendario" },
            { value: "recurrentes", label: "Recurrentes" },
          ]}
        />
      </div>

      {view === "lista" && (
        <>
          <div className="mb-3">
            <Segment
              value={filter}
              onChange={setFilter}
              options={[
                { value: "pendientes", label: "Pendientes" },
                { value: "todos", label: "Todos" },
                { value: "mios", label: "Míos" },
              ]}
            />
          </div>
          <ReminderList
            reminders={visibleReminders}
            users={users}
            canEdit={canEdit}
            swipedId={swipedId}
            setSwipedId={setSwipedId}
            expandedId={expandedId}
            setExpandedId={setExpandedId}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleDone={onToggleDone}
            onToggleSubtask={onToggleSubtask}
          />
        </>
      )}

      {view === "calendario" && (
        <ReminderCalendar
          reminders={reminders}
          reminderRules={reminderRules}
          users={users}
          canEdit={canEdit}
          month={calMonth}
          onChangeMonth={setCalMonth}
          selectedDate={calSelectedDate}
          onSelectDate={setCalSelectedDate}
          swipedId={swipedId}
          setSwipedId={setSwipedId}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggleDone={onToggleDone}
          onToggleSubtask={onToggleSubtask}
        />
      )}

      {view === "recurrentes" && (
        <ReminderRulesList rules={reminderRules} users={users} canEdit={canEdit} onEdit={onEditRule} onToggleActive={onToggleRuleActive} onDelete={onDeleteRule} />
      )}
    </div>
  );
}

function ReminderRow({
  r,
  users,
  canEdit,
  open,
  onOpenChange,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onToggleDone,
  onToggleSubtask,
  showDate,
}: {
  r: Reminder;
  users: AppUser[];
  canEdit: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
  onEdit: (r: Reminder) => void;
  onDelete: (id: string) => void;
  onToggleDone: (r: Reminder) => void;
  onToggleSubtask: (reminderId: string, subtaskId: string) => void;
  showDate: boolean;
}) {
  const overdue = isReminderOverdue(r);
  const subtasks = r.subtasks ?? [];
  const doneCount = subtasks.filter((s) => s.done).length;

  // Si la fila está desplegada (swipe abierto), el primer toque en el
  // contenido solo la cierra, no dispara la acción (mismo criterio que
  // Movimientos, ver Transactions.tsx#handleRowTap).
  const tap = (action: () => void) => {
    if (open) { onOpenChange(false); return; }
    action();
  };

  const content = (
    <div className="p-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => tap(() => onToggleDone(r))}
          aria-label={r.done ? "Marcar pendiente" : "Marcar completado"}
          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
          style={{ border: `2px solid ${r.done ? C.positive : C.border}`, background: r.done ? C.positive : "transparent" }}
        >
          {r.done && <Check size={12} color="#0A1413" />}
        </button>
        <button type="button" onClick={() => tap(() => onEdit(r))} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-1.5">
            {r.reminderRuleId && <Repeat size={11} color={C.textFaint} />}
            <span
              className="text-sm truncate"
              style={{ color: r.done ? C.textFaint : C.text, textDecoration: r.done ? "line-through" : undefined }}
            >
              {r.title}
            </span>
          </div>
          <div className="text-xs flex flex-wrap items-center gap-1 mt-0.5" style={{ color: overdue ? C.negative : C.textFaint }}>
            {showDate && <span>{capitalize(dayLabel(r.date))}</span>}
            {r.time && <span>· {r.time}</span>}
            <span>· {assignedLabel(r.assignedUserIds, users)}</span>
            {subtasks.length > 0 && <span>· {doneCount}/{subtasks.length}</span>}
            {r.notify && r.time && <Bell size={11} />}
          </div>
        </button>
        {subtasks.length > 0 && (
          <button type="button" onClick={() => tap(() => onToggleExpand(r.id))} aria-label="Ver subtareas" className="shrink-0 mt-0.5" style={{ color: C.textFaint }}>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        )}
      </div>
      {expanded && subtasks.length > 0 && (
        <div className="mt-2 ml-8 space-y-1">
          {subtasks.map((s) => (
            <button key={s.id} type="button" onClick={() => tap(() => onToggleSubtask(r.id, s.id))} className="flex items-center gap-2 text-xs w-full text-left">
              <span
                className="w-3.5 h-3.5 rounded flex items-center justify-center shrink-0"
                style={{ border: `1.5px solid ${s.done ? C.positive : C.border}`, background: s.done ? C.positive : "transparent" }}
              >
                {s.done && <Check size={9} color="#0A1413" />}
              </span>
              <span style={{ color: s.done ? C.textFaint : C.textMuted, textDecoration: s.done ? "line-through" : undefined }}>{s.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (!canEdit) {
    return (
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}`, borderLeft: `3px solid ${priorityColor(r.priority)}`, background: C.surface }}>
        {content}
      </div>
    );
  }

  return (
    <SwipeableRow
      open={open}
      onOpenChange={onOpenChange}
      accentColor={priorityColor(r.priority)}
      actions={
        <>
          <IconBtn label="Editar recordatorio" onClick={() => { onOpenChange(false); onEdit(r); }}><Pencil size={15} /></IconBtn>
          <IconBtn label="Eliminar recordatorio" danger onClick={() => { onOpenChange(false); onDelete(r.id); }}><Trash2 size={15} /></IconBtn>
        </>
      }
    >
      {content}
    </SwipeableRow>
  );
}

function ReminderList({
  reminders,
  users,
  canEdit,
  swipedId,
  setSwipedId,
  expandedId,
  setExpandedId,
  onEdit,
  onDelete,
  onToggleDone,
  onToggleSubtask,
}: {
  reminders: Reminder[];
  users: AppUser[];
  canEdit: boolean;
  swipedId: string | null;
  setSwipedId: (id: string | null) => void;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  onEdit: (r: Reminder) => void;
  onDelete: (id: string) => void;
  onToggleDone: (r: Reminder) => void;
  onToggleSubtask: (reminderId: string, subtaskId: string) => void;
}) {
  if (reminders.length === 0) {
    return (
      <div className="rounded-xl p-6 text-center text-sm mb-4" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textMuted }}>
        No hay recordatorios en esta vista.
      </div>
    );
  }

  let lastDate: string | null = null;
  return (
    <div className="space-y-2 mb-4">
      {reminders.map((r) => {
        const isNewDate = r.date !== lastDate;
        lastDate = r.date;
        return (
          <Fragment key={r.id}>
            {isNewDate && (
              <div className="flex items-center gap-2 pt-2 pb-1">
                <span className="text-[11px] font-medium whitespace-nowrap" style={{ color: C.textFaint }}>{capitalize(dayLabel(r.date))}</span>
                <div className="flex-1 h-px" style={{ background: C.border }} />
              </div>
            )}
            <ReminderRow
              r={r}
              users={users}
              canEdit={canEdit}
              open={swipedId === r.id}
              onOpenChange={(o) => setSwipedId(o ? r.id : null)}
              expanded={expandedId === r.id}
              onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleDone={onToggleDone}
              onToggleSubtask={onToggleSubtask}
              showDate={false}
            />
          </Fragment>
        );
      })}
    </div>
  );
}

function ReminderCalendar({
  reminders,
  reminderRules,
  users,
  canEdit,
  month,
  onChangeMonth,
  selectedDate,
  onSelectDate,
  swipedId,
  setSwipedId,
  expandedId,
  setExpandedId,
  onEdit,
  onDelete,
  onToggleDone,
  onToggleSubtask,
}: {
  reminders: Reminder[];
  reminderRules: ReminderRule[];
  users: AppUser[];
  canEdit: boolean;
  month: string;
  onChangeMonth: (mk: string) => void;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  swipedId: string | null;
  setSwipedId: (id: string | null) => void;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  onEdit: (r: Reminder) => void;
  onDelete: (id: string) => void;
  onToggleDone: (r: Reminder) => void;
  onToggleSubtask: (reminderId: string, subtaskId: string) => void;
}) {
  const today = todayISO();

  // Ocurrencias reales de este mes + ocurrencias futuras de reglas activas
  // todavía no generadas (ver `upcomingReminderOccurrencesInMonth`): estas
  // últimas siempre caen después de hoy (una regla ya generó todo lo vencido
  // al abrir la app), así que no hay superposición con las reales.
  const virtual = useMemo(() => upcomingReminderOccurrencesInMonth(reminderRules, month), [reminderRules, month]);
  const byDate = useMemo(() => {
    const map = new Map<string, Set<ReminderPriority>>();
    for (const r of reminders) {
      if (monthKeyOf(r.date) !== month) continue;
      const set = map.get(r.date) ?? new Set<ReminderPriority>();
      set.add(r.priority);
      map.set(r.date, set);
    }
    for (const v of virtual) {
      const set = map.get(v.date) ?? new Set<ReminderPriority>();
      set.add(v.priority);
      map.set(v.date, set);
    }
    return map;
  }, [reminders, virtual, month]);

  const [y, m] = month.split("-").map(Number);
  const startWeekday = new Date(y, m - 1, 1).getDay(); // 0 = domingo
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);

  const dayItems = selectedDate ? sortReminders(reminders.filter((r) => r.date === selectedDate)) : [];
  const virtualForSelected = selectedDate ? virtual.filter((v) => v.date === selectedDate) : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => onChangeMonth(addMonths(month, -1))}
          aria-label="Mes anterior"
          className="w-8 h-8 rounded-md flex items-center justify-center"
          style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.textMuted }}
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold" style={{ color: C.text }}>{capitalize(monthLabel(month))}</span>
        <button
          onClick={() => onChangeMonth(addMonths(month, 1))}
          aria-label="Mes siguiente"
          className="w-8 h-8 rounded-md flex items-center justify-center"
          style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.textMuted }}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {["D", "L", "M", "M", "J", "V", "S"].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-semibold" style={{ color: C.textFaint }}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 mb-4">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const priorities = byDate.get(date);
          const isToday = date === today;
          const isSelected = date === selectedDate;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelectDate(isSelected ? null : date)}
              className="aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5"
              style={{
                background: isSelected ? C.usd : isToday ? C.surface3 : C.surface,
                border: `1px solid ${isSelected ? C.usd : C.border}`,
                color: isSelected ? "#0A1413" : C.text,
              }}
            >
              <span className="text-xs">{Number(date.slice(-2))}</span>
              {priorities && priorities.size > 0 && (
                <span className="flex gap-0.5">
                  {[...priorities].slice(0, 3).map((p) => (
                    <span key={p} className="w-1.5 h-1.5 rounded-full" style={{ background: isSelected ? "#0A1413" : priorityColor(p) }} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedDate ? (
        <>
          <div className="text-xs font-semibold mb-2" style={{ color: C.textMuted }}>{capitalize(dayLabel(selectedDate))}</div>
          {dayItems.length === 0 && virtualForSelected.length === 0 && (
            <p className="text-xs mb-3" style={{ color: C.textFaint }}>Sin recordatorios este día.</p>
          )}
          <div className="space-y-2 mb-4">
            {dayItems.map((r) => (
              <ReminderRow
                key={r.id}
                r={r}
                users={users}
                canEdit={canEdit}
                open={swipedId === r.id}
                onOpenChange={(o) => setSwipedId(o ? r.id : null)}
                expanded={expandedId === r.id}
                onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
                onEdit={onEdit}
                onDelete={onDelete}
                onToggleDone={onToggleDone}
                onToggleSubtask={onToggleSubtask}
                showDate={false}
              />
            ))}
            {virtualForSelected.map((v) => (
              <div key={v.ruleId} className="rounded-xl p-3 flex items-center gap-2" style={{ background: C.surface, border: `1px dashed ${C.border}` }}>
                <Repeat size={13} color={C.textFaint} />
                <span className="text-sm flex-1 truncate" style={{ color: C.textMuted }}>{v.title}</span>
                {v.time && <span className="text-xs" style={{ color: C.textFaint }}>{v.time}</span>}
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-xs text-center" style={{ color: C.textFaint }}>Tocá un día para ver sus recordatorios.</p>
      )}
    </div>
  );
}

function ReminderRulesList({
  rules,
  users,
  canEdit,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  rules: ReminderRule[];
  users: AppUser[];
  canEdit: boolean;
  onEdit: (r: ReminderRule) => void;
  onToggleActive: (r: ReminderRule) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      <p className="text-xs mb-3" style={{ color: C.textMuted }}>
        Se generan solos como recordatorios normales, llegada la fecha, cada vez que abrís la app (o antes, si tenés notificaciones push activadas).
      </p>
      {rules.length === 0 && (
        <div className="rounded-xl p-6 text-center text-sm" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textMuted }}>
          Todavía no tenés recordatorios recurrentes.
        </div>
      )}
      <div className="space-y-2">
        {rules.map((r) => (
          <div key={r.id} className="rounded-xl p-3" style={{ background: C.surface, border: `1px solid ${C.border}`, opacity: r.active ? 1 : 0.6 }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: priorityColor(r.priority) }} />
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate" style={{ color: C.text }}>{r.title}</div>
                <div className="text-xs flex items-center gap-1 flex-wrap" style={{ color: C.textFaint }}>
                  <Repeat size={11} />
                  <span>{RECURRENCE_PERIOD_LABELS[r.period]}</span>
                  <span>· Próximo: {formatDateDMY(r.nextDueDate)}</span>
                  {r.time && <span>· {r.time}</span>}
                  <span>· {assignedLabel(r.assignedUserIds, users)}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              {canEdit ? (
                <Segment
                  value={r.active ? "on" : "off"}
                  onChange={() => onToggleActive(r)}
                  options={[{ value: "on", label: "Activo" }, { value: "off", label: "Pausado" }]}
                />
              ) : (
                <span className="text-xs" style={{ color: C.textFaint }}>{r.active ? "Activo" : "Pausado"}</span>
              )}
              {canEdit && (
                <div className="flex gap-1">
                  <IconBtn label="Editar recurrente" onClick={() => onEdit(r)}><Pencil size={14} /></IconBtn>
                  <IconBtn label="Eliminar recurrente" danger onClick={() => onDelete(r.id)}><Trash2 size={14} /></IconBtn>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ReminderFormState {
  title: string;
  description: string;
  date: string;
  hasTime: boolean;
  time: string;
  priority: ReminderPriority;
  assignedUserIds: string[];
  notify: boolean;
  subtasks: ReminderSubtask[];
  repeats: boolean;
  period: RecurrencePeriod;
}

/**
 * Crea o edita un recordatorio/tarea. Si `initialRule` viene cargado, edita
 * esa regla recurrente (período/próxima fecha en vez de fecha fija). Si
 * `initial` viene cargado, edita esa ocurrencia puntual (sin poder pasarla a
 * recurrente: para eso hay que crear una regla nueva). Si no viene ninguno de
 * los dos (alta), se puede elegir "¿Se repite?" para crear una `ReminderRule`
 * en vez de un `Reminder` suelto.
 */
export function ReminderModal({
  initial,
  initialRule,
  users,
  activeUserId,
  onSave,
  onSaveRule,
  onClose,
}: {
  initial?: Reminder;
  initialRule?: ReminderRule;
  users: AppUser[];
  activeUserId: string | null;
  onSave: (r: Reminder) => void;
  onSaveRule: (r: ReminderRule) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ReminderFormState>(() => ({
    title: initial?.title ?? initialRule?.title ?? "",
    description: initial?.description ?? initialRule?.description ?? "",
    date: initial?.date ?? initialRule?.nextDueDate ?? todayISO(),
    hasTime: !!(initial?.time ?? initialRule?.time),
    time: initial?.time ?? initialRule?.time ?? "09:00",
    priority: initial?.priority ?? initialRule?.priority ?? "media",
    assignedUserIds: initial?.assignedUserIds ?? initialRule?.assignedUserIds ?? [],
    notify: initial?.notify ?? initialRule?.notify ?? true,
    subtasks: initial?.subtasks ?? (initialRule?.subtasksTemplate ?? []).map((text) => ({ id: crypto.randomUUID(), text, done: false })),
    repeats: !!initialRule,
    period: initialRule?.period ?? "mensual",
  }));
  const [newSubtask, setNewSubtask] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isNew = !initial && !initialRule;
  const asRule = !!initialRule || (isNew && form.repeats);

  const addSubtask = () => {
    const text = newSubtask.trim();
    if (!text) return;
    setForm((f) => ({ ...f, subtasks: [...f.subtasks, { id: crypto.randomUUID(), text, done: false }] }));
    setNewSubtask("");
  };

  const handleSave = () => {
    if (!form.title.trim()) return setError("Ingresá un título.");
    if (!form.date) return setError("Elegí una fecha.");
    if (form.hasTime && !form.time) return setError("Elegí una hora, o marcá 'Todo el día'.");

    const now = new Date().toISOString();
    const time = form.hasTime ? form.time : undefined;
    const notify = form.hasTime ? form.notify : false;

    if (asRule) {
      onSaveRule({
        id: initialRule?.id ?? crypto.randomUUID(),
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        time,
        priority: form.priority,
        assignedUserIds: form.assignedUserIds,
        subtasksTemplate: form.subtasks.length > 0 ? form.subtasks.map((s) => s.text) : undefined,
        notify,
        period: form.period,
        nextDueDate: form.date,
        active: initialRule?.active ?? true,
        createdByUserId: initialRule?.createdByUserId ?? activeUserId ?? undefined,
        createdAt: initialRule?.createdAt ?? now,
        updatedAt: initialRule ? now : undefined,
      });
      return;
    }

    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      date: form.date,
      time,
      priority: form.priority,
      assignedUserIds: form.assignedUserIds,
      createdByUserId: initial?.createdByUserId ?? activeUserId ?? undefined,
      done: initial?.done ?? false,
      doneAt: initial?.doneAt,
      subtasks: form.subtasks.length > 0 ? form.subtasks : undefined,
      reminderRuleId: initial?.reminderRuleId,
      notify,
      notifiedAt: initial?.notifiedAt,
      createdAt: initial?.createdAt ?? now,
      updatedAt: initial ? now : undefined,
    });
  };

  return (
    <Modal title={initialRule ? "Editar recurrente" : initial ? "Editar recordatorio" : "Nuevo recordatorio"} onClose={onClose}>
      <Field label="Título">
        {(id) => (
          <TextInput
            id={id}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="ej. Pagar DGI, Turno médico"
            autoFocus
          />
        )}
      </Field>

      <Field label="Descripción (opcional)">
        {(id) => (
          <TextArea id={id} rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Detalle..." />
        )}
      </Field>

      {isNew && (
        <Field label="¿Se repite?">
          {() => (
            <Segment
              value={form.repeats ? "si" : "no"}
              onChange={(v) => setForm((f) => ({ ...f, repeats: v === "si" }))}
              options={[{ value: "no", label: "Una vez" }, { value: "si", label: "Se repite" }]}
            />
          )}
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={asRule ? (initialRule ? "Próxima fecha" : "Primera fecha") : "Fecha"}>
          {(id) => <TextInput id={id} type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />}
        </Field>
        {asRule && (
          <Field label="Periodicidad">
            {() => (
              <Select value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value as RecurrencePeriod }))}>
                {(Object.keys(RECURRENCE_PERIOD_LABELS) as RecurrencePeriod[]).map((p) => (
                  <option key={p} value={p}>{RECURRENCE_PERIOD_LABELS[p]}</option>
                ))}
              </Select>
            )}
          </Field>
        )}
      </div>

      <Field label="Hora">
        {() => (
          <Segment
            value={form.hasTime ? "si" : "no"}
            onChange={(v) => setForm((f) => ({ ...f, hasTime: v === "si" }))}
            options={[{ value: "no", label: "Todo el día" }, { value: "si", label: "A una hora" }]}
          />
        )}
      </Field>
      {form.hasTime && (
        <Field label="Hora exacta">
          {(id) => <TextInput id={id} type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} />}
        </Field>
      )}

      <Field label="Prioridad">
        {() => (
          <Segment
            value={form.priority}
            onChange={(v) => setForm((f) => ({ ...f, priority: v }))}
            options={(Object.keys(REMINDER_PRIORITY_LABELS) as ReminderPriority[]).map((p) => ({ value: p, label: REMINDER_PRIORITY_LABELS[p] }))}
          />
        )}
      </Field>

      <Field label="¿Para quién? (vacío = personal, solo vos)">
        {() => (
          <div className="flex flex-wrap gap-1.5">
            {users.map((u) => {
              const selected = form.assignedUserIds.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      assignedUserIds: selected ? f.assignedUserIds.filter((id) => id !== u.id) : [...f.assignedUserIds, u.id],
                    }))
                  }
                  className="text-xs font-semibold px-3 py-1.5 rounded-full"
                  style={{ background: selected ? C.usd : C.surface2, color: selected ? "#0A1413" : C.textMuted, border: `1px solid ${selected ? C.usd : C.border}` }}
                >
                  {u.name}
                </button>
              );
            })}
          </div>
        )}
      </Field>

      {form.hasTime && (
        <Field label="¿Avisar con notificación push a la hora?">
          {() => (
            <Segment
              value={form.notify ? "si" : "no"}
              onChange={(v) => setForm((f) => ({ ...f, notify: v === "si" }))}
              options={[{ value: "no", label: "No" }, { value: "si", label: "Sí" }]}
            />
          )}
        </Field>
      )}

      <Field label="Subtareas (opcional)">
        {() => (
          <div>
            {form.subtasks.length > 0 && (
              <div className="space-y-1 mb-2">
                {form.subtasks.map((s) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <span className="text-sm flex-1 truncate" style={{ color: C.text }}>{s.text}</span>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, subtasks: f.subtasks.filter((x) => x.id !== s.id) }))}
                      aria-label="Quitar subtarea"
                      style={{ color: C.textFaint }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <TextInput
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                placeholder="Agregar subtarea..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addSubtask(); }
                }}
              />
              <button
                type="button"
                onClick={addSubtask}
                className="px-4 rounded-lg text-sm font-semibold shrink-0"
                style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text }}
              >
                +
              </button>
            </div>
          </div>
        )}
      </Field>

      {error && <p className="text-xs mb-2" style={{ color: C.negative }}>{error}</p>}
      <PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>
    </Modal>
  );
}
