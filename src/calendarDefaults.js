// Valores por defecto que usan la app y la API mientras no existan sus tablas en Supabase.

// Turnos por defecto. Los ids se guardan en shift_assignments, asi que no cambian
// aunque se editen los horarios.
export const DEFAULT_SHIFTS = [
  { id: "08-17", start: "08:00", end: "17:00", position: 0 },
  { id: "09-18", start: "09:00", end: "18:00", position: 1 },
  { id: "10-19", start: "10:00", end: "19:00", position: 2 },
];

// Feriados por defecto, mientras no exista la tabla holidays.
export const DEFAULT_HOLIDAYS = {
  "2026-01-01": "Año nuevo",
  "2026-02-02": "Constitución mexicana",
  "2026-03-16": "Natalicio de Benito Juárez",
  "2026-04-02": "Días Santos",
  "2026-04-03": "Días Santos",
  "2026-05-01": "Día del trabajo",
  "2026-09-16": "Independencia de México",
  "2026-11-16": "Revolución mexicana",
  "2026-12-12": "Día de la Virgen de Guadalupe",
  "2026-12-24": "Noche buena",
  "2026-12-25": "Navidad",
  "2026-12-31": "Fin de año",
};
