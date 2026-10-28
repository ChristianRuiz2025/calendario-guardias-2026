-- Tabla de auditorias por semana (week_key = lunes de la semana, formato YYYY-MM-DD).
-- Se puede correr varias veces en el SQL Editor de Supabase sin romper nada.

create table if not exists public.audit_assignments (
  week_key text primary key,
  guard_id text references public.guards(id) on delete cascade
);

-- Si la tabla ya existia con NOT NULL, permitir null ("Sin asignar").
alter table public.audit_assignments alter column guard_id drop not null;

alter table public.audit_assignments enable row level security;

drop policy if exists "authenticated full access" on public.audit_assignments;
create policy "authenticated full access" on public.audit_assignments
  for all to authenticated using (true) with check (true);

-- Tiempo real (solo la agrega si aun no esta en la publicacion).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'audit_assignments'
  ) then
    alter publication supabase_realtime add table public.audit_assignments;
  end if;
end $$;
