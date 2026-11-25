-- Protege las funciones send-reminders y exchange-rates para que solo las
-- pueda ejecutar el cron programado (antes cualquiera con la clave "anon",
-- que es pública, podía dispararlas).
--
-- PASOS (una sola vez, en este orden para que el cron nunca quede cortado):
--
-- 1) En la Terminal del Mac, generá una clave al azar y copiala:
--      openssl rand -hex 32
--
-- 2) En Supabase → SQL Editor, ejecutá la línea de abajo reemplazando
--    TU_CLAVE por la clave del paso 1:

select vault.create_secret('TU_CLAVE', 'cron_secret', 'Clave que el cron manda a las Edge Functions');

-- 3) En el mismo SQL Editor, ejecutá el contenido completo de
--    cron_exchange_rates.sql y después el de cron_send_reminders.sql
--    (reprograman los dos cron para que manden la clave; cron.schedule con
--    el mismo nombre reemplaza el job existente).
--
-- 4) Recién ahora, en la Terminal (carpeta del proyecto), activá el control
--    con la MISMA clave y publicá las funciones:
--      supabase secrets set CRON_SECRET=TU_CLAVE
--      supabase functions deploy send-reminders
--      supabase functions deploy exchange-rates
--
-- Para verificar: en Edge Functions → send-reminders → Logs, las ejecuciones
-- cada 10 minutos tienen que seguir respondiendo 200 (un 401 significa que
-- la clave del paso 2 y la del paso 4 no coinciden).
