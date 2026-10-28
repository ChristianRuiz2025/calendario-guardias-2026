import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  LogOut,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import "./styles.css";
import Login from "./Login";
import { supabase } from "./supabaseClient";
import { useCalendarData } from "./useCalendarData";

const YEAR = 2026;
const TIMEZONE_ID = "America/Mexico_City";

const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const WEEKDAYS = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Auditorias"];

const SHIFT_TEMPLATES = [
  { id: "08-17", label: "8 a 5", start: "08:00", end: "17:00", row: 0 },
  { id: "09-18", label: "9 a 6", start: "09:00", end: "18:00", row: 1 },
  { id: "10-19", label: "10 a 7", start: "10:00", end: "19:00", row: 2 },
];

// Rotacion por defecto de auditorias. Cada periodo empieza el lunes indicado y
// rota semana a semana en el orden dado hasta que empieza el siguiente periodo.
const AUDIT_ROTATIONS = [
  { start: new Date(YEAR, 3, 27), order: ["jona", "abi", "chris"] },
  { start: new Date(YEAR, 10, 2), order: ["abi", "jona", "chris"] },
];

const HOLIDAYS_2026 = new Set([
  "2026-01-01",
  "2026-02-02",
  "2026-03-16",
  "2026-04-02",
  "2026-04-03",
  "2026-05-01",
  "2026-09-16",
  "2026-11-16",
  "2026-12-12",
  "2026-12-24",
  "2026-12-25",
  "2026-12-31",
]);

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayMarkerClasses(date, monthIndex) {
  if (date.getMonth() !== monthIndex) {
    return "";
  }

  return [
    date.getDay() === 2 || date.getDay() === 5 ? "office-day" : "",
    date.getDate() === new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate() ? "month-end-day" : "",
    date.getDate() === 6 ? "ms-close-day" : "",
  ].join(" ");
}

