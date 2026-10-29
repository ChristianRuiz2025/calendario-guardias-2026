-- Horarios de los turnos (editables desde Configuracion en la app).
-- Se puede correr varias veces en el SQL Editor de Supabase sin romper nada.

create table if not exists public.shift_templates (
  id text primary key,
  start_time text not null,
  end_time text not null,
  position integer not null
);

alter table public.shift_templates enable row level security;

drop policy if exists "authenticated full access" on public.shift_templates;
create policy "authenticated full access" on public.shift_templates
  for all to authenticated using (true) with check (true);

insert into public.shift_templates (id, start_time, end_time, position) values
  ('08-17', '08:00', '17:00', 0),
  ('09-18', '09:00', '18:00', 1),
  ('10-19', '10:00', '19:00', 2)
on conflict (id) do nothing;

-- Tiempo real (solo la agrega si aun no esta en la publicacion).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shift_templates'
  ) then
    alter publication supabase_realtime add table public.shift_templates;
  end if;
end $$;
