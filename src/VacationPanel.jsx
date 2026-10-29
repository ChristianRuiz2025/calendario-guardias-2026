import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { dateKey, parseDateKey } from "./auditRotation";

const YEAR = 2026;

const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function isWorkingDay(date, holidays) {
  return date.getDay() >= 1 && date.getDay() <= 5 && !(dateKey(date) in holidays);
}

function nextWorkingDay(dayKey, holidays) {
  const date = parseDateKey(dayKey);
  do {
    date.setDate(date.getDate() + 1);
  } while (!isWorkingDay(date, holidays));
  return dateKey(date);
}

// Junta los dias en periodos de dias habiles seguidos: [["2026-11-02", "2026-11-03"], ["2026-11-10"]]
function groupRanges(dayKeys, holidays) {
  const ranges = [];
  [...dayKeys].sort().forEach((dayKey) => {
    const last = ranges.at(-1);
    if (last && nextWorkingDay(last.at(-1), holidays) === dayKey) {
      last.push(dayKey);
    } else {
      ranges.push([dayKey]);
    }
  });
  return ranges;
}

// ["2026-11-30", ..., "2026-12-04"] -> "Del 30 de noviembre al 4 de diciembre"
function formatRange(days) {
  const first = parseDateKey(days[0]);
  const last = parseDateKey(days.at(-1));
  if (days.length === 1) {
    return `${first.getDate()} de ${MONTH_NAMES[first.getMonth()]}`;
  }
  const firstLabel =
    first.getMonth() === last.getMonth()
      ? `${first.getDate()}`
      : `${first.getDate()} de ${MONTH_NAMES[first.getMonth()]}`;
  return `Del ${firstLabel} al ${last.getDate()} de ${MONTH_NAMES[last.getMonth()]}`;
}

export default function VacationPanel({ guard, vacationDays, holidays, onAdd, onRemove }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [formError, setFormError] = useState("");
  const ranges = groupRanges(vacationDays, holidays);

  function submit(event) {
    event.preventDefault();
    const last = end || start;
    if (!start || last < start) {
      setFormError("Elige el primer dia y un ultimo dia igual o posterior.");
      return;
    }

    const days = [];
    for (let date = parseDateKey(start); dateKey(date) <= last; date.setDate(date.getDate() + 1)) {
      if (isWorkingDay(date, holidays)) {
        days.push(dateKey(date));
      }
    }
    if (days.length === 0) {
      setFormError("Esos dias son fin de semana o feriado.");
      return;
    }

    onAdd(guard.id, days);
    setStart("");
    setEnd("");
    setFormError("");
  }

  return (
    <div className="panel vacation-panel">
      <div className="panel-title">
        <h2>Vacaciones</h2>
      </div>
      <form className="vacation-form" onSubmit={submit}>
        <label>
          Desde
          <input
            type="date"
            min={`${YEAR}-01-01`}
            max={`${YEAR}-12-31`}
            value={start}
            onChange={(event) => {
              setStart(event.target.value);
              setFormError("");
            }}
          />
        </label>
        <label>
          Hasta
          <input
            type="date"
            min={start || `${YEAR}-01-01`}
            max={`${YEAR}-12-31`}
            value={end}
            onChange={(event) => {
              setEnd(event.target.value);
              setFormError("");
            }}
          />
        </label>
        <button type="submit" className="download-button" aria-label="Agregar vacaciones">
          <Plus size={16} />
          Agregar
        </button>
      </form>
      <p className="settings-hint">Solo se cuentan dias habiles. Deja "Hasta" vacio para un solo dia.</p>
      {formError ? <p className="form-error">{formError}</p> : null}
      {ranges.length > 0 ? (
        <ul className="vacation-list">
          {ranges.map((days) => (
            <li key={days[0]}>
              <span className="vacation-swatch" style={{ "--guard-color": guard.color }} aria-hidden="true" />
              <span className="vacation-range">{formatRange(days)}</span>
              <span className="vacation-count">
                {days.length} {days.length === 1 ? "dia" : "dias"}
              </span>
              <button
                type="button"
                className="icon-button danger"
                onClick={() => onRemove(guard.id, days)}
                aria-label={`Quitar vacaciones ${formatRange(days)}`}
                title="Quitar"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
