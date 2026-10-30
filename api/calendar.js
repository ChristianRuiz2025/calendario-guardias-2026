// /api/calendar: datos del calendario en MySQL (reemplaza el acceso directo a Supabase).
//   GET                      todo el calendario
//   POST { op, ...datos }    un cambio; ver OPERATIONS
// Requiere sesion (cookie de /api/auth).

import { requireUser } from "./_lib/auth.js";
import { getPool, loadCalendar } from "./_lib/db.js";

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
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

function dayKeys(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 400) {
    throw new BadRequest("Faltan las fechas");
  }
  return value.map((item) => dayKey(item));
}

// Cada operacion recibe una conexion (dentro de una transaccion) y el cuerpo de la peticion.
const OPERATIONS = {
  async "guard.add"(db, { guard }) {
    await db.query("INSERT INTO guards (id, name, initials, color, email) VALUES (?, ?, ?, ?, ?)", [
      text(guard?.id, "el id", { max: 64 }),
      text(guard?.name, "el nombre", { max: 120 }),
      text(guard?.initials, "las iniciales", { max: 10 }),
      text(guard?.color, "el color", { max: 20 }),
      text(guard?.email, "el correo", { optional: true }),
    ]);
  },

  async "guard.update"(db, { id, field, value }) {
    if (!GUARD_FIELDS.includes(field)) {
      throw new BadRequest("Campo no valido");
    }
    const limits = { name: 120, initials: 10, color: 20, email: 255 };
    const nextValue =
      field === "email"
        ? text(value, "el correo", { optional: true })
        : text(value ?? "", field, { max: limits[field], optional: true }) ?? "";
    // `field` viene de la lista blanca, no del usuario.
    await db.query(`UPDATE guards SET \`${field}\` = ? WHERE id = ?`, [nextValue, text(id, "el id", { max: 64 })]);
  },

  // Sin llaves foraneas en MySQL no hay borrado en cascada: se borra todo lo de la persona.
  async "guard.remove"(db, { id }) {
    const guardId = text(id, "el id", { max: 64 });
    await db.query("DELETE FROM shift_assignments WHERE guard_id = ?", [guardId]);
    await db.query("DELETE FROM vacations WHERE guard_id = ?", [guardId]);
    await db.query("DELETE FROM audit_assignments WHERE guard_id = ?", [guardId]);
    await db.query("DELETE FROM guards WHERE id = ?", [guardId]);
  },

  async "assignment.set"(db, { dayKey: day, guardId, shiftId }) {
    const params = [dayKey(day), text(guardId, "la persona", { max: 64 })];
    if (shiftId) {
      await db.query(
        "INSERT INTO shift_assignments (day_key, guard_id, shift_id) VALUES (?, ?, ?) " +
          "ON DUPLICATE KEY UPDATE shift_id = VALUES(shift_id)",
        [...params, text(shiftId, "el turno", { max: 64 })]
      );
    } else {
      await db.query("DELETE FROM shift_assignments WHERE day_key = ? AND guard_id = ?", params);
    }
  },

  // guardId null = semana marcada como "Sin asignar".
  async "audit.set"(db, { weekKey, guardId }) {
    await db.query(
      "INSERT INTO audit_assignments (week_key, guard_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE guard_id = VALUES(guard_id)",
      [dayKey(weekKey, "la semana"), text(guardId, "la persona", { max: 64, optional: true })]
    );
  },

  async "shift.upsert"(db, { shift }) {
    await db.query(
      "INSERT INTO shift_templates (id, start_time, end_time, `position`) VALUES (?, ?, ?, ?) " +
        "ON DUPLICATE KEY UPDATE start_time = VALUES(start_time), end_time = VALUES(end_time), `position` = VALUES(`position`)",
      [
        text(shift?.id, "el id", { max: 64 }),
        time(shift?.start, "la entrada"),
        time(shift?.end, "la salida"),
        Number.isInteger(shift?.position) ? shift.position : 0,
      ]
    );
  },

  // Los dias que tenian el turno quedan sin guardia.
  async "shift.remove"(db, { id }) {
    const shiftId = text(id, "el id", { max: 64 });
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
    const guard = text(guardId, "la persona", { max: 64 });
    await db.query("INSERT IGNORE INTO vacations (day_key, guard_id) VALUES ?", [
      dayKeys(days).map((day) => [day, guard]),
    ]);
  },

  async "vacation.remove"(db, { guardId, dayKeys: days }) {
    await db.query("DELETE FROM vacations WHERE guard_id = ? AND day_key IN (?)", [
      text(guardId, "la persona", { max: 64 }),
      dayKeys(days),
    ]);
  },

  async "rotation.upsert"(db, { rotation }) {
    if (!Array.isArray(rotation?.order) || rotation.order.some((id) => typeof id !== "string")) {
      throw new BadRequest("El orden no es valido");
    }
    await db.query(
      "INSERT INTO audit_rotations (id, start_date, end_date, guard_ids) VALUES (?, ?, ?, ?) " +
        "ON DUPLICATE KEY UPDATE start_date = VALUES(start_date), end_date = VALUES(end_date), guard_ids = VALUES(guard_ids)",
      [
        text(rotation.id, "el id", { max: 64 }),
        dayKey(rotation.start, "la fecha de inicio"),
        rotation.end ? dayKey(rotation.end, "la fecha fin") : null,
        JSON.stringify(rotation.order),
      ]
    );
  },

  async "rotation.remove"(db, { id }) {
    await db.query("DELETE FROM audit_rotations WHERE id = ?", [text(id, "el id", { max: 64 })]);
  },
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!requireUser(req, res)) {
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
