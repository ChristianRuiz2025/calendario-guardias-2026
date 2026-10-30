// Decide quien debe estar disponible en InvGate (dentro del grupo que recibe solicitudes)
// en un momento dado, con la informacion del calendario. Lo usa api/invgate-sync.js.
//
// Reglas, por persona:
// - fin de semana o feriado: no disponible
// - vacaciones ese dia: no disponible
// - tiene turno ese dia: disponible solo de su hora de entrada a su hora de salida
// - dia habil sin turno asignado: disponible todo el dia (no se le quitan solicitudes)

export const INVGATE_TIMEZONE = "America/Mexico_City";

// Fecha "YYYY-MM-DD", hora "HH:MM" y dia de la semana (0 = domingo) en la Ciudad de Mexico.
export function mexicoNow(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: INVGATE_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dayKey: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    weekday: weekdays[parts.weekday],
  };
}

// assignments y vacations usan llaves "YYYY-MM-DD|guardId", igual que en la app.
export function computeAvailability({ guards, shifts, assignments, holidays, vacations, now }) {
  const { dayKey, time, weekday } = now;
  const isWeekend = weekday === 0 || weekday === 6;
  const isHoliday = dayKey in holidays;

  return guards.map((guard) => {
    const key = `${dayKey}|${guard.id}`;
    if (isWeekend) {
      return { guard, available: false, reason: "Fin de semana" };
    }
    if (isHoliday) {
      return { guard, available: false, reason: `Feriado${holidays[dayKey] ? `: ${holidays[dayKey]}` : ""}` };
    }
    if (vacations[key]) {
      return { guard, available: false, reason: "Vacaciones" };
    }

    const shift = shifts.find((item) => item.id === assignments[key]);
    if (!shift) {
      return { guard, available: true, reason: "Sin turno asignado (disponible todo el dia)" };
    }
    const label = `${shift.start.replace(/^0/, "")} a ${shift.end.replace(/^0/, "")}`;
    if (time < shift.start) {
      return { guard, available: false, reason: `Antes de su entrada (${label})` };
    }
    if (time >= shift.end) {
      return { guard, available: false, reason: `Despues de su salida (${label})` };
    }
    return { guard, available: true, reason: `En turno (${label})` };
  });
}