function startOfWorkWeek(date) {
  const monday = new Date(date);
  const day = monday.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  monday.setDate(monday.getDate() + offset);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function weekKey(week) {
  return dateKey(startOfWorkWeek(week[0]));
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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

function getDefaultAuditGuardForWeek(week, guards) {
  const weekStart = startOfWorkWeek(week[0]);
  const rotation = AUDIT_ROTATIONS.filter((period) => startOfWorkWeek(period.start) <= weekStart).at(-1);

  if (!rotation) {
    return null;
  }

  const weeksSinceStart = Math.round((weekStart - startOfWorkWeek(rotation.start)) / (7 * 24 * 60 * 60 * 1000));
  const guardId = rotation.order[weeksSinceStart % rotation.order.length];
  return findRotationGuard(guardId, guards);
}

function getAuditGuardForWeek(week, guards, auditAssignments) {
  const key = weekKey(week);

  // Si la semana tiene un registro en Supabase, ese manda (null = "Sin asignar" explicito).
  if (Object.prototype.hasOwnProperty.call(auditAssignments, key)) {
    const assignedGuardId = auditAssignments[key];
    return assignedGuardId ? guards.find((guard) => guard.id === assignedGuardId) ?? null : null;
  }

  return getDefaultAuditGuardForWeek(week, guards);
}

function getMonthWeeks(monthIndex) {
  const first = new Date(YEAR, monthIndex, 1);
  const start = startOfWorkWeek(first);
  const weeks = [];

  for (let weekIndex = 0; weekIndex < 6; weekIndex += 1) {
    const week = Array.from({ length: 5 }, (_, dayIndex) => {
      const date = new Date(start);
      date.setDate(start.getDate() + weekIndex * 7 + dayIndex);
      return date;
    });

    if (week.some((date) => date.getMonth() === monthIndex)) {
      weeks.push(week);
    }
  }

  return weeks;
}

function assignmentKey(dayKey, guardId) {
  return `${dayKey}|${guardId}`;
}

function nextShiftId(currentShiftId) {
  if (!currentShiftId) {
    return SHIFT_TEMPLATES[0].id;
  }

  const currentIndex = SHIFT_TEMPLATES.findIndex((shift) => shift.id === currentShiftId);
  return currentIndex >= 0 && currentIndex < SHIFT_TEMPLATES.length - 1
    ? SHIFT_TEMPLATES[currentIndex + 1].id
    : "";
}

function buildSchedule(guards, assignments) {
  const schedule = {};

  for (let month = 0; month < 12; month += 1) {
    const daysInMonth = new Date(YEAR, month + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(YEAR, month, day);
      const key = dateKey(date);
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      const isHoliday = HOLIDAYS_2026.has(key);

      if (isWeekend || isHoliday || guards.length === 0) {
        schedule[key] = [];
        continue;
      }

      schedule[key] = guards.map((guard) => {
        const assignedShiftId = assignments[assignmentKey(key, guard.id)];
        const shift = SHIFT_TEMPLATES.find((item) => item.id === assignedShiftId);

        return shift
          ? {
              ...shift,
              guard,
            }
          : null;
      }).filter(Boolean);
    }
  }

  return schedule;
}

function escapeIcsText(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function formatIcsDateTime(date, time) {
  const [hours, minutes] = time.split(":");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${hours}${minutes}00`;
}

function makeTimezoneBlock() {
  return [
    "BEGIN:VTIMEZONE",
    `TZID:${TIMEZONE_ID}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:-0600",
    "TZOFFSETTO:-0600",
    "TZNAME:CST",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
}

function makeIcs(
  monthIndex,
  schedule,
  selectedGuardId = "all",
  exportId = crypto.randomUUID(),
  calendarName = `Guardias ${MONTHS[monthIndex]} ${YEAR}`
) {
  const events = [];
  const daysInMonth = new Date(YEAR, monthIndex + 1, 0).getDate();
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(YEAR, monthIndex, day);
    const shifts = (schedule[dateKey(date)] ?? []).filter(
      (shift) => selectedGuardId === "all" || shift.guard.id === selectedGuardId
    );
    shifts.forEach((shift) => {
      const blocks = [
        {
          id: "antes-entrada",
          start: "00:00",
          end: shift.start,
          title: `Fuera de oficina ${shift.guard.name} antes de entrada`,
        },
        {
          id: "despues-salida",
          start: shift.end,
          end: "23:59",
          title: `Fuera de oficina ${shift.guard.name} despues de salida`,
        },
      ];

      blocks.forEach((block) => {
        const description = `Fuera de oficina. Horario laboral ${shift.start} - ${shift.end}.`;
        const uid = `${exportId}-${YEAR}-${pad(monthIndex + 1)}-${pad(day)}-${shift.id}-${shift.guard.id}-${block.id}@guardias-2026`;

        events.push(
          [
            "BEGIN:VEVENT",
            `UID:${uid}`,
            `DTSTAMP:${stamp}`,
            `DTSTART;TZID=${TIMEZONE_ID}:${formatIcsDateTime(date, block.start)}`,
            `DTEND;TZID=${TIMEZONE_ID}:${formatIcsDateTime(date, block.end)}`,
            `SUMMARY:${escapeIcsText(block.title)}`,
            `DESCRIPTION:${escapeIcsText(description)}`,
            "CATEGORIES:Fuera de oficina",
            "CLASS:PUBLIC",
            "TRANSP:OPAQUE",
            "STATUS:CONFIRMED",
            "X-MICROSOFT-CDO-ALLDAYEVENT:FALSE",
            "X-MICROSOFT-CDO-BUSYSTATUS:OOF",
            "X-MICROSOFT-CDO-INTENDEDSTATUS:OOF",
            "END:VEVENT",
          ].join("\r\n")
        );
      });
    });
  }

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Calendario Guardias 2026//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    `NAME:${escapeIcsText(calendarName)}`,
    `X-WR-TIMEZONE:${TIMEZONE_ID}`,
    ...makeTimezoneBlock(),
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function App() {
  const [session, setSession] = useState(undefined);
  // Abre en el mes actual (si estamos fuera de 2026, en enero).
  const [monthIndex, setMonthIndex] = useState(() => {
    const today = new Date();
    return today.getFullYear() === YEAR ? today.getMonth() : 0;
  });
  const [selectedGuardId, setSelectedGuardId] = useState("all");
  const {
    guards,
    assignments,
    auditAssignments,
    loading,
    error,
    updateGuard,
    addGuard,
    removeGuard,
    resetGuards,
    updateAssignment,
    updateAuditAssignment,
    resetAssignments,
  } = useCalendarData();
  const schedule = useMemo(() => buildSchedule(guards, assignments), [guards, assignments]);
  const monthWeeks = useMemo(() => getMonthWeeks(monthIndex), [monthIndex]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => authListener.subscription.unsubscribe();
  }, []);

  const monthEvents = useMemo(() => {
    const daysInMonth = new Date(YEAR, monthIndex + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, index) => {
      const date = new Date(YEAR, monthIndex, index + 1);
      return schedule[dateKey(date)] ?? [];
    })
      .flat()
      .filter((shift) => selectedGuardId === "all" || shift.guard.id === selectedGuardId);
  }, [monthIndex, schedule, selectedGuardId]);

  function cycleAssignment(dayKey, guardId, currentShiftId) {
    updateAssignment(dayKey, guardId, nextShiftId(currentShiftId));
  }

  function handleRemoveGuard(id) {
    removeGuard(id);
    if (selectedGuardId === id) {
      setSelectedGuardId("all");
    }
  }

  function downloadMonth() {
    const guardName =
      selectedGuardId === "all" ? "Todos" : guards.find((guard) => guard.id === selectedGuardId)?.name ?? "Guardia";
    const calendarName = `Guardias ${guardName} - ${MONTHS[monthIndex]} ${YEAR}`;
    const content = makeIcs(monthIndex, schedule, selectedGuardId, crypto.randomUUID(), calendarName);
    const guardSlug =
      selectedGuardId === "all"
        ? "todos"
        : guards.find((guard) => guard.id === selectedGuardId)?.name.toLowerCase().replace(/\s+/g, "-") ??
          "guardia";
    downloadTextFile(
      `guardias-${guardSlug}-${YEAR}-${pad(monthIndex + 1)}-${MONTHS[monthIndex].toLowerCase()}.ics`,
      content
    );
  }

  function downloadAll() {
    const exportId = crypto.randomUUID();
    const guardName =
      selectedGuardId === "all" ? "Todos" : guards.find((guard) => guard.id === selectedGuardId)?.name ?? "Guardia";
    const calendarName = `Guardias ${guardName} - ${YEAR}`;
    const content = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Calendario Guardias 2026//ES",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
      `NAME:${escapeIcsText(calendarName)}`,
      `X-WR-TIMEZONE:${TIMEZONE_ID}`,
      ...makeTimezoneBlock(),
      ...Array.from({ length: 12 }, (_, index) =>
        makeIcs(index, schedule, selectedGuardId, exportId, calendarName).split("\r\n").filter((line) => {
          return ![
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Calendario Guardias 2026//ES",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
            `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
            `NAME:${escapeIcsText(calendarName)}`,
            `X-WR-TIMEZONE:${TIMEZONE_ID}`,
            "BEGIN:VTIMEZONE",
            `TZID:${TIMEZONE_ID}`,
            "BEGIN:STANDARD",
            "DTSTART:19700101T000000",
            "TZOFFSETFROM:-0600",
            "TZOFFSETTO:-0600",
            "TZNAME:CST",
            "END:STANDARD",
            "END:VTIMEZONE",
            "END:VCALENDAR",
          ].includes(line);
        })
      ).flat(),
      "END:VCALENDAR",
    ].join("\r\n");
    const guardSlug =
      selectedGuardId === "all"
        ? "todos"
        : guards.find((guard) => guard.id === selectedGuardId)?.name.toLowerCase().replace(/\s+/g, "-") ??
          "guardia";
    downloadTextFile(`guardias-${guardSlug}-${YEAR}-todo-el-anio.ics`, content);
  }

  if (session === undefined || (session && loading)) {
    return (
      <main className="app-shell">
        <p>Cargando calendario...</p>
      </main>
    );
  }

  if (!session) {
    return <Login />;
  }

  if (error) {
    return (
      <main className="app-shell">
        <p>{error}</p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <aside className="sidebar">
          <div className="brand">
            <CalendarDays aria-hidden="true" />
            <div>
              <h1>Guardias 2026</h1>
              <p>Outlook fuera de oficina</p>
            </div>
            <button
              className="icon-button"
              onClick={() => supabase.auth.signOut()}
              aria-label="Cerrar sesion"
              title="Cerrar sesion"
              style={{ marginLeft: "auto" }}
            >
              <LogOut size={18} />
            </button>
          </div>

          <div className="panel">
            <div className="panel-title">
              <h2>Mes</h2>
            </div>
            <div className="month-grid">
              {MONTHS.map((month, index) => (
                <button
                  key={month}
                  className={index === monthIndex ? "active" : ""}
                  onClick={() => setMonthIndex(index)}
                >
                  {month.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">
              <h2>Guardias</h2>
              <button className="icon-button" onClick={addGuard} aria-label="Agregar guardia" title="Agregar guardia">
                <Plus size={18} />
              </button>
            </div>
            <div className="guard-list">
              {guards.map((guard) => (
                <div className="guard-row" key={guard.id}>
                  <input
                    className="swatch"
                    type="color"
                    value={guard.color}
                    onChange={(event) => updateGuard(guard.id, "color", event.target.value)}
                    aria-label={`Color de ${guard.name}`}
                  />
                  <input
                    value={guard.initials}
                    onChange={(event) => updateGuard(guard.id, "initials", event.target.value)}
                    aria-label={`Iniciales de ${guard.name}`}
                  />
                  <input
                    value={guard.name}
                    onChange={(event) => updateGuard(guard.id, "name", event.target.value)}
                    aria-label={`Nombre de ${guard.name}`}
                  />
                  <button
                    className="icon-button danger"
                    onClick={() => handleRemoveGuard(guard.id)}
                    aria-label={`Eliminar ${guard.name}`}
                    title="Eliminar guardia"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <button className="reset-button" onClick={resetGuards}>
              <RotateCcw size={16} />
              Reiniciar personas
            </button>
          </div>

          <div className="panel shift-panel">
            <div className="panel-title">
              <h2>Turnos fijos</h2>
            </div>
            {SHIFT_TEMPLATES.map((shift) => (
              <div key={shift.id} className="shift-line">
                <span>{shift.label}</span>
                <strong>
                  {shift.start} - {shift.end}
                </strong>
              </div>
            ))}
            <button className="reset-button" onClick={resetAssignments}>
              <RotateCcw size={16} />
              Reiniciar asignaciones
            </button>
          </div>

          <div className="panel export-panel">
            <h2>Exportar ICS</h2>
            <label htmlFor="guard-export">Citas para</label>
            <select
              id="guard-export"
              value={selectedGuardId}
              onChange={(event) => setSelectedGuardId(event.target.value)}
            >
              <option value="all">Todos los guardias</option>
              {guards.map((guard) => (
                <option key={guard.id} value={guard.id}>
                  {guard.name}
                </option>
              ))}
            </select>
          </div>
        </aside>

        <section className="calendar-area">
          <header className="topbar">
            <div>
              <p className="eyebrow">Calendario anual</p>
              <h2>
                {MONTHS[monthIndex]} {YEAR}
              </h2>
            </div>
            <div className="toolbar">
              <button
                className="icon-button"
                onClick={() => setMonthIndex((monthIndex + 11) % 12)}
                aria-label="Mes anterior"
                title="Mes anterior"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                className="icon-button"
                onClick={() => setMonthIndex((monthIndex + 1) % 12)}
                aria-label="Mes siguiente"
                title="Mes siguiente"
              >
                <ChevronRight size={20} />
              </button>
              <button className="download-button" onClick={downloadMonth}>
                <Download size={18} />
                Descargar mes
              </button>
              <button className="download-button secondary" onClick={downloadAll}>
                <Download size={18} />
                Descargar 2026
              </button>
            </div>
          </header>

          <div className="calendar-wrap">
            <table className="guard-calendar">
              <thead>
                <tr className="month-row">
                  <th>Entrada</th>
                  <th colSpan="6">
                    {MONTHS[monthIndex]} {YEAR}
                  </th>
                </tr>
                <tr>
                  <th className="time-head"></th>
                  {WEEKDAYS.map((day) => (
                    <th key={day}>{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthWeeks.map((week, weekIndex) => (
                  <React.Fragment key={weekIndex}>
                    <tr className="date-row">
                      <th></th>
                      {week.map((date) => (
                        <td
                          key={date.toISOString()}
                          className={[
                            date.getMonth() === monthIndex ? "" : "outside",
                            dayMarkerClasses(date, monthIndex),
                          ].join(" ")}
                        >
                          <span>{date.getDate()}</span>
                        </td>
                      ))}
                      <td className="audit-date-cell"></td>
                    </tr>
                    <tr className="schedule-row">
                      <th className="time-stack">
                        <span>8:00</span>
                        <span>9:00</span>
                        <span>10:00</span>
                      </th>
                      {week.map((date) => {
                        const key = dateKey(date);
                        const isOutside = date.getMonth() !== monthIndex;
                        const isHoliday = HOLIDAYS_2026.has(key);
                        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                        const entries = schedule[key] ?? [];

                        return (
                          <td
                            key={`${key}-schedule`}
                            className={[
                              isOutside ? "outside" : "",
                              isWeekend ? "weekend" : "",
                              isHoliday ? "holiday" : "",
                              dayMarkerClasses(date, monthIndex),
                            ].join(" ")}
                          >
                            {!isOutside && !isWeekend && !isHoliday ? (
                              <div className="day-columns">
                                {guards.map((guard, guardIndex) => {
                                  const entry = entries.find((item) => item.guard.id === guard.id);
                                  const currentAssignment =
                                    assignments[assignmentKey(key, guard.id)] ?? entry?.id ?? "";
                                  const selectedShift = SHIFT_TEMPLATES.find((item) => item.id === currentAssignment);
                                  const span = selectedShift ? 3 - selectedShift.row : 3;
                                  const rowStart = selectedShift ? selectedShift.row + 1 : 1;

                                  return (
                                    <button
                                      type="button"
                                      key={guard.id}
                                      className={[
                                        "assignment-column",
                                        !selectedShift ? "off-duty" : "",
                                      ].join(" ")}
                                      onClick={() => cycleAssignment(key, guard.id, currentAssignment)}
                                      style={{
                                        backgroundColor: selectedShift ? guard.color : undefined,
                                        gridColumn: guardIndex + 1,
                                        gridRow: `${rowStart} / span ${span}`,
                                      }}
                                      title={
                                        selectedShift
                                          ? `${guard.name}: ${selectedShift.start} - ${selectedShift.end}. Click para cambiar.`
                                          : `${guard.name}: Sin guardia. Click para cambiar.`
                                      }
                                    >
                                      {guard.initials}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : isHoliday && !isOutside ? (
                              <span className="no-class">No hay Clases</span>
                            ) : null}
                          </td>
                        );
                      })}
                      <td className="audit-cell">
                        {(() => {
                          const auditGuard = getAuditGuardForWeek(week, guards, auditAssignments);
                          return (
                            <select
                              className={["audit-select", auditGuard ? "" : "unassigned"].join(" ")}
                              value={auditGuard?.id ?? ""}
                              onChange={(event) => updateAuditAssignment(weekKey(week), event.target.value || null)}
                              style={{ backgroundColor: auditGuard?.color }}
                              title={
                                auditGuard
                                  ? `Auditorias: ${auditGuard.name}. Click para cambiar.`
                                  : "Auditorias: sin asignar. Click para elegir."
                              }
                              aria-label={`Auditorias semana del ${weekKey(week)}`}
                            >
                              <option value="">Sin asignar</option>
                              {guards.map((guard) => (
                                <option key={guard.id} value={guard.id}>
                                  {guard.name}
                                </option>
                              ))}
                            </select>
                          );
                        })()}
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="legend-bar" aria-label="Simbologia">
            <span>
              <i className="legend-swatch office"></i>
              Dias de oficina
            </span>
            <span>
              <i className="legend-swatch month-end"></i>
              Guardias fin de Mes
            </span>
            <span>
              <i className="legend-swatch ms-close"></i>
              Cierre MS
            </span>
          </div>

          <footer className="summary-bar">
            <span>{monthEvents.length * 2} citas fuera de oficina en el mes</span>
            <span>Cada horario laboral genera 00:00-entrada y salida-23:59.</span>
          </footer>
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
