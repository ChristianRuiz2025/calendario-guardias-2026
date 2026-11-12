// /api/calendar: datos del calendario en MySQL (reemplaza el acceso directo a Supabase).
//   GET                      todo el calendario
//   POST { op, ...datos }    un cambio; ver OPERATIONS
// Requiere sesion (cookie de /api/auth).

import { requireUser } from "./_lib/auth.js";
import { getPool, loadCalendar } from "./_lib/db.js";
import { DEFAULT_SHIFTS } from "../src/calendarDefaults.js";

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
// Ids de personas, turnos y ordenes: UUID o claves cortas como "08-17" o "jona".
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const GUARD_FIELDS = ["name", "initials", "color", "email"];
const SETTING_KEYS = ["office_days", "ms_close_day", "mail_recipients"];

class BadRequest extends Error {}

function text(value, name, { max = 255, optional = false } = {}) {
  if (value === null || value === undefined || value === "") {
    if (optional) {
      return null;
    }
    throw new BadRequest(`Falta ${name}`);
  }
  const result = String(value);
  if (result.length > max) {
    throw new BadRequest(`${name} es demasiado largo`);
  }
  return result;
}

function dayKey(value, name = "la fecha") {
  if (!DAY_KEY.test(String(value ?? ""))) {
    throw new BadRequest(`${name} debe tener formato YYYY-MM-DD`);
  }
  return value;
}

function time(value, name) {
  if (!TIME.test(String(value ?? ""))) {
    throw new BadRequest(`${name} debe tener formato HH:MM`);
  }
  return value;
}

function id(value, name, { optional = false } = {}) {
  if (optional && (value === null || value === undefined || value === "")) {
    return null;
  }
  if (!ID.test(String(value ?? ""))) {
    throw new BadRequest(`${name}: formato no valido`);
  }
  return value;
}

// Sin llaves foraneas, la API comprueba que la persona y el turno existan antes de guardar.
async function existingGuard(db, guardId) {
  const [rows] = await db.query("SELECT 1 FROM guards WHERE id = ? LIMIT 1", [id(guardId, "La persona")]);
  if (rows.length === 0) {
    throw new BadRequest("La persona no existe");
  }
  return guardId;
}

// Sin turnos guardados, la app usa los de calendarDefaults.js; esos tambien son validos.
async function existingShift(db, shiftId) {
  const [rows] = await db.query("SELECT id FROM shift_templates");
  const valid = rows.length ? rows.map((row) => row.id) : DEFAULT_SHIFTS.map((shift) => shift.id);
  if (!valid.includes(id(shiftId, "El turno"))) {
    throw new BadRequest("El turno no existe");
  }
  return shiftId;
}

function dayKeys(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 400) {
    throw new BadRequest("Faltan las fechas");
  }
  return value.map((item) => dayKey(item));
}

