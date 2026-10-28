// Logica de auditorias compartida entre la app (src/main.jsx) y la API (api/auditorias.js).

// Rotacion por defecto de auditorias. Cada periodo empieza el lunes indicado y
// rota semana a semana en el orden dado hasta que empieza el siguiente periodo.
export const AUDIT_ROTATIONS = [
  { start: new Date(2026, 3, 27), order: ["jona", "abi", "chris"] },
  { start: new Date(2026, 10, 2), order: ["abi", "jona", "chris"] },
];

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

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

// Busca a la persona de la rotacion por id y, si no existe (por ejemplo, se agrego
// desde la app con un id aleatorio), por nombre: "abi" encuentra a "Abi" o "Abien".
function findRotationGuard(rotationId, guards) {
  return (
    guards.find((guard) => guard.id === rotationId) ??
    guards.find((guard) => normalizeName(guard.name).startsWith(rotationId)) ??
    null
  );
}

export function getDefaultAuditGuard(date, guards) {
  const weekStart = startOfWorkWeek(date);
  const rotation = AUDIT_ROTATIONS.filter((period) => startOfWorkWeek(period.start) <= weekStart).at(-1);

  if (!rotation) {
    return null;
  }

  const weeksSinceStart = Math.round((weekStart - startOfWorkWeek(rotation.start)) / (7 * 24 * 60 * 60 * 1000));
  const guardId = rotation.order[weeksSinceStart % rotation.order.length];
  return findRotationGuard(guardId, guards);
}

// auditAssignments: { [week_key]: guard_id | null } con lo guardado en Supabase.
export function getAuditGuard(date, guards, auditAssignments) {
  const key = dateKey(startOfWorkWeek(date));

  // Si la semana tiene un registro en Supabase, ese manda (null = "Sin asignar" explicito).
  if (Object.prototype.hasOwnProperty.call(auditAssignments, key)) {
    const assignedGuardId = auditAssignments[key];
    return assignedGuardId ? guards.find((guard) => guard.id === assignedGuardId) ?? null : null;
  }

  return getDefaultAuditGuard(date, guards);
}
