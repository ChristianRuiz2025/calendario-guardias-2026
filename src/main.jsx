import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  LogOut,
  Moon,
  Settings,
  Sun,
} from "lucide-react";
import "./styles.css";
import Login from "./Login";
import { supabase } from "./supabaseClient";
import { useCalendarData } from "./useCalendarData";
import SettingsModal from "./SettingsModal";
import VacationPanel from "./VacationPanel";
import { useTheme } from "./useTheme";
import { dateKey, getAuditGuard, pad, startOfWorkWeek } from "./auditRotation";

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

function isWorkingDay(date, holidays) {
  return date.getDay() >= 1 && date.getDay() <= 5 && !(dateKey(date) in holidays);
}

// Fechas de cierre del anio:
// - fin de mes: ultimo dia habil del mes (se recorre hacia atras)
// - cierre MS: el dia msCloseDay de cada mes, o el siguiente dia habil
function buildCloseDays(holidays, msCloseDay) {
  const monthEndDays = new Set();
  const msCloseDays = new Set();

  for (let month = 0; month < 12; month += 1) {
    const monthEnd = new Date(YEAR, month + 1, 0);
    while (!isWorkingDay(monthEnd, holidays)) {
      monthEnd.setDate(monthEnd.getDate() - 1);
    }
    monthEndDays.add(dateKey(monthEnd));

    const msClose = new Date(YEAR, month, Math.min(msCloseDay, monthEnd.getDate()));
    while (!isWorkingDay(msClose, holidays)) {
      msClose.setDate(msClose.getDate() + 1);
    }
    msCloseDays.add(dateKey(msClose));
  }

  return { monthEndDays, msCloseDays };
}

function dayMarkerClasses(date, monthIndex, officeDays, closeDays) {
  if (date.getMonth() !== monthIndex) {
    return "";
  }

  const key = dateKey(date);
  return [
    officeDays.includes(date.getDay()) ? "office-day" : "",
    closeDays.monthEndDays.has(key) ? "month-end-day" : "",
    closeDays.msCloseDays.has(key) ? "ms-close-day" : "",
  ].join(" ");
}

function weekKey(week) {
  return dateKey(startOfWorkWeek(week[0]));
}

