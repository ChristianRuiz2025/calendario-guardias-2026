-- Usuarios que pueden iniciar sesion en la app (reemplaza el inicio de sesion de Supabase).
-- password_hash es bcrypt; los de Supabase se pueden copiar tal cual (04_generar_usuarios_desde_supabase.sql).

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS app_users (
  id VARCHAR(64) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'UTC',
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
