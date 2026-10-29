create table guards (
  id text primary key,
  name text not null,
  initials text not null,
  color text not null,
  created_at timestamptz not null default now()
);

create table shift_assignments (
  day_key text not null,
  guard_id text not null references guards(id) on delete cascade,
  shift_id text not null,
  primary key (day_key, guard_id)
);

-- guard_id null = semana marcada como "Sin asignar"
create table audit_assignments (
  week_key text primary key,
  guard_id text references guards(id) on delete cascade
);

create table shift_templates (
  id text primary key,
  start_time text not null,
  end_time text not null,
  position integer not null
);

create table holidays (
  day_key text primary key,
  name text not null default ''
);

create table app_settings (
  key text primary key,
  value jsonb not null
);

alter table guards enable row level security;
alter table shift_assignments enable row level security;
alter table audit_assignments enable row level security;
alter table shift_templates enable row level security;
alter table holidays enable row level security;
alter table app_settings enable row level security;

create policy "authenticated full access" on guards
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on shift_assignments
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on audit_assignments
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on shift_templates
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on holidays
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on app_settings
  for all to authenticated using (true) with check (true);

alter publication supabase_realtime add table guards, shift_assignments, audit_assignments, shift_templates, holidays, app_settings;

insert into guards (id, name, initials, color) values
  ('jona', 'Jona', 'J', '#f5b47e'),
  ('chris', 'Chris', 'C', '#b77af1'),
  ('abi', 'Abi', 'A', '#ffe59a');

insert into shift_templates (id, start_time, end_time, position) values
  ('08-17', '08:00', '17:00', 0),
  ('09-18', '09:00', '18:00', 1),
  ('10-19', '10:00', '19:00', 2);

insert into holidays (day_key) values
  ('2026-01-01'), ('2026-02-02'), ('2026-03-16'), ('2026-04-02'), ('2026-04-03'), ('2026-05-01'),
  ('2026-09-16'), ('2026-11-16'), ('2026-12-12'), ('2026-12-24'), ('2026-12-25'), ('2026-12-31');

insert into app_settings (key, value) values ('office_days', '[2, 5]');
