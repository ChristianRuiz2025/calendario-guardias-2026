import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const DEFAULT_GUARDS = [
  { id: "jona", name: "Jona", initials: "J", color: "#f5b47e" },
  { id: "chris", name: "Chris", initials: "C", color: "#b77af1" },
  { id: "abi", name: "Abi", initials: "A", color: "#ffe59a" },
];

// Turnos por defecto. Los ids se guardan en shift_assignments, asi que no cambian
// aunque se editen los horarios.
export const DEFAULT_SHIFTS = [
  { id: "08-17", start: "08:00", end: "17:00", position: 0 },
  { id: "09-18", start: "09:00", end: "18:00", position: 1 },
  { id: "10-19", start: "10:00", end: "19:00", position: 2 },
];

// Dias de oficina por defecto (getDay: 1 = lunes ... 5 = viernes).
export const DEFAULT_OFFICE_DAYS = [2, 5];

// Dia del mes del cierre MS (si no es dia habil se recorre al siguiente).
export const DEFAULT_MS_CLOSE_DAY = 6;

// Feriados por defecto, mientras no exista la tabla holidays.
const DEFAULT_HOLIDAYS = Object.fromEntries(
  [
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
  ].map((dayKey) => [dayKey, ""])
);

function shiftFromRow(row) {
  return { id: row.id, start: row.start_time, end: row.end_time, position: row.position };
}

function shiftToRow(shift) {
  return { id: shift.id, start_time: shift.start, end_time: shift.end, position: shift.position };
}

// Completa con los turnos por defecto los que no esten en la base (tabla vacia o sin crear).
function mergeShifts(rows) {
  return DEFAULT_SHIFTS.map((shift) => {
    const row = rows.find((item) => item.id === shift.id);
    return row ? shiftFromRow(row) : shift;
  });
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      const [guardsRes, shiftsRes, auditRes, shiftTemplatesRes, holidaysRes, settingsRes] = await Promise.all([
        supabase.from("guards").select("*").order("created_at"),
        supabase.from("shift_assignments").select("*"),
        supabase.from("audit_assignments").select("*"),
        supabase.from("shift_templates").select("*"),
        supabase.from("holidays").select("*"),
        supabase.from("app_settings").select("*"),
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
      // Si la tabla shift_templates aun no existe, se usan los horarios por defecto.
      logError(shiftTemplatesRes.error);
      setShifts(mergeShifts(shiftTemplatesRes.data ?? []));
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
        if (payload.eventType !== "DELETE") {
          const changed = shiftFromRow(payload.new);
          setShifts((current) => current.map((shift) => (shift.id === changed.id ? changed : shift)));
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

  async function resetGuards() {
    setGuards(DEFAULT_GUARDS);
    const defaultIds = DEFAULT_GUARDS.map((guard) => guard.id);
    const { error: deleteError } = await supabase.from("guards").delete().not("id", "in", `(${defaultIds.join(",")})`);
    logError(deleteError);
    const { error: upsertError } = await supabase.from("guards").upsert(DEFAULT_GUARDS);
    logError(upsertError);
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
    setShifts((current) => current.map((item) => (item.id === id ? next : item)));
    supabase
      .from("shift_templates")
      .upsert(shiftToRow(next))
      .then(({ error: upsertError }) => logError(upsertError));
  }

  async function resetShifts() {
    setShifts(DEFAULT_SHIFTS);
    const { error: upsertError } = await supabase.from("shift_templates").upsert(DEFAULT_SHIFTS.map(shiftToRow));
    logError(upsertError);
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

  async function resetAssignments() {
    setAssignments({});
    setAuditAssignments({});
    const { error: shiftsError } = await supabase.from("shift_assignments").delete().not("day_key", "is", null);
    logError(shiftsError);
    const { error: auditError } = await supabase.from("audit_assignments").delete().not("week_key", "is", null);
    logError(auditError);
  }

  return {
    guards,
    assignments,
    auditAssignments,
    shifts,
    holidays,
    officeDays,
    msCloseDay,
    loading,
    error,
    updateGuard,
    addGuard,
    removeGuard,
    resetGuards,
    updateAssignment,
    updateAuditAssignment,
    resetAssignments,
    updateShift,
    resetShifts,
    updateOfficeDays,
    updateMsCloseDay,
    addHoliday,
    removeHoliday,
  };
}
