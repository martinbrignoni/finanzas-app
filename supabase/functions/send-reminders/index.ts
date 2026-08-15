// Edge Function: corre por cron (ver supabase/cron_send_reminders.sql) cada
// 10 minutos. Por cada hogar (fila de `finance_data`):
//   1) Materializa como `Reminder` reales las ocurrencias vencidas de
//      `ReminderRule` activas (mismo criterio "catch-up" que
//      src/lib/reminders.ts#generateDueReminders, portado acá porque una
//      Edge Function no puede importar código del frontend). Así, un
//      recordatorio recurrente recibe push a horario aunque nadie haya
//      abierto la app desde la ocurrencia anterior.
//   2) Manda un push (Web Push) por cada `Reminder` con `notify` activo,
//      hora cargada y ya vencida, a los perfiles de `assignedUserIds` (o al
//      creador si no hay nadie asignado), usando la misma infraestructura
//      que `notify-change` (VAPID + tabla `push_subscriptions`).
//   3) Marca cada uno como enviado (`Reminder.notifiedAt`) para no
//      reenviarlo en la próxima corrida.
//
// OJO (mismo límite que el resto de la app, ver storage.ts): el guardado es
// "todo el bloque JSON pisa al anterior", sin merge. Si justo en el mismo
// instante en que esta función escribe, un dispositivo guarda otro cambio
// desde la app, gana el que escribe último. Para el volumen de uso de esta
// app (personal/familiar), el riesgo es bajo.
//
// Variables de entorno necesarias (las mismas que notify-change; Project
// Settings → Edge Functions → Secrets, o `supabase secrets set ...`):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ej. mailto:vos@mail.com)
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya están disponibles por defecto
// en toda Edge Function de Supabase.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

type RecurrencePeriod = "diaria" | "semanal" | "mensual" | "trimestral" | "anual";
type ReminderPriority = "baja" | "media" | "alta";

interface ReminderSubtask {
  id: string;
  text: string;
  done: boolean;
}

