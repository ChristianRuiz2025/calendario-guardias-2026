import { useEffect, useRef, useState } from "react";
import { apiRequest } from "./apiClient";
import { DEFAULT_AUDIT_ROTATIONS, rotationFromRow } from "./auditRotation";
import { DEFAULT_MAIL_SETTINGS, normalizeMailSettings } from "./mailSettings";
import { DEFAULT_HOLIDAYS, DEFAULT_MS_CLOSE_DAY, DEFAULT_OFFICE_DAYS, DEFAULT_SHIFTS } from "./calendarDefaults";

// Cada cuanto se vuelven a leer los datos para ver los cambios de los demas.
const REFRESH_MS = 20000;

function shiftFromRow(row) {
  return { id: row.id, start: row.start_time, end: row.end_time, position: row.position };
}

// Ordena los turnos por hora de entrada; position es la fila que ocupan en el calendario.
function sortShifts(shifts) {
  return [...shifts]
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))
    .map((shift, index) => ({ ...shift, position: index }));
}

function addHours(time, hours) {
  const [hour, minute] = time.split(":").map(Number);
  return `${String(Math.min(hour + hours, 23)).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function assignmentKey(dayKey, guardId) {
  return `${dayKey}|${guardId}`;
}

function upsertById(rows, row) {
  const index = rows.findIndex((item) => item.id === row.id);
  if (index === -1) {
    return [...rows, row];
  }
  return rows.map((item) => (item.id === row.id ? row : item));
}

// enabled: solo se cargan los datos con sesion iniciada.
export function useCalendarData(enabled) {
  const [guards, setGuards] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [auditAssignments, setAuditAssignments] = useState({});
  const [shifts, setShifts] = useState(DEFAULT_SHIFTS);
  const [holidays, setHolidays] = useState(DEFAULT_HOLIDAYS);
  const [officeDays, setOfficeDays] = useState(DEFAULT_OFFICE_DAYS);
  const [msCloseDay, setMsCloseDay] = useState(DEFAULT_MS_CLOSE_DAY);
  // Configuracion del correo del mes (ver src/mailSettings.js).
  const [mailSettings, setMailSettings] = useState(DEFAULT_MAIL_SETTINGS);
  const [auditRotations, setAuditRotations] = useState(DEFAULT_AUDIT_ROTATIONS);
  // Dias de vacaciones: { "YYYY-MM-DD|guardId": true }
  const [vacations, setVacations] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Cambios en camino: mientras haya alguno no se aplica la recarga, para no
  // regresar lo que el usuario acaba de cambiar.
  const pendingSaves = useRef(0);

  function applyCalendar(data) {
    setGuards(data.guards);
    setAssignments(
      Object.fromEntries(data.assignments.map((row) => [assignmentKey(row.day_key, row.guard_id), row.shift_id]))
    );
    setAuditAssignments(Object.fromEntries(data.auditAssignments.map((row) => [row.week_key, row.guard_id])));
    // Sin turnos guardados se usan los horarios por defecto.
    setShifts(data.shiftTemplates.length ? sortShifts(data.shiftTemplates.map(shiftFromRow)) : DEFAULT_SHIFTS);
    setHolidays(Object.fromEntries(data.holidays.map((row) => [row.day_key, row.name ?? ""])));
    const setting = (key) => data.settings.find((row) => row.key === key)?.value;
    setOfficeDays(Array.isArray(setting("office_days")) ? setting("office_days") : DEFAULT_OFFICE_DAYS);
    setMsCloseDay(Number.isInteger(setting("ms_close_day")) ? setting("ms_close_day") : DEFAULT_MS_CLOSE_DAY);
    setMailSettings(normalizeMailSettings(setting("mail_recipients")));
    setAuditRotations(data.auditRotations.map(rotationFromRow));
    setVacations(Object.fromEntries(data.vacations.map((row) => [assignmentKey(row.day_key, row.guard_id), true])));
  }

  async function reload() {
    const data = await apiRequest("/api/calendar");
    if (pendingSaves.current === 0) {
      applyCalendar(data);
    }
  }

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    let active = true;

    apiRequest("/api/calendar")
      .then((data) => {
        if (active) {
          applyCalendar(data);
          setError("");
        }
      })
      .catch((loadError) => {
        console.error(loadError);
        if (active) {
          setError("No se pudo cargar el calendario.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    // Recarga periodica solo con la pestana visible; al volver a ella, recarga de inmediato.
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        reload().catch((reloadError) => console.error(reloadError));
      }
    }, REFRESH_MS);
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        reload().catch((reloadError) => console.error(reloadError));
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [enabled]);

  // Guarda un cambio en el servidor. La pantalla ya se actualizo antes de llamar; si falla,
  // se avisa y se vuelve a leer el calendario para mostrar lo que realmente quedo guardado.
  async function save(op, payload) {
    pendingSaves.current += 1;
    let failed = false;
    try {
      await apiRequest("/api/calendar", { method: "POST", body: { op, ...payload } });
    } catch (saveError) {
      failed = true;
      console.error(saveError);
      if (saveError.status !== 401) {
        window.alert(`No se pudo guardar el cambio: ${saveError.message}`);
      }
    } finally {
      pendingSaves.current -= 1;
    }
    if (failed) {
      reload().catch((reloadError) => console.error(reloadError));
    }
  }

  function updateGuard(id, field, value) {
    const nextValue = field === "initials" ? value.slice(0, 3).toUpperCase() : value;
    setGuards((current) => current.map((guard) => (guard.id === id ? { ...guard, [field]: nextValue } : guard)));
    save("guard.update", { id, field, value: nextValue });
  }

  function addGuard() {
    const index = guards.length + 1;
    const newGuard = {
      id: crypto.randomUUID(),
      name: `Guardia ${index}`,
      initials: `G${index}`,
      color: ["#8fd6c8", "#f38ba8", "#a6c8ff", "#d4c36a"][guards.length % 4],
    };
    setGuards((current) => [...current, newGuard]);
    save("guard.add", { guard: newGuard });
  }

  function removeGuard(id) {
    setGuards((current) => current.filter((guard) => guard.id !== id));
    setAssignments((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => !key.endsWith(`|${id}`)))
    );
    setAuditAssignments((current) => Object.fromEntries(Object.entries(current).filter(([, value]) => value !== id)));
    setVacations((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.endsWith(`|${id}`))));
    save("guard.remove", { id });
  }

  function updateAssignment(dayKey, guardId, shiftId) {
    const key = assignmentKey(dayKey, guardId);
    setAssignments((current) => {
      const next = { ...current };
      if (shiftId) {
        next[key] = shiftId;
      } else {
        delete next[key];
      }
      return next;
    });
    save("assignment.set", { dayKey, guardId, shiftId: shiftId || null });
  }

  // guardId = null guarda la semana como "Sin asignar" (anula la rotacion por defecto).
  function updateAuditAssignment(weekKeyValue, guardId) {
    setAuditAssignments((current) => ({ ...current, [weekKeyValue]: guardId ?? null }));
    save("audit.set", { weekKey: weekKeyValue, guardId: guardId ?? null });
  }

  function updateShift(id, field, value) {
    const shift = shifts.find((item) => item.id === id);
    if (!shift || !value) {
      return;
    }

    const next = { ...shift, [field]: value };
    setShifts((current) => sortShifts(current.map((item) => (item.id === id ? next : item))));
    save("shift.upsert", { shift: next });
  }

  function addShift() {
    const lastStart = shifts.at(-1)?.start ?? "07:00";
    const start = addHours(lastStart, 1);
    const newShift = { id: crypto.randomUUID(), start, end: addHours(start, 9), position: shifts.length };
    setShifts((current) => sortShifts([...current, newShift]));
    save("shift.upsert", { shift: newShift });
  }

  // Elimina el turno y los dias que lo tenian asignado (quedan sin guardia).
  function removeShift(id) {
    setShifts((current) => sortShifts(current.filter((shift) => shift.id !== id)));
    setAssignments((current) => Object.fromEntries(Object.entries(current).filter(([, shiftId]) => shiftId !== id)));
    save("shift.remove", { id });
  }

  function updateOfficeDays(days) {
    const next = [...days].sort((a, b) => a - b);
    setOfficeDays(next);
    save("setting.set", { key: "office_days", value: next });
  }

  function updateMsCloseDay(day) {
    setMsCloseDay(day);
    save("setting.set", { key: "ms_close_day", value: day });
  }

  function updateMailSettings(changes) {
    const next = { ...mailSettings, ...changes };
    setMailSettings(next);
    save("setting.set", { key: "mail_recipients", value: next });
  }

  function addHoliday(dayKey, name) {
    setHolidays((current) => ({ ...current, [dayKey]: name }));
    save("holiday.set", { dayKey, name });
  }

  function removeHoliday(dayKey) {
    setHolidays((current) => {
      const next = { ...current };
      delete next[dayKey];
      return next;
    });
    save("holiday.remove", { dayKey });
  }

  function addVacationDays(guardId, dayKeys) {
    if (dayKeys.length === 0) {
      return;
    }
    setVacations((current) => ({
      ...current,
      ...Object.fromEntries(dayKeys.map((dayKey) => [assignmentKey(dayKey, guardId), true])),
    }));
    save("vacation.add", { guardId, dayKeys });
  }

  function removeVacationDays(guardId, dayKeys) {
    const keys = new Set(dayKeys.map((dayKey) => assignmentKey(dayKey, guardId)));
    setVacations((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !keys.has(key))));
    save("vacation.remove", { guardId, dayKeys });
  }

  function saveAuditRotation(rotation) {
    setAuditRotations((current) => upsertById(current, rotation));
    save("rotation.upsert", { rotation });
  }

  function removeAuditRotation(id) {
    setAuditRotations((current) => current.filter((rotation) => rotation.id !== id));
    save("rotation.remove", { id });
  }

  return {
    guards,
    assignments,
    auditAssignments,
    shifts,
    holidays,
    officeDays,
    msCloseDay,
    mailSettings,
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
    updateMailSettings,
    addHoliday,
    removeHoliday,
    saveAuditRotation,
    removeAuditRotation,
    addVacationDays,
    removeVacationDays,
  };
}
