-- Dias feriados y dias de oficina (editables desde Configuracion en la app).
-- Se puede correr varias veces en el SQL Editor de Supabase sin romper nada.

-- Feriados: day_key = fecha YYYY-MM-DD, name = descripcion opcional.
create table if not exists public.holidays (
  day_key text primary key,
  name text not null default ''
);

-- Ajustes generales. office_days = arreglo de dias (1 = lunes ... 5 = viernes).
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null
);

alter table public.holidays enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "authenticated full access" on public.holidays;
create policy "authenticated full access" on public.holidays
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.app_settings;
create policy "authenticated full access" on public.app_settings
  for all to authenticated using (true) with check (true);

-- Feriados iniciales: solo si la tabla esta vacia, para no regresar los que se borren.
insert into public.holidays (day_key)
select day_key from (values
  ('2026-01-01'), ('2026-02-02'), ('2026-03-16'), ('2026-04-02'), ('2026-04-03'), ('2026-05-01'),
  ('2026-09-16'), ('2026-11-16'), ('2026-12-12'), ('2026-12-24'), ('2026-12-25'), ('2026-12-31')
) as defaults(day_key)
where not exists (select 1 from public.holidays);

-- Dias de oficina iniciales: martes y viernes.
insert into public.app_settings (key, value) values ('office_days', '[2, 5]')
on conflict (key) do nothing;

-- Tiempo real (solo agrega las tablas que aun no esten en la publicacion).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'holidays'
  ) then
    alter publication supabase_realtime add table public.holidays;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_settings'
  ) then
    alter publication supabase_realtime add table public.app_settings;
  end if;
end $$;