function getAuditGuardForWeek(week, guards, auditAssignments, auditRotations) {
  return getAuditGuard(week[0], guards, auditAssignments, auditRotations);
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

function nextShiftId(currentShiftId, shifts) {
  if (!currentShiftId) {
    return shifts[0].id;
  }

  const currentIndex = shifts.findIndex((shift) => shift.id === currentShiftId);
  return currentIndex >= 0 && currentIndex < shifts.length - 1 ? shifts[currentIndex + 1].id : "";
}

// "08:00" -> "8:00"
function formatShiftTime(time) {
  return time.replace(/^0/, "");
}

function buildSchedule(guards, assignments, shifts, holidays, vacations) {
  const schedule = {};

  for (let month = 0; month < 12; month += 1) {
    const daysInMonth = new Date(YEAR, month + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(YEAR, month, day);
      const key = dateKey(date);
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      const isHoliday = key in holidays;

      if (isWeekend || isHoliday || guards.length === 0) {
        schedule[key] = [];
        continue;
      }

      // Quien esta de vacaciones ese dia no tiene turno.
      schedule[key] = guards.map((guard) => {
        if (vacations[assignmentKey(key, guard.id)]) {
          return null;
        }
        const assignedShiftId = assignments[assignmentKey(key, guard.id)];
        const shift = shifts.find((item) => item.id === assignedShiftId);

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

// Texto negro o blanco segun que tan claro sea el color de fondo ("#b77af1" -> "#111111").
function contrastText(hexColor) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hexColor ?? "");
  if (!match) {
    return "#ffffff";
  }
  const value = parseInt(match[1], 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#111111" : "#ffffff";
}

// El color de la persona que inicio sesion se vuelve el acento de toda la app.
function applyAccentColor(color) {
  const style = document.documentElement.style;
  if (!color) {
    ["--accent", "--accent-contrast", "--brand-bg", "--brand-border", "--brand-text"].forEach((name) =>
      style.removeProperty(name)
    );
    return;
  }
  const text = contrastText(color);
  style.setProperty("--accent", color);
  style.setProperty("--accent-contrast", text);
  style.setProperty("--brand-bg", color);
  style.setProperty("--brand-border", "rgba(0, 0, 0, 0.18)");
  style.setProperty("--brand-text", text);
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

function formatIcsDate(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

// Semanas (lunes) del anio con la persona de auditorias que les toca.
function buildAuditWeeks(guards, auditAssignments, auditRotations) {
  const weeks = [];
  const monday = startOfWorkWeek(new Date(YEAR, 0, 1));
  if (monday.getFullYear() < YEAR) {
    monday.setDate(monday.getDate() + 7);
  }

  while (monday.getFullYear() === YEAR) {
    const guard = getAuditGuard(monday, guards, auditAssignments, auditRotations);
    if (guard) {
      weeks.push({ monday: new Date(monday), guard });
    }
    monday.setDate(monday.getDate() + 7);
  }

  return weeks;
}

// Un evento de todo el dia de lunes a viernes por cada semana de auditorias.
// Cada semana cuenta en el mes de su lunes.
function makeAuditEvents(auditWeeks, monthIndex, selectedGuardId, exportId, stamp) {
  return auditWeeks
    .filter(({ monday, guard }) => {
      return (
        monday.getMonth() === monthIndex &&
        (selectedGuardId === "all" || guard.id === selectedGuardId)
      );
    })
    .map(({ monday, guard }) => {
      const saturday = new Date(monday);
      saturday.setDate(monday.getDate() + 5);

      return [
        "BEGIN:VEVENT",
        `UID:${exportId}-auditorias-${dateKey(monday)}-${guard.id}@guardias-2026`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${formatIcsDate(monday)}`,
        `DTEND;VALUE=DATE:${formatIcsDate(saturday)}`,
        `SUMMARY:${escapeIcsText(`Auditorias ${guard.name}`)}`,
        `DESCRIPTION:${escapeIcsText(`Semana de auditorias de ${guard.name} (lunes a viernes).`)}`,
        "CATEGORIES:Auditorias",
        "CLASS:PUBLIC",
        "TRANSP:TRANSPARENT",
        "STATUS:CONFIRMED",
        "X-MICROSOFT-CDO-ALLDAYEVENT:TRUE",
        "X-MICROSOFT-CDO-BUSYSTATUS:FREE",
        "X-MICROSOFT-CDO-INTENDEDSTATUS:FREE",
        "END:VEVENT",
      ].join("\r\n");
    });
}

// Un evento de 8:00 a 19:00 por cada dia de vacaciones del mes.
function makeVacationEvents(vacations, guard, monthIndex, exportId, stamp) {
  const daysInMonth = new Date(YEAR, monthIndex + 1, 0).getDate();
  const events = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(YEAR, monthIndex, day);
    if (!vacations[assignmentKey(dateKey(date), guard.id)]) {
      continue;
    }

    events.push(
      [
        "BEGIN:VEVENT",
        `UID:${exportId}-vacaciones-${dateKey(date)}-${guard.id}@guardias-2026`,
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=${TIMEZONE_ID}:${formatIcsDateTime(date, "08:00")}`,
        `DTEND;TZID=${TIMEZONE_ID}:${formatIcsDateTime(date, "19:00")}`,
        `SUMMARY:${escapeIcsText(`Vacaciones ${guard.name}`)}`,
        `DESCRIPTION:${escapeIcsText(`${guard.name} de vacaciones. No disponible de 8:00 a 19:00.`)}`,
        "CATEGORIES:Vacaciones",
        "CLASS:PUBLIC",
        "TRANSP:OPAQUE",
        "STATUS:CONFIRMED",
        "X-MICROSOFT-CDO-ALLDAYEVENT:FALSE",
        "X-MICROSOFT-CDO-BUSYSTATUS:OOF",
        "X-MICROSOFT-CDO-INTENDEDSTATUS:OOF",
        "END:VEVENT",
      ].join("\r\n")
    );
  }

  return events;
}

function makeIcsCalendar(calendarName, events) {
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

  return makeIcsCalendar(calendarName, events);
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
  const {
    guards,
    assignments,
    auditAssignments,
    shifts,
    holidays,
    officeDays,
    msCloseDay,
    auditRotations,
    vacations,
    loading,
    error,
    updateGuard,
    addGuard,
    removeGuard,
    updateAssignment,
    updateAuditAssignment,
    updateShift,
    addShift,
    removeShift,
    updateOfficeDays,
    updateMsCloseDay,
    addHoliday,
    removeHoliday,
    saveAuditRotation,
    removeAuditRotation,
    addVacationDays,
    removeVacationDays,
  } = useCalendarData();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const schedule = useMemo(
    () => buildSchedule(guards, assignments, shifts, holidays, vacations),
    [guards, assignments, shifts, holidays, vacations]
  );
  const closeDays = useMemo(() => buildCloseDays(holidays, msCloseDay), [holidays, msCloseDay]);
  const monthWeeks = useMemo(() => getMonthWeeks(monthIndex), [monthIndex]);
  const auditWeeks = useMemo(
    () => buildAuditWeeks(guards, auditAssignments, auditRotations),
    [guards, auditAssignments, auditRotations]
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => authListener.subscription.unsubscribe();
  }, []);

  function cycleAssignment(dayKey, guardId, currentShiftId) {
    updateAssignment(dayKey, guardId, nextShiftId(currentShiftId, shifts));
  }

  // La persona que inicio sesion, ligada por el correo que tiene en Configuracion > Guardias.
  const sessionEmail = session?.user?.email?.trim().toLowerCase() ?? "";
  const currentGuard = sessionEmail
    ? guards.find((guard) => (guard.email ?? "").trim().toLowerCase() === sessionEmail)
    : undefined;

  useEffect(() => {
    applyAccentColor(currentGuard?.color);
  }, [currentGuard?.color]);

  // Descarga los ICS del mes (guardias y auditorias) de la persona que inicio sesion.
  function downloadMonth() {
    if (!currentGuard) {
      return;
    }
    const guardName = currentGuard.name;
    const calendarName = `Guardias ${guardName} - ${MONTHS[monthIndex]} ${YEAR}`;
    const content = makeIcs(monthIndex, schedule, currentGuard.id, crypto.randomUUID(), calendarName);
    const guardSlug = guardName.toLowerCase().replace(/\s+/g, "-");
    const fileSuffix = `${guardSlug}-${YEAR}-${pad(monthIndex + 1)}-${MONTHS[monthIndex].toLowerCase()}.ics`;
    downloadTextFile(`guardias-${fileSuffix}`, content);

    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    // Las descargas extra van con una pausa para que el navegador no las descarte.
    const extraFiles = [];
    const auditEvents = makeAuditEvents(auditWeeks, monthIndex, currentGuard.id, crypto.randomUUID(), stamp);
    if (auditEvents.length > 0) {
      const auditCalendarName = `Auditorias ${guardName} - ${MONTHS[monthIndex]} ${YEAR}`;
      extraFiles.push([`auditorias-${fileSuffix}`, makeIcsCalendar(auditCalendarName, auditEvents)]);
    }
    const vacationEvents = makeVacationEvents(vacations, currentGuard, monthIndex, crypto.randomUUID(), stamp);
    if (vacationEvents.length > 0) {
      const vacationCalendarName = `Vacaciones ${guardName} - ${MONTHS[monthIndex]} ${YEAR}`;
      extraFiles.push([`vacaciones-${fileSuffix}`, makeIcsCalendar(vacationCalendarName, vacationEvents)]);
    }
    extraFiles.forEach(([filename, fileContent], index) => {
      setTimeout(() => downloadTextFile(filename, fileContent), 300 * (index + 1));
    });
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
              <p>{currentGuard ? currentGuard.name : "Siclik CESA"}</p>
            </div>
            <div className="brand-actions">
              <button
                className="icon-button"
                onClick={toggleTheme}
                aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
                title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
              >
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button
                className="icon-button"
                onClick={() => setSettingsOpen(true)}
                aria-label="Configuracion"
                title="Configuracion"
              >
                <Settings size={18} />
              </button>
              <button
                className="icon-button"
                onClick={() => supabase.auth.signOut()}
                aria-label="Cerrar sesion"
                title="Cerrar sesion"
              >
                <LogOut size={18} />
              </button>
            </div>
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

          {currentGuard ? (
            <VacationPanel
              guard={currentGuard}
              vacationDays={Object.keys(vacations)
                .filter((key) => key.endsWith(`|${currentGuard.id}`))
                .map((key) => key.split("|")[0])}
              holidays={holidays}
              onAdd={addVacationDays}
              onRemove={removeVacationDays}
            />
          ) : null}

          {currentGuard ? null : (
            <div className="panel export-panel">
              <h2>Tu calendario</h2>
              <p className="settings-hint">
                Tu correo ({session.user.email}) no esta ligado a ninguna persona. Agregalo en Configuracion, en
                Guardias, para descargar tus ICS.
              </p>
            </div>
          )}
        </aside>

        {settingsOpen ? (
          <SettingsModal
            guards={guards}
            shifts={shifts}
            officeDays={officeDays}
            msCloseDay={msCloseDay}
            holidays={holidays}
            onClose={() => setSettingsOpen(false)}
            onUpdateGuard={updateGuard}
            onAddGuard={addGuard}
            onRemoveGuard={removeGuard}
            onUpdateShift={updateShift}
            onAddShift={addShift}
            onRemoveShift={removeShift}
            onUpdateOfficeDays={updateOfficeDays}
            onUpdateMsCloseDay={updateMsCloseDay}
            onAddHoliday={addHoliday}
            onRemoveHoliday={removeHoliday}
            auditRotations={auditRotations}
            onSaveAuditRotation={saveAuditRotation}
            onRemoveAuditRotation={removeAuditRotation}
          />
        ) : null}

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
              <button
                className="download-button"
                onClick={downloadMonth}
                disabled={!currentGuard}
                title={currentGuard ? `Descargar los ICS de ${currentGuard.name}` : "Liga tu correo en Configuracion"}
              >
                <Download size={18} />
                Descargar mes
              </button>
            </div>
          </header>

          <div className="calendar-wrap">
            <table className="guard-calendar" style={{ "--shift-rows": shifts.length }}>
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
                            dayMarkerClasses(date, monthIndex, officeDays, closeDays),
                          ].join(" ")}
                        >
                          <span>{date.getDate()}</span>
                        </td>
                      ))}
                      <td className="audit-date-cell"></td>
                    </tr>
                    <tr className="schedule-row">
                      <th>
                        <div className="time-stack" style={{ gridTemplateRows: `repeat(${shifts.length}, 1fr)` }}>
                          {shifts.map((shift) => (
                            <span key={shift.id}>{formatShiftTime(shift.start)}</span>
                          ))}
                        </div>
                      </th>
                      {week.map((date) => {
                        const key = dateKey(date);
                        const isOutside = date.getMonth() !== monthIndex;
                        const isHoliday = key in holidays;
                        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                        const entries = schedule[key] ?? [];

                        return (
                          <td
                            key={`${key}-schedule`}
                            className={[
                              isOutside ? "outside" : "",
                              isWeekend ? "weekend" : "",
                              isHoliday ? "holiday" : "",
                              dayMarkerClasses(date, monthIndex, officeDays, closeDays),
                            ].join(" ")}
                          >
                            {!isOutside && !isWeekend && !isHoliday ? (
                              <div className="day-columns" style={{ gridTemplateRows: `repeat(${shifts.length}, 1fr)` }}>
                                {guards.map((guard, guardIndex) => {
                                  if (vacations[assignmentKey(key, guard.id)]) {
                                    return (
                                      <div
                                        key={guard.id}
                                        className="assignment-column vacation-column"
                                        style={{ "--guard-color": guard.color, gridColumn: guardIndex + 1, gridRow: "1 / -1" }}
                                        title={`${guard.name}: de vacaciones, no disponible.`}
                                      >
                                        <span className="vacation-initial">{guard.initials}</span>
                                      </div>
                                    );
                                  }

                                  const entry = entries.find((item) => item.guard.id === guard.id);
                                  const currentAssignment =
                                    assignments[assignmentKey(key, guard.id)] ?? entry?.id ?? "";
                                  const selectedShift = shifts.find((item) => item.id === currentAssignment);
                                  const span = selectedShift ? shifts.length - selectedShift.position : shifts.length;
                                  const rowStart = selectedShift ? selectedShift.position + 1 : 1;

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
                              <span className="no-class">{holidays[key] || "No hay Clases"}</span>
                            ) : null}
                          </td>
                        );
                      })}
                      <td className="audit-cell">
                        {(() => {
                          const auditGuard = getAuditGuardForWeek(week, guards, auditAssignments, auditRotations);
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
            <span>
              <i className="legend-swatch vacation"></i>
              Vacaciones
            </span>
          </div>
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
