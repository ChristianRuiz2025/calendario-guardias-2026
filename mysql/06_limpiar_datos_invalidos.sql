-- Limpia lo que dejo en la RDS el escaneo de seguridad de TI (Burp, 12/11/2026 por la tarde, UTC).
-- Antes del fix de validacion la API aceptaba cualquier id; desde ese fix ya no se pueden crear
-- ids invalidos, pero el escaneo tambien dejo registros con id valido (p. ej. turnos
-- "ni08uwpv0j" o "08-17u199cw7cib", y quiza cambio el horario de "08-17" a 08:01).
--
-- Por eso el borrado NO se decide por formato: se borran solo los ids que se confirmen a mano.
--
-- 0) Tomar un snapshot de la RDS antes de borrar:
--      aws rds create-db-snapshot --db-instance-identifier db-sicliksuscribe-staging \
--        --db-snapshot-identifier antes-limpieza-guardias --profile mfa-suscribe-stage
-- 1) Correr la seccion REVISAR (solo SELECT) y anotar los ids que son basura.
-- 2) Pegar esos ids en las listas de la seccion BORRAR (los marcadores 'PEGAR_ID' no coinciden
--    con nada, se pueden dejar). Correrla completa: va en una transaccion.
-- 3) Volver a correr REVISAR para confirmar.
--
-- Hace falta un usuario con DELETE sobre guardias.* (p. ej. guardias_app). Compatible con MySQL 5.7.

USE guardias;

-- Ventana del escaneo (UTC). Ajustar si TI da otra hora.
SET @escaneo_desde = '2026-11-12 12:00:00';
SET @escaneo_hasta = '2026-11-13 06:00:00';

-- ============================== 1. REVISAR ==============================

-- Personas: todas, marcando las creadas durante el escaneo o con id invalido.
SELECT id, name, initials, email, created_at,
       CASE
         WHEN id NOT REGEXP '^[A-Za-z0-9_-]{1,64}$' THEN 'ID INVALIDO'
         WHEN created_at BETWEEN @escaneo_desde AND @escaneo_hasta THEN 'CREADA DURANTE EL ESCANEO'
         ELSE ''
       END AS revisar
FROM guards ORDER BY created_at;

-- Turnos: todos (la tabla no tiene fecha de alta). Los reales suelen ser 08-17, 09-18, 10-19 o
-- UUIDs creados desde Configuracion; desconfiar de horas como 08:01 y de ids raros.
SELECT id, start_time, end_time, `position`,
       CASE
         WHEN id NOT REGEXP '^[A-Za-z0-9_-]{1,64}$' THEN 'ID INVALIDO'
         WHEN id = '08-17' AND (start_time <> '08:00' OR end_time <> '17:00') THEN 'HORARIO CAMBIADO'
         WHEN id = '09-18' AND (start_time <> '09:00' OR end_time <> '18:00') THEN 'HORARIO CAMBIADO'
         WHEN id = '10-19' AND (start_time <> '10:00' OR end_time <> '19:00') THEN 'HORARIO CAMBIADO'
         WHEN id NOT IN ('08-17', '09-18', '10-19')
              AND id NOT REGEXP '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN 'ID RARO'
         ELSE ''
       END AS revisar
FROM shift_templates ORDER BY `position`, id;

-- Asignaciones que apuntan a personas o turnos que no estan en las tablas.
-- Ojo: si shift_templates esta vacia o le faltan 08-17/09-18/10-19, la app usa los turnos de
-- fabrica y esas asignaciones son legitimas aunque aparezcan aqui.
SELECT day_key, guard_id, shift_id,
       CASE WHEN guard_id NOT IN (SELECT id FROM guards) THEN 'PERSONA NO EXISTE' ELSE 'TURNO NO EXISTE' END AS revisar
FROM shift_assignments
WHERE guard_id NOT IN (SELECT id FROM guards)
   OR shift_id NOT IN (SELECT id FROM shift_templates)
ORDER BY day_key;

