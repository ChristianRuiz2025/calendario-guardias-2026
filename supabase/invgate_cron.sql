-- Revisa cada 15 minutos quien debe recibir solicitudes en InvGate (api/invgate-sync.js).
-- Antes de correrlo, reemplaza:
--   TU-APP.vercel.app  por el dominio de produccion de la app
--   TU_CRON_SECRET     por el mismo valor de la variable CRON_SECRET en Vercel
-- Se puede correr varias veces: si la tarea ya existe, la reemplaza.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('invgate-sync')
where exists (select 1 from cron.job where jobname = 'invgate-sync');

select cron.schedule(
  'invgate-sync',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://TU-APP.vercel.app/api/invgate-sync',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "TU_CRON_SECRET"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Para revisar las ultimas ejecuciones:
--   select * from cron.job_run_details order by start_time desc limit 10;
-- Para detenerla:
--   select cron.unschedule('invgate-sync');
