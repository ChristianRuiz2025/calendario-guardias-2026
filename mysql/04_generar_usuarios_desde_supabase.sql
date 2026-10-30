-- Correr en el SQL Editor de SUPABASE (no en MySQL).
-- Devuelve UNA celda con el INSERT de los usuarios de Supabase Auth para la tabla app_users
-- de MySQL. Las contrasenas van cifradas (bcrypt): nadie tiene que cambiar la suya.
-- Solo lee: no cambia nada en Supabase.

create or replace function pg_temp.mysql_literal(value text) returns text
language sql immutable as $$
  select case
    when value is null then 'NULL'
    else '''' || replace(replace(value, '\', '\\'), '''', '''''') || ''''
  end
$$;

select 'INSERT INTO app_users (id, email, password_hash, created_at) VALUES' || chr(10) ||
  string_agg(format('(%s, %s, %s, %s)',
    pg_temp.mysql_literal(id::text),
    pg_temp.mysql_literal(lower(email)),
    pg_temp.mysql_literal(encrypted_password),
    pg_temp.mysql_literal(to_char(created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US'))
  ), ',' || chr(10) order by created_at) ||
  chr(10) || 'ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash);' as mysql
from auth.users
where email is not null
  and encrypted_password is not null
  and encrypted_password <> ''
  and deleted_at is null;
