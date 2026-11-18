import React, { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Minus, Plus } from "lucide-react";
import { dateKey, parseDateKey } from "./auditRotation";
import { MAX_DATE, MIN_DATE } from "./calendarYears";
import { buildOfficeSchedule, resolveOfficeOrder } from "./officeRotation";

const PREVIEW_DAYS = 6;

// "2026-11-03" -> "mar 3 nov"
function shortDate(key) {
  return parseDateKey(key)
    .toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })
    .replace(/\./g, "");
}

// Configuracion > Rotacion de oficina: orden de las personas y desde cuando empieza.
// Muestra los proximos dias de oficina para revisar el resultado antes de guardar.
export default function OfficeRotationEditor({ guards, shifts, officeDays, holidays, rotation, onSave }) {
  const [start, setStart] = useState(rotation.start);
  const [order, setOrder] = useState(() => resolveOfficeOrder(rotation.order, guards).map((guard) => guard.id));
  const [saved, setSaved] = useState(false);

  // Si cambia lo guardado (por ejemplo, otra persona lo edito), el formulario lo refleja. Se compara
  // por valor para que la recarga periodica no borre lo que se esta editando.
  const savedOrderKey = rotation.order.join("|");
  useEffect(() => {
    setStart(rotation.start);
    setOrder(resolveOfficeOrder(rotation.order, guards).map((guard) => guard.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotation.start, savedOrderKey]);

  // "10:00 a 19:00" del turno mas tarde y del mas temprano.
  const byStart = [...shifts].sort((a, b) => a.start.localeCompare(b.start));
  const earliestLabel = byStart.length ? `${byStart[0].start} a ${byStart[0].end}` : "";
  const latestLabel = byStart.length ? `${byStart.at(-1).start} a ${byStart.at(-1).end}` : "";

  const included = order.map((id) => guards.find((guard) => guard.id === id)).filter(Boolean);
  const excluded = guards.filter((guard) => !order.includes(guard.id));
  const changed = start !== rotation.start || order.join("|") !== resolveOfficeOrder(rotation.order, guards).map((g) => g.id).join("|");

  function move(index, delta) {
    const next = [...order];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    setOrder(next);
    setSaved(false);
  }

  // Proximos dias de oficina desde hoy (o desde el inicio, si es despues) con el orden del formulario.
  const today = dateKey(new Date());
  const from = start > today ? start : today;
  const until = new Date(parseDateKey(from));
  until.setDate(until.getDate() + 60);
  const preview = Object.entries(
    buildOfficeSchedule({ start, order }, officeDays, holidays, guards, dateKey(until))
  )
    .filter(([key]) => key >= from)
    .slice(0, PREVIEW_DAYS);

  function save() {
    onSave({ start, order });
    setSaved(true);
  }

  return (
    <div className="office-rotation">
      <p className="settings-hint">
        Cada dia de oficina, a quien le toca se le pone el turno mas tarde ({latestLabel}) y a los demas el mas
        temprano ({earliestLabel}). Es solo el turno por defecto: cada quien puede cambiar el suyo en el calendario. Si
        un dia de oficina cae en feriado, a esa persona le toca el siguiente.
      </p>

      <label className="office-rotation-start">
        Empieza el
        <input
          type="date"
          min={MIN_DATE}
          max={MAX_DATE}
          value={start}
          onChange={(event) => {
            setStart(event.target.value);
            setSaved(false);
          }}
        />
      </label>

      <ol className="office-rotation-list">
        {included.map((guard, index) => (
          <li key={guard.id} style={{ "--guard-color": guard.color }}>
            <span className="office-rotation-number">{index + 1}</span>
            <span className="office-rotation-name">{guard.name}</span>
            <button
              type="button"
              className="icon-button"
              onClick={() => move(index, -1)}
              disabled={index === 0}
              aria-label={`Subir a ${guard.name}`}
              title="Subir"
            >
              <ArrowUp size={15} />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => move(index, 1)}
              disabled={index === included.length - 1}
              aria-label={`Bajar a ${guard.name}`}
              title="Bajar"
            >
              <ArrowDown size={15} />
            </button>
            <button
              type="button"
              className="icon-button danger"
              onClick={() => {
                setOrder(order.filter((id) => id !== guard.id));
                setSaved(false);
              }}
              aria-label={`Quitar a ${guard.name} de la rotacion`}
              title="Quitar de la rotacion"
            >
              <Minus size={15} />
            </button>
          </li>
        ))}
      </ol>

      {excluded.length > 0 ? (
        <div className="office-rotation-excluded">
          {excluded.map((guard) => (
            <button
              key={guard.id}
              type="button"
              onClick={() => {
                setOrder([...order, guard.id]);
                setSaved(false);
              }}
            >
              <Plus size={14} aria-hidden="true" />
              {guard.name}
            </button>
          ))}
        </div>
      ) : null}

      {preview.length > 0 ? (
        <div className="office-rotation-preview">
          <p className="settings-subtitle">Proximos dias de oficina (entra a las {byStart.at(-1)?.start ?? ""})</p>
          <ul>
            {preview.map(([key, guard]) => (
              <li key={key}>
                <span>{shortDate(key)}</span>
                <span className="office-chip" style={{ "--chip-color": guard.color }}>
                  {guard.initials}
                </span>
                <strong>{guard.name}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="office-rotation-actions">
        <button type="button" className="download-button" onClick={save} disabled={!changed || included.length === 0}>
          Guardar rotacion
        </button>
        {saved && !changed ? <span className="settings-hint">Guardado</span> : null}
      </div>
    </div>
  );
}