-- Dia que uso el escaneo.
SELECT day_key, guard_id, shift_id FROM shift_assignments WHERE day_key = '2026-07-16';

SELECT 'vacaciones de persona inexistente' AS revisar, day_key, guard_id FROM vacations
WHERE guard_id NOT IN (SELECT id FROM guards);

SELECT 'auditoria de persona inexistente' AS revisar, week_key, guard_id FROM audit_assignments
WHERE guard_id IS NOT NULL AND guard_id NOT IN (SELECT id FROM guards);

-- Ordenes de auditoria: revisar a mano que guard_ids solo tenga personas reales.
SELECT id, start_date, end_date, guard_ids,
       CASE WHEN id NOT REGEXP '^[A-Za-z0-9_-]{1,64}$' THEN 'ID INVALIDO' ELSE '' END AS revisar
FROM audit_rotations ORDER BY start_date;

-- Ajustes: office_days (arreglo de dias), ms_close_day (numero) y mail_recipients
-- (excludedGuards, extra con correos de la empresa, subject y message sin texto raro).
SELECT `key`, `value` FROM app_settings;

-- Feriados: buscar nombres o fechas que no sean reales.
SELECT day_key, name FROM holidays ORDER BY day_key;

-- Usuarios de la app (el de prueba de TI se borra cuando terminen de escanear).
SELECT id, email, created_at FROM app_users ORDER BY created_at;

-- =============================== 2. BORRAR ===============================
-- Pegar los ids confirmados en REVISAR. Los de formato invalido ya van incluidos.

START TRANSACTION;

-- Personas basura y todo lo suyo.
DELETE FROM shift_assignments
WHERE guard_id IN ('PEGAR_ID') OR guard_id NOT REGEXP '^[A-Za-z0-9_-]{1,64}$';
DELETE FROM vacations
WHERE guard_id IN ('PEGAR_ID') OR guard_id NOT REGEXP '^[A-Za-z0-9_-]{1,64}$';
DELETE FROM audit_assignments
WHERE guard_id IN ('PEGAR_ID') OR guard_id NOT REGEXP '^[A-Za-z0-9_-]{1,64}$';
DELETE FROM guards
WHERE id IN ('PEGAR_ID') OR id NOT REGEXP '^[A-Za-z0-9_-]{1,64}$';

-- Turnos basura y los dias que los tenian (quedan sin guardia).
DELETE FROM shift_assignments
WHERE shift_id IN ('PEGAR_ID') OR shift_id NOT REGEXP '^[A-Za-z0-9_-]{1,64}$';
DELETE FROM shift_templates
WHERE id IN ('PEGAR_ID') OR id NOT REGEXP '^[A-Za-z0-9_-]{1,64}$';

-- Ordenes de auditoria basura.
DELETE FROM audit_rotations
WHERE id IN ('PEGAR_ID') OR id NOT REGEXP '^[A-Za-z0-9_-]{1,64}$';

-- Asignaciones sueltas confirmadas en REVISAR (dia y persona), p. ej. las del 2026-07-16.
DELETE FROM shift_assignments
WHERE (day_key, guard_id) IN (('PEGAR_DIA', 'PEGAR_ID'));

-- Feriados basura.
DELETE FROM holidays WHERE day_key IN ('PEGAR_DIA');

-- Horario original de los turnos de fabrica: quitar el "-- " solo de los que REVISAR marco como
-- 'HORARIO CAMBIADO' y que nadie haya cambiado a proposito desde Configuracion.
-- UPDATE shift_templates SET start_time = '08:00', end_time = '17:00' WHERE id = '08-17';
-- UPDATE shift_templates SET start_time = '09:00', end_time = '18:00' WHERE id = '09-18';
-- UPDATE shift_templates SET start_time = '10:00', end_time = '19:00' WHERE id = '10-19';

COMMIT;

-- Usuario de prueba de TI, cuando terminen de volver a escanear (cierra su sesion de inmediato):
-- DELETE FROM app_users WHERE email = 'PEGAR_CORREO';
