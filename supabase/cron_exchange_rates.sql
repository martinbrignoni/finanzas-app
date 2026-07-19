-- Habilita las extensiones necesarias para programar tareas y hacer
-- pedidos HTTP desde la base de datos.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Corre todos los días a las 06:00 hora de Uruguay (09:00 UTC), para que la
-- cotización del día ya esté cargada cuando abrís la app a la mañana.
-- lookbackDays=10 (el valor por defecto) alcanza de sobra para cubrir
-- cualquier día que se haya salteado (ej. si el server no corrió un día).
select cron.schedule(
  'exchange-rates-daily',
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://xcdlbnsvkqsetrtjhunk.supabase.co/functions/v1/exchange-rates',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjZGxibnN2a3FzZXRydGpodW5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzMzYzNDIsImV4cCI6MjA5OTkxMjM0Mn0.1TFKkgXsnylTGl4eLgwR3P69Fg9P_Kz05UuPyhCPEUs',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