// Cada operacion recibe una conexion (dentro de una transaccion) y el cuerpo de la peticion.
const OPERATIONS = {
  async "guard.add"(db, { guard }) {
    if (!COLOR.test(String(guard?.color ?? ""))) {
      throw new BadRequest("El color no es valido");
    }
    await db.query("INSERT INTO guards (id, name, initials, color, email) VALUES (?, ?, ?, ?, ?)", [
      id(guard?.id, "El id"),
      text(guard?.name, "el nombre", { max: 120 }),
      text(guard?.initials, "las iniciales", { max: 10 }),
      guard.color,
      text(guard?.email, "el correo", { optional: true }),
    ]);
  },

  async "guard.update"(db, { id: guardId, field, value }) {
    if (!GUARD_FIELDS.includes(field)) {
      throw new BadRequest("Campo no valido");
    }
    if (field === "color" && !COLOR.test(String(value ?? ""))) {
      throw new BadRequest("El color no es valido");
    }
    const limits = { name: 120, initials: 10, color: 20, email: 255 };
    const nextValue =
      field === "email"
        ? text(value, "el correo", { optional: true })
        : text(value ?? "", field, { max: limits[field], optional: true }) ?? "";
    // `field` viene de la lista blanca, no del usuario.
    await db.query(`UPDATE guards SET \`${field}\` = ? WHERE id = ?`, [nextValue, await existingGuard(db, guardId)]);
  },

  // Sin llaves foraneas en MySQL no hay borrado en cascada: se borra todo lo de la persona.
  async "guard.remove"(db, { id: removedId }) {
    const guardId = id(removedId, "El id");
    await db.query("DELETE FROM shift_assignments WHERE guard_id = ?", [guardId]);
    await db.query("DELETE FROM vacations WHERE guard_id = ?", [guardId]);
    await db.query("DELETE FROM audit_assignments WHERE guard_id = ?", [guardId]);
    await db.query("DELETE FROM guards WHERE id = ?", [guardId]);
  },

  async "assignment.set"(db, { dayKey: day, guardId, shiftId }) {
    const params = [dayKey(day), id(guardId, "La persona")];
    if (shiftId) {
      await existingGuard(db, guardId);
      await db.query(
        "INSERT INTO shift_assignments (day_key, guard_id, shift_id) VALUES (?, ?, ?) " +
          "ON DUPLICATE KEY UPDATE shift_id = VALUES(shift_id)",
        [...params, await existingShift(db, shiftId)]
      );
    } else {
      await db.query("DELETE FROM shift_assignments WHERE day_key = ? AND guard_id = ?", params);
    }
  },

  // guardId null = semana marcada como "Sin asignar".
  async "audit.set"(db, { weekKey, guardId }) {
    await db.query(
      "INSERT INTO audit_assignments (week_key, guard_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE guard_id = VALUES(guard_id)",
      [dayKey(weekKey, "la semana"), guardId ? await existingGuard(db, guardId) : null]
    );
  },

  async "shift.upsert"(db, { shift }) {
    await db.query(
      "INSERT INTO shift_templates (id, start_time, end_time, `position`) VALUES (?, ?, ?, ?) " +
        "ON DUPLICATE KEY UPDATE start_time = VALUES(start_time), end_time = VALUES(end_time), `position` = VALUES(`position`)",
      [
        id(shift?.id, "El id"),
        time(shift?.start, "la entrada"),
        time(shift?.end, "la salida"),
        Number.isInteger(shift?.position) ? shift.position : 0,
      ]
    );
  },

  // Los dias que tenian el turno quedan sin guardia.
  async "shift.remove"(db, { id: removedId }) {
    const shiftId = id(removedId, "El id");
    await db.query("DELETE FROM shift_assignments WHERE shift_id = ?", [shiftId]);
    await db.query("DELETE FROM shift_templates WHERE id = ?", [shiftId]);
  },

  async "setting.set"(db, { key, value }) {
    if (!SETTING_KEYS.includes(key)) {
      throw new BadRequest("Ajuste no valido");
    }
    await db.query(
      "INSERT INTO app_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
      [key, JSON.stringify(value)]
    );
  },

  async "holiday.set"(db, { dayKey: day, name }) {
    await db.query("INSERT INTO holidays (day_key, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)", [
      dayKey(day),
      text(name ?? "", "el nombre", { optional: true }) ?? "",
    ]);
  },

  async "holiday.remove"(db, { dayKey: day }) {
    await db.query("DELETE FROM holidays WHERE day_key = ?", [dayKey(day)]);
  },

  async "vacation.add"(db, { guardId, dayKeys: days }) {
    const guard = await existingGuard(db, guardId);
    await db.query("INSERT IGNORE INTO vacations (day_key, guard_id) VALUES ?", [
      dayKeys(days).map((day) => [day, guard]),
    ]);
  },

  async "vacation.remove"(db, { guardId, dayKeys: days }) {
    await db.query("DELETE FROM vacations WHERE guard_id = ? AND day_key IN (?)", [
      id(guardId, "La persona"),
      dayKeys(days),
    ]);
  },

  async "rotation.upsert"(db, { rotation }) {
    if (!Array.isArray(rotation?.order) || rotation.order.length > 50) {
      throw new BadRequest("El orden no es valido");
    }
    const order = rotation.order.map((guardId) => id(guardId, "Una persona del orden"));
    if (order.length > 0) {
      const [rows] = await db.query("SELECT id FROM guards WHERE id IN (?)", [order]);
      if (rows.length !== new Set(order).size) {
        throw new BadRequest("El orden incluye una persona que no existe");
      }
    }
    await db.query(
      "INSERT INTO audit_rotations (id, start_date, end_date, guard_ids) VALUES (?, ?, ?, ?) " +
        "ON DUPLICATE KEY UPDATE start_date = VALUES(start_date), end_date = VALUES(end_date), guard_ids = VALUES(guard_ids)",
      [
        id(rotation.id, "El id"),
        dayKey(rotation.start, "la fecha de inicio"),
        rotation.end ? dayKey(rotation.end, "la fecha fin") : null,
        JSON.stringify(order),
      ]
    );
  },

  async "rotation.remove"(db, { id: removedId }) {
    await db.query("DELETE FROM audit_rotations WHERE id = ?", [id(removedId, "El id")]);
  },
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!(await requireUser(req, res))) {
    return undefined;
  }

  if (req.method === "GET") {
    try {
      return res.status(200).json(await loadCalendar());
    } catch (dbError) {
      console.error(dbError);
      return res.status(500).json({ error: "No se pudo leer el calendario." });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  const operation = OPERATIONS[req.body?.op];
  if (!operation) {
    return res.status(400).json({ error: "Operacion no valida" });
  }

  let connection = null;
  try {
    connection = await getPool().getConnection();
    await connection.beginTransaction();
    await operation(connection, req.body);
    await connection.commit();
    return res.status(200).json({ ok: true });
  } catch (opError) {
    await connection?.rollback().catch(() => {});
    if (opError instanceof BadRequest) {
      return res.status(400).json({ error: opError.message });
    }
    console.error(opError);
    return res.status(500).json({ error: "No se pudo guardar el cambio." });
  } finally {
    connection?.release();
  }
}
