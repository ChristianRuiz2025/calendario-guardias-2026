-- Dias de vacaciones por persona (se capturan en el modulo Vacaciones de la app).
-- Se puede correr varias veces en el SQL Editor de Supabase sin romper nada.

create table if not exists public.vacations (
  day_key text not null,
  guard_id text not null references public.guards(id) on delete cascade,
  primary key (day_key, guard_id)
);

alter table public.vacations enable row level security;

drop policy if exists "authenticated full access" on public.vacations;
create policy "authenticated full access" on public.vacations
  for all to authenticated using (true) with check (true);

-- Tiempo real (solo la agrega si aun no esta en la publicacion).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vacations'
  ) then
    alter publication supabase_realtime add table public.vacations;
  end if;
end $$;
