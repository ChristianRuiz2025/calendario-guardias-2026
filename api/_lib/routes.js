// Rutas de /api: /api/<nombre> -> handler.

import auditorias from "../auditorias.js";
import auth from "../auth.js";
import calendar from "../calendar.js";
import enviarMes from "../enviar-mes.js";

export const ROUTES = {
  auth,
  calendar,
  "enviar-mes": enviarMes,
  auditorias,
};

// "/api/calendar" o "/api/calendar/" -> handler de calendar (o null si no existe).
export function resolveRoute(path) {
  const match = /^\/api\/([a-z-]+)\/?$/.exec(String(path ?? ""));
  return match ? (ROUTES[match[1]] ?? null) : null;
}
