// Rotacion de oficina: cada dia de oficina va una persona, en el orden dado, empezando en `start`.
// Solo cuentan los dias de oficina habiles (si cae feriado, a esa persona le toca el siguiente dia
// de oficina). Se guarda en app_settings con la llave "office_rotation".

import { dateKey, findRotationGuard, parseDateKey } from "./auditRotation.js";
import { isWorkingDay } from "./calendarRules.js";

// Orden acordado: Jona, Chris, Abi, empezando en noviembre de 2026.
export const DEFAULT_OFFICE_ROTATION = { start: "2026-11-02", order: ["jona", "chris", "abi"] };

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeOfficeRotation(value) {
  if (!value || typeof value !== "object" || !DAY_KEY.test(String(value.start ?? "")) || !Array.isArray(value.order)) {
    return DEFAULT_OFFICE_ROTATION;
  }
  return { start: value.start, order: value.order.map(String).slice(0, 50) };
}

// Personas de la rotacion, sin repetir, en su orden (los ids o nombres que ya no existen se omiten).
export function resolveOfficeOrder(order, guards) {
  const result = [];
  order.forEach((entry) => {
    const guard = findRotationGuard(entry, guards);
    if (guard && !result.includes(guard)) {
      result.push(guard);
    }
  });
  return result;
}

// { "YYYY-MM-DD": guard } de cada dia de oficina desde el inicio de la rotacion hasta `untilKey`.
export function buildOfficeSchedule(rotation, officeDays, holidays, guards, untilKey) {
  const people = resolveOfficeOrder(rotation.order, guards);
  const schedule = {};
  if (people.length === 0 || !DAY_KEY.test(String(rotation.start ?? ""))) {
    return schedule;
  }
  let turn = 0;
  for (let date = parseDateKey(rotation.start); dateKey(date) <= untilKey; date.setDate(date.getDate() + 1)) {
    if (officeDays.includes(date.getDay()) && isWorkingDay(date, holidays)) {
      schedule[dateKey(date)] = people[turn % people.length];
      turn += 1;
    }
  }
  return schedule;
}
