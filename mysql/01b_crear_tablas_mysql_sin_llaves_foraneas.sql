-- Tablas del calendario de guardias para MySQL 8 (o MariaDB 10.5+), SIN llaves foraneas.
-- Usar cuando el usuario no tiene el permiso REFERENCES (Error 1142 al crear las tablas).
-- Diferencia con 01_crear_tablas_mysql.sql: al borrar a una persona de guards, sus filas en
-- shift_assignments, audit_assignments y vacations NO se borran solas.
-- Las tablas llevan un indice en guard_id para que las busquedas por persona sigan siendo rapidas.
-- Las fechas del calendario se guardan como texto "YYYY-MM-DD" y las horas como "HH:MM",
-- igual que en Supabase, para que la app no tenga que cambiar formatos.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS guards (
  id VARCHAR(64) NOT NULL,
  name VARCHAR(120) NOT NULL,
  initials VARCHAR(10) NOT NULL,
  color VARCHAR(20) NOT NULL,
  email VARCHAR(255) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'UTC',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shift_templates (
  id VARCHAR(64) NOT NULL,
  start_time CHAR(5) NOT NULL,
  end_time CHAR(5) NOT NULL,
  `position` INT NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shift_assignments (
  day_key CHAR(10) NOT NULL,
  guard_id VARCHAR(64) NOT NULL,
  shift_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (day_key, guard_id),
  KEY idx_shift_assignments_guard (guard_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- guard_id NULL = semana marcada como "Sin asignar"
CREATE TABLE IF NOT EXISTS audit_assignments (
  week_key CHAR(10) NOT NULL,
  guard_id VARCHAR(64) NULL,
  PRIMARY KEY (week_key),
  KEY idx_audit_assignments_guard (guard_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_rotations (
  id VARCHAR(64) NOT NULL,
  start_date CHAR(10) NOT NULL,
  end_date CHAR(10) NULL,
  guard_ids JSON NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS holidays (
  day_key CHAR(10) NOT NULL,
  name VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (day_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vacations (
  day_key CHAR(10) NOT NULL,
  guard_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (day_key, guard_id),
  KEY idx_vacations_guard (guard_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ajustes: office_days, ms_close_day, mail_recipients
CREATE TABLE IF NOT EXISTS app_settings (
  `key` VARCHAR(100) NOT NULL,
  `value` JSON NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
