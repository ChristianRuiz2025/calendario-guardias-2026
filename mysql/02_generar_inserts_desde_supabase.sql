-- Correr en el SQL Editor de SUPABASE (no en MySQL).
-- Devuelve UNA celda ("mysql") con los INSERT de todos tus datos en formato MySQL.
-- Abre la celda del resultado (doble clic), copia todo el texto, guardalo como
-- 03_datos.sql y correlo en MySQL despues de 01_crear_tablas_mysql.sql.
-- Solo lee: no cambia nada en Supabase.

-- Texto -> literal de MySQL ('' para comillas y \\ para diagonales invertidas); NULL -> NULL.
create or replace function pg_temp.mysql_literal(value text) returns text
language sql immutable as $$
  select case
    when value is null then 'NULL'
    else '''' || replace(replace(value, '\', '\\'), '''', '''''') || ''''
  end
$$;

with statements(sort_order, mysql) as (
  select 0, 'SET NAMES utf8mb4;'
  union all
  select 1, 'SET FOREIGN_KEY_CHECKS = 0;'

  union all
  select 10, 'INSERT INTO guards (id, name, initials, color, email, created_at) VALUES' || chr(10) ||
    string_agg(format('(%s, %s, %s, %s, %s, %s)',
      pg_temp.mysql_literal(id), pg_temp.mysql_literal(name), pg_temp.mysql_literal(initials),
      pg_temp.mysql_literal(color), pg_temp.mysql_literal(email),
      pg_temp.mysql_literal(to_char(created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US'))
    ), ',' || chr(10) order by created_at, id) || ';'
  from public.guards

  union all
  select 20, 'INSERT INTO shift_templates (id, start_time, end_time, `position`) VALUES' || chr(10) ||
    string_agg(format('(%s, %s, %s, %s)',
      pg_temp.mysql_literal(id), pg_temp.mysql_literal(start_time), pg_temp.mysql_literal(end_time), position
    ), ',' || chr(10) order by position, id) || ';'
  from public.shift_templates

  union all
  select 30, 'INSERT INTO shift_assignments (day_key, guard_id, shift_id) VALUES' || chr(10) ||
    string_agg(format('(%s, %s, %s)',
      pg_temp.mysql_literal(day_key), pg_temp.mysql_literal(guard_id), pg_temp.mysql_literal(shift_id)
    ), ',' || chr(10) order by day_key, guard_id) || ';'
  from public.shift_assignments

  union all
  select 40, 'INSERT INTO audit_assignments (week_key, guard_id) VALUES' || chr(10) ||
    string_agg(format('(%s, %s)', pg_temp.mysql_literal(week_key), pg_temp.mysql_literal(guard_id)),
      ',' || chr(10) order by week_key) || ';'
  from public.audit_assignments

  union all
  select 50, 'INSERT INTO audit_rotations (id, start_date, end_date, guard_ids) VALUES' || chr(10) ||
    string_agg(format('(%s, %s, %s, %s)',
      pg_temp.mysql_literal(id), pg_temp.mysql_literal(start_date), pg_temp.mysql_literal(end_date),
      pg_temp.mysql_literal(guard_ids::text)
    ), ',' || chr(10) order by start_date, id) || ';'
  from public.audit_rotations

  union all
  select 60, 'INSERT INTO holidays (day_key, name) VALUES' || chr(10) ||
    string_agg(format('(%s, %s)', pg_temp.mysql_literal(day_key), pg_temp.mysql_literal(name)),
      ',' || chr(10) order by day_key) || ';'
  from public.holidays

  union all
  select 70, 'INSERT INTO vacations (day_key, guard_id) VALUES' || chr(10) ||
    string_agg(format('(%s, %s)', pg_temp.mysql_literal(day_key), pg_temp.mysql_literal(guard_id)),
      ',' || chr(10) order by day_key, guard_id) || ';'
  from public.vacations

  union all
  select 80, 'INSERT INTO app_settings (`key`, `value`) VALUES' || chr(10) ||
    string_agg(format('(%s, %s)', pg_temp.mysql_literal(key), pg_temp.mysql_literal(value::text)),
      ',' || chr(10) order by key) || ';'
  from public.app_settings

  union all
  select 99, 'SET FOREIGN_KEY_CHECKS = 1;'
)
-- Las tablas vacias no generan INSERT (string_agg ignora los NULL).
select string_agg(mysql, chr(10) order by sort_order) as mysql
from statements;
