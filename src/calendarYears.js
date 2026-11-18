// Anios que maneja el calendario. Para agregar uno, basta con extender LAST_YEAR (y dar de alta sus
// feriados en Configuracion > Dias feriados). La API valida el anio con estos mismos valores.

export const FIRST_YEAR = 2026;
export const LAST_YEAR = 2028;
export const MIN_DATE = `${FIRST_YEAR}-01-01`;
export const MAX_DATE = `${LAST_YEAR}-12-31`;

// Mes como numero continuo (anio * 12 + mes) para avanzar y retroceder entre anios.
export function monthNumber(year, monthIndex) {
  return year * 12 + monthIndex;
}

export function fromMonthNumber(value) {
  return { year: Math.floor(value / 12), monthIndex: value % 12 };
}

// Limita un mes al rango del calendario (enero del primer anio a diciembre del ultimo).
export function clampMonth(year, monthIndex) {
  const value = Math.min(
    Math.max(monthNumber(year, monthIndex), monthNumber(FIRST_YEAR, 0)),
    monthNumber(LAST_YEAR, 11)
  );
  return fromMonthNumber(value);
}

export function isValidYear(year) {
  return Number.isInteger(year) && year >= FIRST_YEAR && year <= LAST_YEAR;
}