interface ReminderLite {
  id: string;
  title: string;
  description?: string;
  date: string;
  time?: string;
  priority: ReminderPriority;
  assignedUserIds: string[];
  createdByUserId?: string;
  done: boolean;
  subtasks?: ReminderSubtask[];
  reminderRuleId?: string;
  notify: boolean;
  notifiedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ReminderRuleLite {
  id: string;
  title: string;
  description?: string;
  time?: string;
  priority: ReminderPriority;
  assignedUserIds: string[];
  subtasksTemplate?: string[];
  notify: boolean;
  period: RecurrencePeriod;
  nextDueDate: string;
  active: boolean;
  createdByUserId?: string;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function addDaysToDate(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
}
function addMonthsToDate(iso: string, n: number): string {
  const [y, m, day] = iso.split("-").map(Number);
  const t = new Date(y, m - 1 + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(day, last));
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
}
function addYearsToDate(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(y + n, m - 1, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(d, last));
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
}
/** Ver src/lib/reminders.ts#advance (portado acá, ver comentario del archivo). */
function advance(date: string, period: RecurrencePeriod): string {
  if (period === "diaria") return addDaysToDate(date, 1);
  if (period === "semanal") return addDaysToDate(date, 7);
  if (period === "mensual") return addMonthsToDate(date, 1);
  if (period === "trimestral") return addMonthsToDate(date, 3);
  return addYearsToDate(date, 1);
}

/** Hora actual en Uruguay (UTC-3 todo el año, sin horario de verano) como YYYY-MM-DD / HH:MM, para comparar contra `Reminder.date`/`time` (cargados en hora local del dispositivo, siempre Uruguay en esta app). */
function nowInUruguay(): { date: string; time: string } {
  const uy = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return {
    date: `${uy.getUTCFullYear()}-${pad2(uy.getUTCMonth() + 1)}-${pad2(uy.getUTCDate())}`,
    time: `${pad2(uy.getUTCHours())}:${pad2(uy.getUTCMinutes())}`,
  };
}

/** Ver src/lib/reminders.ts#generateDueReminders (portado acá, ver comentario del archivo). */
function materializeDueReminders(
  reminders: ReminderLite[],
  rules: ReminderRuleLite[],
  today: string
): { reminders: ReminderLite[]; rules: ReminderRuleLite[]; changed: boolean } {
  const newReminders: ReminderLite[] = [];
  let rulesChanged = false;

  const updatedRules = rules.map((rule) => {
    if (!rule.active) return rule;
    let nextDue = rule.nextDueDate;
    let guard = 0;
    while (nextDue <= today && guard < 500) {
      const now = new Date().toISOString();
      newReminders.push({
        id: crypto.randomUUID(),
        title: rule.title,
        description: rule.description,
        date: nextDue,
        time: rule.time,
        priority: rule.priority,
        assignedUserIds: rule.assignedUserIds,
        createdByUserId: rule.createdByUserId,
        done: false,
        subtasks: (rule.subtasksTemplate ?? []).map((text) => ({ id: crypto.randomUUID(), text, done: false })),
        reminderRuleId: rule.id,
        notify: rule.notify,
        createdAt: now,
        updatedAt: now,
      });
      nextDue = advance(nextDue, rule.period);
      guard++;
    }
    if (nextDue !== rule.nextDueDate) {
      rulesChanged = true;
      return { ...rule, nextDueDate: nextDue };
    }
    return rule;
  });

  return { reminders: [...reminders, ...newReminders], rules: updatedRules, changed: rulesChanged || newReminders.length > 0 };
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

Deno.serve(async (_req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:no-reply@example.com";
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    const { date: today, time: nowTime } = nowInUruguay();

    const { data: rows, error } = await admin.from("finance_data").select("user_id, data");
    if (error) throw error;

    let totalSent = 0;
    let householdsUpdated = 0;

    for (const row of rows ?? []) {
      const ownerId: string = row.user_id;
      const financeData = (row.data ?? {}) as Record<string, unknown>;
      const rawReminders = (financeData.reminders as ReminderLite[] | undefined) ?? [];
      const rawRules = (financeData.reminderRules as ReminderRuleLite[] | undefined) ?? [];

      const { reminders, rules, changed: materializedChanged } = materializeDueReminders(rawReminders, rawRules, today);

      const due = reminders.filter(
        (r) => r.notify && !r.done && r.time && !r.notifiedAt && r.date <= today && (r.date < today || r.time <= nowTime)
      );

      let pushChanged = false;
      if (due.length > 0) {
        const { data: subs } = await admin
          .from("push_subscriptions")
          .select("app_user_id, endpoint, p256dh, auth_key")
          .eq("owner_id", ownerId);

        const staleEndpoints: string[] = [];
        const sentIds = new Set<string>();

        for (const r of due) {
          const targets = r.assignedUserIds.length > 0 ? r.assignedUserIds : r.createdByUserId ? [r.createdByUserId] : [];
          const payload = JSON.stringify({ title: "Recordatorio", body: r.title, url: "/finanzas-app/" });
          for (const sub of subs ?? []) {
            if (!targets.includes(sub.app_user_id)) continue;
            try {
              await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload);
              totalSent++;
            } catch (err) {
              const statusCode = (err as { statusCode?: number })?.statusCode;
              if (statusCode === 404 || statusCode === 410) staleEndpoints.push(sub.endpoint);
              else console.error("Error enviando push de recordatorio a", sub.endpoint, err);
            }
          }
          // Se marca enviado tanto si había a quién avisar como si no (ej.
          // recordatorio personal sin dispositivo registrado): evita
          // reintentar el mismo recordatorio en cada corrida del cron.
          sentIds.add(r.id);
        }

        if (staleEndpoints.length > 0) {
          await admin.from("push_subscriptions").delete().in("endpoint", staleEndpoints);
        }

        if (sentIds.size > 0) {
          const now = new Date().toISOString();
          for (let i = 0; i < reminders.length; i++) {
            if (sentIds.has(reminders[i].id)) reminders[i] = { ...reminders[i], notifiedAt: now };
          }
          pushChanged = true;
        }
      }

      if (materializedChanged || pushChanged) {
        householdsUpdated++;
        await admin
          .from("finance_data")
          .update({ data: { ...financeData, reminders, reminderRules: rules } })
          .eq("user_id", ownerId);
      }
    }

    return json({ ok: true, sent: totalSent, householdsUpdated });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: String(err) }, 500);
  }
});
