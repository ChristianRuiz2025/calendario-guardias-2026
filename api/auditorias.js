// GET /api/auditorias: orden de auditorias por semana para servicios externos
// (por ejemplo, notificaciones por correo).
//
// Autenticacion: header "Authorization: Bearer <AUDITORIAS_API_KEY>".
// Parametros opcionales:
//   desde=YYYY-MM-DD  cualquier dia de la primera semana (por defecto, la semana actual en CDMX)
//   semanas=N         cuantas semanas devolver, de 1 a 52 (por defecto 4)
//
// Variables de entorno en Vercel (solo servidor, sin prefijo VITE_):
//   AUDITORIAS_API_KEY y las de MySQL (ver api/_lib/db.js)

import { timingSafeEqual } from "node:crypto";
import { loadCalendar } from "./_lib/db.js";
import {
  dateKey,
  getAuditGuard,
  rotationFromRow,
  startOfWorkWeek,
} from "../src/auditRotation.js";

const TIMEZONE_ID = "America/Mexico_City";
const DEFAULT_WEEKS = 4;
const MAX_WEEKS = 52;

function isAuthorized(req) {
  const expected = process.env.AUDITORIAS_API_KEY;
  const header = req.headers.authorization ?? "";
  const received = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!expected || !received) {
    return false;
  }

  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function todayInMexico() {
  // "en-CA" da el formato YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE_ID }).format(new Date());
}

function parseDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) {
    return null;
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return dateKey(date) === value ? date : null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "No autorizado" });
  }

  const from = parseDateKey(req.query.desde ?? todayInMexico());
  if (!from) {
    return res.status(400).json({ error: "El parametro 'desde' debe tener formato YYYY-MM-DD" });
  }

  const weeks = req.query.semanas === undefined ? DEFAULT_WEEKS : Number(req.query.semanas);
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > MAX_WEEKS) {
    return res.status(400).json({ error: `El parametro 'semanas' debe ser un entero de 1 a ${MAX_WEEKS}` });
  }

  let calendar;
  try {
    calendar = await loadCalendar();
  } catch (dbError) {
    console.error(dbError);
    return res.status(500).json({ error: "No se pudo leer el calendario" });
  }

  const guards = calendar.guards;
  const auditAssignments = Object.fromEntries(calendar.auditAssignments.map((row) => [row.week_key, row.guard_id]));
  const rotations = calendar.auditRotations.map(rotationFromRow);
  const firstMonday = startOfWorkWeek(from);

  const result = Array.from({ length: weeks }, (_, index) => {
    const monday = new Date(firstMonday);
    monday.setDate(firstMonday.getDate() + index * 7);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);

    const key = dateKey(monday);
    const guard = getAuditGuard(monday, guards, auditAssignments, rotations);

    return {
      semana: key,
      hasta: dateKey(friday),
      persona: guard ? { id: guard.id, nombre: guard.name } : null,
      origen: Object.prototype.hasOwnProperty.call(auditAssignments, key) ? "manual" : "rotacion",
    };
  });

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ semanas: result });
}
