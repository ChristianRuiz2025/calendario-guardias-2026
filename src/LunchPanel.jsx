import React, { useEffect, useState } from "react";
import { Plus, Trash2, UtensilsCrossed } from "lucide-react";
import CollapsiblePanel from "./CollapsiblePanel";
import { pad, parseDateKey } from "./auditRotation";
import { isWorkingDay } from "./calendarRules";

const YEAR = 2026;

const MONTH_NAMES = [
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

const DEFAULT_START = "14:00";
const DEFAULT_END = "15:00";

// "2026-11" -> "Noviembre (todo el mes)"; "2026-11-12" -> "12 de noviembre"
function periodLabel(periodKey) {
  const [, month, day] = periodKey.split("-").map(Number);
  return day ? `${day} de ${MONTH_NAMES[month - 1].toLowerCase()}` : `${MONTH_NAMES[month - 1]} (todo el mes)`;
}

// Horas de comida de la persona que inicio sesion: por mes o por dia (el dia manda sobre el mes).
// No se ven en el calendario; solo van en el ICS "Comida".
export default function LunchPanel({ guard, lunches, holidays, monthIndex, onSet, onRemove }) {
  const [mode, setMode] = useState("month");
  const [month, setMonth] = useState(String(monthIndex));
  const [day, setDay] = useState("");
  const [start, setStart] = useState(DEFAULT_START);
  const [end, setEnd] = useState(DEFAULT_END);
  const [formError, setFormError] = useState("");

  // El mes del formulario sigue al mes que se ve en el calendario.
  useEffect(() => {
    setMonth(String(monthIndex));
  }, [monthIndex]);

  // Resumen con el panel cerrado: el horario del mes que se ve.
  const shownMonthLunch = lunches[`${YEAR}-${pad(monthIndex + 1)}|${guard.id}`];
  const summary = shownMonthLunch
    ? `${MONTH_NAMES[monthIndex].slice(0, 3)} ${shownMonthLunch.start} a ${shownMonthLunch.end}`
    : "Sin horario";

  // [{ periodKey, start, end }] de esta persona, meses primero y luego dias, en orden.
  const entries = Object.entries(lunches)
    .filter(([key]) => key.endsWith(`|${guard.id}`))
    .map(([key, value]) => ({ periodKey: key.split("|")[0], ...value }))
    .sort((a, b) => a.periodKey.localeCompare(b.periodKey));

  function submit(event) {
    event.preventDefault();
    if (!start || !end || end <= start) {
      setFormError("La comida debe terminar despues de empezar.");
      return;
    }
    let periodKey;
    if (mode === "month") {
      periodKey = `${YEAR}-${pad(Number(month) + 1)}`;
    } else {
      if (!day) {
        setFormError("Elige el dia.");
        return;
      }
      if (!isWorkingDay(parseDateKey(day), holidays)) {
        setFormError("Ese dia es fin de semana o feriado.");
        return;
      }
      periodKey = day;
    }
    onSet(guard.id, periodKey, start, end);
    setDay("");
    setFormError("");
  }

  function changeMode(next) {
    setMode(next);
    setFormError("");
  }

  return (
    <CollapsiblePanel title="Comidas" summary={summary} icon={UtensilsCrossed} className="lunch-panel">
      <div className="lunch-mode" role="radiogroup" aria-label="Aplicar la comida a">
        <button
          type="button"
          role="radio"
          aria-checked={mode === "month"}
          className={mode === "month" ? "active" : ""}
          onClick={() => changeMode("month")}
        >
          Todo el mes
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === "day"}
          className={mode === "day" ? "active" : ""}
          onClick={() => changeMode("day")}
        >
          Un dia
        </button>
      </div>
      <form className="vacation-form" onSubmit={submit}>
        {mode === "month" ? (
          <label className="lunch-period">
            Mes
            <select value={month} onChange={(event) => setMonth(event.target.value)}>
              {MONTH_NAMES.map((name, index) => (
                <option key={name} value={index}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="lunch-period">
            Dia
            <input
              type="date"
              min={`${YEAR}-01-01`}
              max={`${YEAR}-12-31`}
              value={day}
              onChange={(event) => {
                setDay(event.target.value);
                setFormError("");
              }}
            />
          </label>
        )}
        <label>
          De
          <input type="time" value={start} onChange={(event) => setStart(event.target.value)} />
        </label>
        <label>
          A
          <input type="time" value={end} onChange={(event) => setEnd(event.target.value)} />
        </label>
        <button type="submit" className="download-button" aria-label="Guardar hora de comida">
          <Plus size={16} />
          Guardar
        </button>
      </form>
      <p className="settings-hint">
        No se ve en el calendario. Se descarga como ICS "Comida" (Ausente) en los dias habiles sin vacaciones; un dia
        en especifico reemplaza al horario del mes.
      </p>
      {formError ? <p className="form-error">{formError}</p> : null}
      {entries.length > 0 ? (
        <ul className="vacation-list">
          {entries.map((entry) => (
            <li key={entry.periodKey}>
              <span className="vacation-swatch" style={{ background: guard.color }} aria-hidden="true" />
              <span className="vacation-range">{periodLabel(entry.periodKey)}</span>
              <span className="vacation-count">
                {entry.start} a {entry.end}
              </span>
              <button
                type="button"
                className="icon-button danger"
                onClick={() => onRemove(guard.id, entry.periodKey)}
                aria-label={`Quitar comida ${periodLabel(entry.periodKey)}`}
                title="Quitar"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </CollapsiblePanel>
  );
}
