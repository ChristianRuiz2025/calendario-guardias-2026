-- Tablas del calendario de guardias para MySQL 8 (o MariaDB 10.5+).
-- Equivalentes a supabase/schema.sql. Correr en la base de datos destino antes de los INSERT.
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
  CONSTRAINT fk_shift_assignments_guard FOREIGN KEY (guard_id) REFERENCES guards (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- guard_id NULL = semana marcada como "Sin asignar"
CREATE TABLE IF NOT EXISTS audit_assignments (
  week_key CHAR(10) NOT NULL,
  guard_id VARCHAR(64) NULL,
  PRIMARY KEY (week_key),
  CONSTRAINT fk_audit_assignments_guard FOREIGN KEY (guard_id) REFERENCES guards (id) ON DELETE CASCADE
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
  CONSTRAINT fk_vacations_guard FOREIGN KEY (guard_id) REFERENCES guards (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ajustes: office_days, ms_close_day, mail_recipients
CREATE TABLE IF NOT EXISTS app_settings (
  `key` VARCHAR(100) NOT NULL,
  `value` JSON NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
