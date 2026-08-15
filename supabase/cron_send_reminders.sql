-- Corre la función `send-reminders` cada 10 minutos: manda push de los
-- recordatorios con hora y notificación activada que ya vencieron, y de paso
-- genera las ocurrencias vencidas de recordatorios recurrentes (ver
-- comentario de supabase/functions/send-reminders/index.ts).
--
-- Requiere las mismas extensiones que cron_exchange_rates.sql (pg_cron,
-- pg_net); si ya corriste ese archivo, no hace falta repetir el `create
-- extension`, pero no molesta volver a correrlo (es "if not exists").
--
-- Corré este archivo completo en el SQL Editor de Supabase (Dashboard ->
-- SQL Editor -> New query -> pegar y Run), DESPUÉS de desplegar la función
-- (`supabase functions deploy send-reminders`) y de cargar los secrets de
-- VAPID si todavía no los tenías (Project Settings → Edge Functions →
-- Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT — los mismos
-- que ya usa notify-change, no hace falta generar otros).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'send-reminders-every-10-min',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://xcdlbnsvkqsetrtjhunk.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjZGxibnN2a3FzZXRydGpodW5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzMzYzNDIsImV4cCI6MjA5OTkxMjM0Mn0.1TFKkgXsnylTGl4eLgwR3P69Fg9P_Kz05UuPyhCPEUs',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
