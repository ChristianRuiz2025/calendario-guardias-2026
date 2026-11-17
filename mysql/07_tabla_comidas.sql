-- Tabla de horas de comida (modulo "Comidas" debajo de Vacaciones).
-- Correr una vez en la BD de cada ambiente (stage/produccion) con un usuario que pueda crear tablas;
-- el usuario de la app ya tiene SELECT/INSERT/UPDATE/DELETE sobre guardias.* (05_usuario_app.sql).
-- Mientras no exista, la app sigue funcionando pero no guarda comidas.

USE guardias;

-- Horas de comida por persona. period_key "YYYY-MM" = todo el mes; "YYYY-MM-DD" = un dia
-- (el dia tiene prioridad sobre el mes). No se ven en el calendario: solo van en el ICS "Comida".
CREATE TABLE IF NOT EXISTS lunch_breaks (
  period_key VARCHAR(10) NOT NULL,
  guard_id VARCHAR(64) NOT NULL,
  start_time CHAR(5) NOT NULL,
  end_time CHAR(5) NOT NULL,
  PRIMARY KEY (period_key, guard_id),
  KEY idx_lunch_breaks_guard (guard_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
