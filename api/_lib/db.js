// Conexion a MySQL compartida por las funciones de /api (los archivos que empiezan con "_"
// no se publican como rutas en Vercel).
//
// Variables de entorno en Vercel:
//   MYSQL_HOST, MYSQL_PORT (3306), MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
//   MYSQL_SSL  "rds" (por defecto: SSL validando el certificado de Amazon RDS), "on" (SSL con
//              los certificados del sistema) u "off" (sin SSL, solo para pruebas locales)

import awsCaBundle from "aws-ssl-profiles";
import mysql from "mysql2/promise";

let pool = null;

function sslOptions() {
  const mode = (process.env.MYSQL_SSL || "rds").toLowerCase();
  if (mode === "off") {
    return undefined;
  }
  if (mode === "on") {
    return { rejectUnauthorized: true };
  }
  return { ca: awsCaBundle.ca, rejectUnauthorized: true };
}

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      ssl: sslOptions(),
      charset: "utf8mb4",
      // Pocas conexiones: cada funcion de Vercel tiene su propio pool.
      connectionLimit: 3,
      dateStrings: true,
    });
  }
  return pool;
}

// pool.query (no execute) para poder pasar arreglos en "IN (?)" y filas en "VALUES ?".
export async function query(sql, params = []) {
  const [rows] = await getPool().query(sql, params);
  return rows;
}

// MySQL devuelve las columnas JSON ya convertidas; MariaDB las devuelve como texto.
export function parseJson(value) {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

// Todo el calendario, con los mismos nombres de columnas que tenian las tablas de Supabase.
export async function loadCalendar() {
  const [guards, assignments, auditAssignments, shiftTemplates, holidays, settings, auditRotations, vacations] =
    await Promise.all([
      query("SELECT id, name, initials, color, email, created_at FROM guards ORDER BY created_at, id"),
      query("SELECT day_key, guard_id, shift_id FROM shift_assignments"),
      query("SELECT week_key, guard_id FROM audit_assignments"),
      query("SELECT id, start_time, end_time, `position` FROM shift_templates ORDER BY `position`, id"),
      query("SELECT day_key, name FROM holidays ORDER BY day_key"),
      query("SELECT `key`, `value` FROM app_settings"),
      query("SELECT id, start_date, end_date, guard_ids FROM audit_rotations ORDER BY start_date, id"),
      query("SELECT day_key, guard_id FROM vacations"),
    ]);

  return {
    guards,
    assignments,
    auditAssignments,
    shiftTemplates,
    holidays,
    settings: settings.map((row) => ({ key: row.key, value: parseJson(row.value) })),
    auditRotations: auditRotations.map((row) => ({ ...row, guard_ids: parseJson(row.guard_ids) ?? [] })),
    vacations,
  };
}
