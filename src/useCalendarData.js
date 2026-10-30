import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { DEFAULT_AUDIT_ROTATIONS, rotationFromRow, rotationToRow } from "./auditRotation";
import { DEFAULT_MAIL_SETTINGS, normalizeMailSettings } from "./mailSettings";
import { DEFAULT_HOLIDAYS, DEFAULT_MS_CLOSE_DAY, DEFAULT_OFFICE_DAYS, DEFAULT_SHIFTS } from "./calendarDefaults";



function shiftFromRow(row) {
  return { id: row.id, start: row.start_time, end: row.end_time, position: row.position };
}

function shiftToRow(shift) {
  return { id: shift.id, start_time: shift.start, end_time: shift.end, position: shift.position };
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

function logError(error) {
  if (error) {
    console.error(error);
  }
}

function upsertById(rows, row) {
  const index = rows.findIndex((item) => item.id === row.id);
  if (index === -1) {
    return [...rows, row];
  }
  return rows.map((item) => (item.id === row.id ? row : item));
}

function applyGuardChange(current, payload) {
  if (payload.eventType === "DELETE") {
    return current.filter((guard) => guard.id !== payload.old.id);
  }
  return upsertById(current, payload.new);
}

function applyMapChange(current, payload, getKey, getValue) {
  if (payload.eventType === "DELETE") {
    const next = { ...current };
    delete next[getKey(payload.old)];
    return next;
  }
  return { ...current, [getKey(payload.new)]: getValue(payload.new) };
}

export function useCalendarData() {
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

  useEffect(() => {
    let active = true;

    async function load() {
      const [guardsRes, shiftsRes, auditRes, shiftTemplatesRes, holidaysRes, settingsRes, rotationsRes, vacationsRes] =
        await Promise.all([
          supabase.from("guards").select("*").order("created_at"),
          supabase.from("shift_assignments").select("*"),
          supabase.from("audit_assignments").select("*"),
          supabase.from("shift_templates").select("*"),
          supabase.from("holidays").select("*"),
          supabase.from("app_settings").select("*"),
          supabase.from("audit_rotations").select("*"),
          supabase.from("vacations").select("*"),
        ]);

      if (!active) {
        return;
      }

      if (guardsRes.error || shiftsRes.error || auditRes.error) {
        setError("No se pudo cargar el calendario.");
        setLoading(false);
        return;
      }

      setGuards(guardsRes.data);
      setAssignments(
        Object.fromEntries(
          shiftsRes.data.map((row) => [assignmentKey(row.day_key, row.guard_id), row.shift_id])
        )
      );
      setAuditAssignments(Object.fromEntries(auditRes.data.map((row) => [row.week_key, row.guard_id])));
      // Si la tabla shift_templates aun no existe (o esta vacia), se usan los horarios por defecto.
      logError(shiftTemplatesRes.error);
      if (shiftTemplatesRes.data?.length) {
        setShifts(sortShifts(shiftTemplatesRes.data.map(shiftFromRow)));
      }
      // Igual con holidays y app_settings: sin tabla se quedan los valores por defecto.
      logError(holidaysRes.error);
      if (!holidaysRes.error) {
        setHolidays(Object.fromEntries(holidaysRes.data.map((row) => [row.day_key, row.name ?? ""])));
      }
      logError(settingsRes.error);
      const officeDaysRow = settingsRes.data?.find((row) => row.key === "office_days");
      if (Array.isArray(officeDaysRow?.value)) {
        setOfficeDays(officeDaysRow.value);
      }
      const msCloseDayRow = settingsRes.data?.find((row) => row.key === "ms_close_day");
      if (Number.isInteger(msCloseDayRow?.value)) {
        setMsCloseDay(msCloseDayRow.value);
      }
      const mailSettingsRow = settingsRes.data?.find((row) => row.key === "mail_recipients");
      setMailSettings(normalizeMailSettings(mailSettingsRow?.value));
      // Sin tabla audit_rotations se usa el orden por defecto.
      logError(rotationsRes.error);
      if (!rotationsRes.error) {
        setAuditRotations(rotationsRes.data.map(rotationFromRow));
      }
      // Sin tabla vacations simplemente no hay vacaciones.
      logError(vacationsRes.error);
      setVacations(
        Object.fromEntries((vacationsRes.data ?? []).map((row) => [assignmentKey(row.day_key, row.guard_id), true]))
      );
      setLoading(false);
    }

    load();

    const channel = supabase
      .channel("calendar-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "guards" }, (payload) => {
        setGuards((current) => applyGuardChange(current, payload));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_assignments" }, (payload) => {
        setAssignments((current) =>
          applyMapChange(
            current,
            payload,
            (row) => assignmentKey(row.day_key, row.guard_id),
            (row) => row.shift_id
          )
        );
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "audit_assignments" }, (payload) => {
        setAuditAssignments((current) =>
          applyMapChange(
            current,
            payload,
            (row) => row.week_key,
            (row) => row.guard_id
          )
        );
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_templates" }, (payload) => {
        if (payload.eventType === "DELETE") {
          setShifts((current) => sortShifts(current.filter((shift) => shift.id !== payload.old.id)));
        } else {
          setShifts((current) => sortShifts(upsertById(current, shiftFromRow(payload.new))));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "holidays" }, (payload) => {
        setHolidays((current) =>
          applyMapChange(
            current,
            payload,
            (row) => row.day_key,
            (row) => row.name ?? ""
          )
        );
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, (payload) => {
        if (payload.eventType !== "DELETE" && payload.new.key === "office_days" && Array.isArray(payload.new.value)) {
          setOfficeDays(payload.new.value);
        }
        if (payload.eventType !== "DELETE" && payload.new.key === "ms_close_day" && Number.isInteger(payload.new.value)) {
          setMsCloseDay(payload.new.value);
        }
        if (payload.eventType !== "DELETE" && payload.new.key === "mail_recipients") {
          setMailSettings(normalizeMailSettings(payload.new.value));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "audit_rotations" }, (payload) => {
        if (payload.eventType === "DELETE") {
          setAuditRotations((current) => current.filter((rotation) => rotation.id !== payload.old.id));
        } else {
          setAuditRotations((current) => upsertById(current, rotationFromRow(payload.new)));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "vacations" }, (payload) => {
        setVacations((current) =>
          applyMapChange(
            current,
            payload,
            (row) => assignmentKey(row.day_key, row.guard_id),
            () => true
          )
        );
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  function updateGuard(id, field, value) {
    const nextValue = field === "initials" ? value.slice(0, 3).toUpperCase() : value;
    setGuards((current) => current.map((guard) => (guard.id === id ? { ...guard, [field]: nextValue } : guard)));
    supabase
      .from("guards")
      .update({ [field]: nextValue })
      .eq("id", id)
      .then(({ error: updateError }) => logError(updateError));
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
    supabase
      .from("guards")
      .insert(newGuard)
      .then(({ error: insertError }) => logError(insertError));
  }

  function removeGuard(id) {
    setGuards((current) => current.filter((guard) => guard.id !== id));
    setAssignments((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => !key.endsWith(`|${id}`)))
    );
    setAuditAssignments((current) => Object.fromEntries(Object.entries(current).filter(([, value]) => value !== id)));
    supabase
      .from("guards")
      .delete()
      .eq("id", id)
      .then(({ error: deleteError }) => logError(deleteError));
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

    if (shiftId) {
      supabase
        .from("shift_assignments")
        .upsert({ day_key: dayKey, guard_id: guardId, shift_id: shiftId })
        .then(({ error: upsertError }) => logError(upsertError));
    } else {
      supabase
        .from("shift_assignments")
        .delete()
        .eq("day_key", dayKey)
        .eq("guard_id", guardId)
        .then(({ error: deleteError }) => logError(deleteError));
    }
  }

  // guardId = null guarda la semana como "Sin asignar" (anula la rotacion por defecto).
  function updateAuditAssignment(weekKeyValue, guardId) {
    setAuditAssignments((current) => ({ ...current, [weekKeyValue]: guardId ?? null }));
    supabase
      .from("audit_assignments")
      .upsert({ week_key: weekKeyValue, guard_id: guardId ?? null })
      .then(({ error: upsertError }) => logError(upsertError));
  }

  function updateShift(id, field, value) {
    const shift = shifts.find((item) => item.id === id);
    if (!shift || !value) {
      return;
    }

    const next = { ...shift, [field]: value };
    setShifts((current) => sortShifts(current.map((item) => (item.id === id ? next : item))));
    supabase
      .from("shift_templates")
      .upsert(shiftToRow(next))
      .then(({ error: upsertError }) => logError(upsertError));
  }

  function addShift() {
    const lastStart = shifts.at(-1)?.start ?? "07:00";
    const start = addHours(lastStart, 1);
    const newShift = { id: crypto.randomUUID(), start, end: addHours(start, 9), position: shifts.length };
    setShifts((current) => sortShifts([...current, newShift]));
    supabase
      .from("shift_templates")
      .insert(shiftToRow(newShift))
      .then(({ error: insertError }) => logError(insertError));
  }

  // Elimina el turno y los dias que lo tenian asignado (quedan sin guardia).
  async function removeShift(id) {
    setShifts((current) => sortShifts(current.filter((shift) => shift.id !== id)));
    setAssignments((current) => Object.fromEntries(Object.entries(current).filter(([, shiftId]) => shiftId !== id)));
    const { error: assignmentsError } = await supabase.from("shift_assignments").delete().eq("shift_id", id);
    logError(assignmentsError);
    const { error: deleteError } = await supabase.from("shift_templates").delete().eq("id", id);
    logError(deleteError);
  }

  function updateOfficeDays(days) {
    const next = [...days].sort((a, b) => a - b);
    setOfficeDays(next);
    supabase
      .from("app_settings")
      .upsert({ key: "office_days", value: next })
      .then(({ error: upsertError }) => logError(upsertError));
  }

  function updateMsCloseDay(day) {
    setMsCloseDay(day);
    supabase
      .from("app_settings")
      .upsert({ key: "ms_close_day", value: day })
      .then(({ error: upsertError }) => logError(upsertError));
  }

  function updateMailSettings(changes) {
    const next = { ...mailSettings, ...changes };
    setMailSettings(next);
    supabase
      .from("app_settings")
      .upsert({ key: "mail_recipients", value: next })
      .then(({ error: upsertError }) => logError(upsertError));
  }

  function addHoliday(dayKey, name) {
    setHolidays((current) => ({ ...current, [dayKey]: name }));
    supabase
      .from("holidays")
      .upsert({ day_key: dayKey, name })
      .then(({ error: upsertError }) => logError(upsertError));
  }

  function removeHoliday(dayKey) {
    setHolidays((current) => {
      const next = { ...current };
      delete next[dayKey];
      return next;
    });
    supabase
      .from("holidays")
      .delete()
      .eq("day_key", dayKey)
      .then(({ error: deleteError }) => logError(deleteError));
  }

  function addVacationDays(guardId, dayKeys) {
    if (dayKeys.length === 0) {
      return;
    }
    setVacations((current) => ({
      ...current,
      ...Object.fromEntries(dayKeys.map((dayKey) => [assignmentKey(dayKey, guardId), true])),
    }));
    supabase
      .from("vacations")
      .upsert(dayKeys.map((dayKey) => ({ day_key: dayKey, guard_id: guardId })))
      .then(({ error: upsertError }) => logError(upsertError));
  }

  function removeVacationDays(guardId, dayKeys) {
    const keys = new Set(dayKeys.map((dayKey) => assignmentKey(dayKey, guardId)));
    setVacations((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !keys.has(key))));
    supabase
      .from("vacations")
      .delete()
      .eq("guard_id", guardId)
      .in("day_key", dayKeys)
      .then(({ error: deleteError }) => logError(deleteError));
  }

  function saveAuditRotation(rotation) {
    setAuditRotations((current) => upsertById(current, rotation));
    supabase
      .from("audit_rotations")
      .upsert(rotationToRow(rotation))
      .then(({ error: upsertError }) => logError(upsertError));
  }

  function removeAuditRotation(id) {
    setAuditRotations((current) => current.filter((rotation) => rotation.id !== id));
    supabase
      .from("audit_rotations")
      .delete()
      .eq("id", id)
      .then(({ error: deleteError }) => logError(deleteError));
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
