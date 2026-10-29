import React, { useEffect, useState } from "react";
import { Plus, RotateCcw, Trash2, X } from "lucide-react";

const YEAR = 2026;

const WEEKDAY_OPTIONS = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miercoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
];

// "2026-11-16" -> "lun, 16 nov"
function formatHoliday(dayKey) {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// "08:00" + "17:00" -> "8 a 5"
function shiftLabel(shift) {
  const hour = (time) => {
    const value = Number(time.split(":")[0]) % 12;
    return value === 0 ? 12 : value;
  };
  return `${hour(shift.start)} a ${hour(shift.end)}`;
}

export default function SettingsModal({
  guards,
  shifts,
  officeDays,
  holidays,
  onClose,
  onUpdateGuard,
  onAddGuard,
  onRemoveGuard,
  onResetGuards,
  onUpdateShift,
  onResetShifts,
  onUpdateOfficeDays,
  onAddHoliday,
  onRemoveHoliday,
  onResetAssignments,
}) {
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayName, setNewHolidayName] = useState("");
  const sortedHolidays = Object.keys(holidays).sort();

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function toggleOfficeDay(day) {
    onUpdateOfficeDays(officeDays.includes(day) ? officeDays.filter((item) => item !== day) : [...officeDays, day]);
  }

  function submitHoliday(event) {
    event.preventDefault();
    if (!newHolidayDate) {
      return;
    }
    onAddHoliday(newHolidayDate, newHolidayName.trim());
    setNewHolidayDate("");
    setNewHolidayName("");
  }

  function confirmResetAssignments() {
    if (window.confirm("Se borraran todos los turnos y auditorias asignados en el calendario. Continuar?")) {
      onResetAssignments();
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="modal-header">
          <h2 id="settings-title">Configuracion</h2>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar" title="Cerrar">
            <X size={18} />
          </button>
        </header>

        <div className="modal-body">
          <div className="modal-column">
            <section className="panel">
              <div className="panel-title">
                <h2>Guardias</h2>
                <button
                  className="icon-button"
                  onClick={onAddGuard}
                  aria-label="Agregar guardia"
                  title="Agregar guardia"
                >
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
                      onChange={(event) => onUpdateGuard(guard.id, "color", event.target.value)}
                      aria-label={`Color de ${guard.name}`}
                    />
                    <input
                      value={guard.initials}
                      onChange={(event) => onUpdateGuard(guard.id, "initials", event.target.value)}
                      aria-label={`Iniciales de ${guard.name}`}
                    />
                    <input
                      value={guard.name}
                      onChange={(event) => onUpdateGuard(guard.id, "name", event.target.value)}
                      aria-label={`Nombre de ${guard.name}`}
                    />
                    <button
                      className="icon-button danger"
                      onClick={() => onRemoveGuard(guard.id)}
                      aria-label={`Eliminar ${guard.name}`}
                      title="Eliminar guardia"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <button className="reset-button" onClick={onResetGuards}>
                <RotateCcw size={16} />
                Reiniciar personas
              </button>
            </section>

            <section className="panel">
              <div className="panel-title">
                <h2>Dias de oficina</h2>
              </div>
              <p className="settings-hint">Se marcan con borde rojo en el calendario.</p>
              <div className="weekday-toggle">
                {WEEKDAY_OPTIONS.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    className={officeDays.includes(day.value) ? "active" : ""}
                    aria-pressed={officeDays.includes(day.value)}
                    onClick={() => toggleOfficeDay(day.value)}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panel-title">
                <h2>Asignaciones</h2>
              </div>
              <p className="settings-hint">Borra los turnos y auditorias elegidos a mano en todo el calendario.</p>
              <button className="reset-button danger" onClick={confirmResetAssignments}>
                <RotateCcw size={16} />
                Reiniciar asignaciones
              </button>
            </section>
          </div>

          <div className="modal-column">
            <section className="panel shift-panel">
              <div className="panel-title">
                <h2>Turnos</h2>
              </div>
              <div className="shift-editor shift-editor-head">
                <span>Turno</span>
                <span>Entrada</span>
                <span>Salida</span>
              </div>
              {shifts.map((shift) => (
                <div key={shift.id} className="shift-editor">
                  <span>{shiftLabel(shift)}</span>
                  <input
                    type="time"
                    value={shift.start}
                    onChange={(event) => onUpdateShift(shift.id, "start", event.target.value)}
                    aria-label={`Entrada del turno ${shiftLabel(shift)}`}
                  />
                  <input
                    type="time"
                    value={shift.end}
                    onChange={(event) => onUpdateShift(shift.id, "end", event.target.value)}
                    aria-label={`Salida del turno ${shiftLabel(shift)}`}
                  />
                </div>
              ))}
              <p className="settings-hint">
                Los cambios aplican a todos los dias que ya tienen ese turno y a los ICS que se descarguen.
              </p>
              <button className="reset-button" onClick={onResetShifts}>
                <RotateCcw size={16} />
                Reiniciar horarios
              </button>
            </section>

            <section className="panel">
              <div className="panel-title">
                <h2>Dias feriados</h2>
              </div>
              <p className="settings-hint">Esos dias no hay guardias y se muestran en dorado.</p>
              <form className="holiday-form" onSubmit={submitHoliday}>
                <input
                  type="date"
                  min={`${YEAR}-01-01`}
                  max={`${YEAR}-12-31`}
                  value={newHolidayDate}
                  onChange={(event) => setNewHolidayDate(event.target.value)}
                  aria-label="Fecha del feriado"
                  required
                />
                <input
                  value={newHolidayName}
                  onChange={(event) => setNewHolidayName(event.target.value)}
                  placeholder="Nombre (opcional)"
                  aria-label="Nombre del feriado"
                />
                <button type="submit" className="icon-button" aria-label="Agregar feriado" title="Agregar feriado">
                  <Plus size={18} />
                </button>
              </form>
              <div className="holiday-list">
                {sortedHolidays.length === 0 ? <p className="settings-hint">No hay feriados.</p> : null}
                {sortedHolidays.map((dayKey) => (
                  <div className="holiday-row" key={dayKey}>
                    <span>{formatHoliday(dayKey)}</span>
                    <input
                      value={holidays[dayKey]}
                      onChange={(event) => onAddHoliday(dayKey, event.target.value)}
                      placeholder="No hay Clases"
                      aria-label={`Nombre del feriado ${dayKey}`}
                    />
                    <button
                      className="icon-button danger"
                      onClick={() => onRemoveHoliday(dayKey)}
                      aria-label={`Eliminar feriado ${dayKey}`}
                      title="Eliminar feriado"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
