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

create table audit_assignments (
  week_key text primary key,
  guard_id text not null references guards(id) on delete cascade
);

alter table guards enable row level security;
alter table shift_assignments enable row level security;
alter table audit_assignments enable row level security;

create policy "authenticated full access" on guards
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on shift_assignments
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on audit_assignments
  for all to authenticated using (true) with check (true);

alter publication supabase_realtime add table guards, shift_assignments, audit_assignments;

insert into guards (id, name, initials, color) values
  ('jona', 'Jona', 'J', '#f5b47e'),
  ('chris', 'Chris', 'C', '#b77af1'),
  ('abi', 'Abi', 'A', '#ffe59a');
