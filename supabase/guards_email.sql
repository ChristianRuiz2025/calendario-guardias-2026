-- Correo de inicio de sesion de cada persona (se edita en Configuracion > Guardias).
-- Con el se sabe quien entro a la app para descargar solo sus ICS.
-- Se puede correr varias veces en el SQL Editor de Supabase sin romper nada.

alter table public.guards add column if not exists email text;
