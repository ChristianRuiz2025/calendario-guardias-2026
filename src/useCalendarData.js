import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const DEFAULT_GUARDS = [
  { id: "jona", name: "Jona", initials: "J", color: "#f5b47e" },
  { id: "chris", name: "Chris", initials: "C", color: "#b77af1" },
  { id: "abi", name: "Abi", initials: "A", color: "#ffe59a" },
];

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      const [guardsRes, shiftsRes, auditRes] = await Promise.all([
        supabase.from("guards").select("*").order("created_at"),
        supabase.from("shift_assignments").select("*"),
        supabase.from("audit_assignments").select("*"),
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
    loading,
    error,
    updateGuard,
    addGuard,
    removeGuard,
    resetGuards,
    updateAssignment,
    updateAuditAssignment,
    resetAssignments,
  };
}
