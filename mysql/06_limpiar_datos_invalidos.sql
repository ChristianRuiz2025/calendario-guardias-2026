-- Limpia los datos que dejo el escaneo de seguridad de TI (Burp) en la RDS: personas y turnos
-- con ids invalidos (con espacios, "<", etc.) y filas que apuntan a personas o turnos que no existen.
-- Antes del fix de validacion la API aceptaba cualquier id; desde ese fix ya no se pueden crear.
--
-- 1) Correr primero la seccion "REVISAR" y ver que solo salga basura.
-- 2) Despues correr la seccion "BORRAR". Va en una transaccion: si algo falla, no se borra nada.
-- Compatible con MySQL 5.7.

-- ============================== REVISAR ==============================

SELECT 'persona con id invalido' AS que, id, name FROM guards
WHERE id NOT REGEXP '^[A-Za-z0-9_-]{1,64}$';

SELECT 'turno con id invalido' AS que, id, start_time, end_time FROM shift_templates
WHERE id NOT REGEXP '^[A-Za-z0-9_-]{1,64}$';

SELECT 'orden con id invalido' AS que, id, start_date FROM audit_rotations
WHERE id NOT REGEXP '^[A-Za-z0-9_-]{1,64}$';

SELECT 'turno asignado a persona inexistente' AS que, day_key, guard_id, shift_id FROM shift_assignments
WHERE guard_id NOT IN (SELECT id FROM guards WHERE id REGEXP '^[A-Za-z0-9_-]{1,64}$');

SELECT 'vacaciones de persona inexistente' AS que, day_key, guard_id FROM vacations
WHERE guard_id NOT IN (SELECT id FROM guards WHERE id REGEXP '^[A-Za-z0-9_-]{1,64}$');

SELECT 'auditoria de persona inexistente' AS que, week_key, guard_id FROM audit_assignments
WHERE guard_id IS NOT NULL AND guard_id NOT IN (SELECT id FROM guards WHERE id REGEXP '^[A-Za-z0-9_-]{1,64}$');

-- =============================== BORRAR ===============================

START TRANSACTION;

DELETE FROM guards WHERE id NOT REGEXP '^[A-Za-z0-9_-]{1,64}$';
DELETE FROM shift_templates WHERE id NOT REGEXP '^[A-Za-z0-9_-]{1,64}$';
DELETE FROM audit_rotations WHERE id NOT REGEXP '^[A-Za-z0-9_-]{1,64}$';

DELETE FROM shift_assignments WHERE guard_id NOT IN (SELECT id FROM guards);
-- Turnos asignados que ya no existen (solo si hay turnos guardados; sin turnos la app usa los de fabrica).
DELETE FROM shift_assignments
WHERE EXISTS (SELECT 1 FROM shift_templates)
  AND shift_id NOT IN (SELECT id FROM shift_templates);
DELETE FROM vacations WHERE guard_id NOT IN (SELECT id FROM guards);
DELETE FROM audit_assignments WHERE guard_id IS NOT NULL AND guard_id NOT IN (SELECT id FROM guards);

COMMIT;
