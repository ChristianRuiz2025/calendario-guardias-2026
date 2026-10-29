// Logica de auditorias compartida entre la app (src/main.jsx) y la API (api/auditorias.js).

// Orden automatico de auditorias. Cada periodo rota semana a semana en el orden dado,
// desde la semana de `start` hasta la semana de `end` (null = sin fecha fin).
// Si dos periodos se enciman, manda el que empieza mas tarde.
// Se guardan en la tabla audit_rotations; estos son los valores si la tabla no existe.
export const DEFAULT_AUDIT_ROTATIONS = [
  { id: "2026-04-27", start: "2026-04-27", end: "2026-11-01", order: ["jona", "abi", "chris"] },
  { id: "2026-11-02", start: "2026-11-02", end: null, order: ["abi", "jona", "chris"] },
];

export function rotationFromRow(row) {
  return { id: row.id, start: row.start_date, end: row.end_date, order: row.guard_ids ?? [] };
}

export function rotationToRow(rotation) {
  return { id: rotation.id, start_date: rotation.start, end_date: rotation.end, guard_ids: rotation.order };
}

export function pad(value) {
  return String(value).padStart(2, "0");
}

export function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function startOfWorkWeek(date) {
  const monday = new Date(date);
  const day = monday.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  monday.setDate(monday.getDate() + offset);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export function parseDateKey(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

// Busca a la persona de la rotacion por id y, si no existe (por ejemplo, se agrego
// desde la app con un id aleatorio), por nombre: "abi" encuentra a "Abi" o "Abien".
export function findRotationGuard(rotationId, guards) {
  return (
    guards.find((guard) => guard.id === rotationId) ??
    guards.find((guard) => normalizeName(guard.name).startsWith(rotationId)) ??
    null
  );
}

export function getDefaultAuditGuard(date, guards, rotations) {
  const weekStart = startOfWorkWeek(date);
  const rotation = rotations
    .filter((period) => period.order.length > 0)
    .filter((period) => startOfWorkWeek(parseDateKey(period.start)) <= weekStart)
    .filter((period) => !period.end || weekStart <= parseDateKey(period.end))
    .sort((a, b) => a.start.localeCompare(b.start))
    .at(-1);

  if (!rotation) {
    return null;
  }

  const rotationStart = startOfWorkWeek(parseDateKey(rotation.start));
  const weeksSinceStart = Math.round((weekStart - rotationStart) / (7 * 24 * 60 * 60 * 1000));
  const guardId = rotation.order[weeksSinceStart % rotation.order.length];
  return findRotationGuard(guardId, guards);
}

// auditAssignments: { [week_key]: guard_id | null } con lo guardado en Supabase.
// rotations: periodos del orden automatico (ver DEFAULT_AUDIT_ROTATIONS).
export function getAuditGuard(date, guards, auditAssignments, rotations) {
  const key = dateKey(startOfWorkWeek(date));

  // Si la semana tiene un registro en Supabase, ese manda (null = "Sin asignar" explicito).
  if (Object.prototype.hasOwnProperty.call(auditAssignments, key)) {
    const assignedGuardId = auditAssignments[key];
    return assignedGuardId ? guards.find((guard) => guard.id === assignedGuardId) ?? null : null;
  }

  return getDefaultAuditGuard(date, guards, rotations);
}
