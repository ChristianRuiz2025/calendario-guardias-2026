// Reglas del calendario que comparten la app y la API.

import { dateKey } from "./auditRotation.js";

export function isWorkingDay(date, holidays) {
  return date.getDay() >= 1 && date.getDay() <= 5 && !(dateKey(date) in holidays);
}

// Fechas de cierre del anio:
// - fin de mes: ultimo dia habil del mes (se recorre hacia atras)
// - cierre MS: el dia msCloseDay de cada mes, o el siguiente dia habil
export function buildCloseDays(year, holidays, msCloseDay) {
  const monthEndDays = new Set();
  const msCloseDays = new Set();

  for (let month = 0; month < 12; month += 1) {
    const monthEnd = new Date(year, month + 1, 0);
    while (!isWorkingDay(monthEnd, holidays)) {
      monthEnd.setDate(monthEnd.getDate() - 1);
    }
    monthEndDays.add(dateKey(monthEnd));

    const msClose = new Date(year, month, Math.min(msCloseDay, monthEnd.getDate()));
    while (!isWorkingDay(msClose, holidays)) {
      msClose.setDate(msClose.getDate() + 1);
    }
    msCloseDays.add(dateKey(msClose));
  }

  return { monthEndDays, msCloseDays };
}
