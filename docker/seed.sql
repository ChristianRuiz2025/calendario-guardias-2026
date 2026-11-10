-- Datos de prueba SOLO para la BD local de Docker (docker-compose.yml). No usar en RDS.
-- Usuario de prueba:  prueba@local.test  /  guardias-local-2026

SET NAMES utf8mb4;

INSERT INTO app_users (id, email, password_hash) VALUES
  ('00000000-0000-0000-0000-000000000001', 'prueba@local.test', '$2a$10$x6TSZ/CnN9PBPmNOxLnr.O4c4mwtFo9d0.OwkLE8eD2Ec/wdgrfYW');

INSERT INTO guards (id, name, initials, color, email) VALUES
  ('g-ana', 'Ana Prueba', 'AP', '#8fd6c8', 'prueba@local.test'),
  ('g-luis', 'Luis Prueba', 'LP', '#f38ba8', NULL),
  ('g-sofia', 'Sofia Prueba', 'SP', '#a6c8ff', NULL);

INSERT INTO shift_templates (id, start_time, end_time, `position`) VALUES
  ('08-17', '08:00', '17:00', 0),
  ('09-18', '09:00', '18:00', 1),
  ('10-19', '10:00', '19:00', 2);

INSERT INTO shift_assignments (day_key, guard_id, shift_id) VALUES
  ('2026-11-09', 'g-ana', '08-17'),
  ('2026-11-09', 'g-luis', '10-19'),
  ('2026-11-10', 'g-sofia', '09-18');

INSERT INTO holidays (day_key, name) VALUES ('2026-11-16', 'Revolución mexicana');

INSERT INTO audit_rotations (id, start_date, end_date, guard_ids) VALUES
  ('rot-1', '2026-01-05', NULL, JSON_ARRAY('g-ana', 'g-luis', 'g-sofia'));

INSERT INTO app_settings (`key`, `value`) VALUES
  ('office_days', JSON_ARRAY(2, 5)),
  ('ms_close_day', CAST('6' AS JSON));
