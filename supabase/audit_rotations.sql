-- Orden automatico de auditorias (editable desde Configuracion en la app).
-- Cada fila es un periodo: desde start_date hasta end_date (null = sin fecha fin),
-- rotando semana a semana en el orden de guard_ids.
-- Se puede correr varias veces en el SQL Editor de Supabase sin romper nada.

create table if not exists public.audit_rotations (
  id text primary key,
  start_date text not null,
  end_date text,
  guard_ids jsonb not null default '[]'
);

alter table public.audit_rotations enable row level security;

drop policy if exists "authenticated full access" on public.audit_rotations;
create policy "authenticated full access" on public.audit_rotations
  for all to authenticated using (true) with check (true);

-- Orden actual, solo si la tabla esta vacia.
insert into public.audit_rotations (id, start_date, end_date, guard_ids)
select id, start_date, end_date, guard_ids::jsonb from (values
  ('2026-04-27', '2026-04-27', '2026-11-01', '["jona", "abi", "chris"]'),
  ('2026-11-02', '2026-11-02', null, '["abi", "jona", "chris"]')
) as defaults(id, start_date, end_date, guard_ids)
where not exists (select 1 from public.audit_rotations);

-- Tiempo real (solo la agrega si aun no esta en la publicacion).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'audit_rotations'
  ) then
    alter publication supabase_realtime add table public.audit_rotations;
  end if;
end $$;
