import React, { useEffect } from "react";
import { Plus, RotateCcw, Trash2, X } from "lucide-react";

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
  onClose,
  onUpdateGuard,
  onAddGuard,
  onRemoveGuard,
  onResetGuards,
  onUpdateShift,
  onResetShifts,
  onResetAssignments,
}) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

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
          <section className="panel">
            <div className="panel-title">
              <h2>Guardias</h2>
              <button className="icon-button" onClick={onAddGuard} aria-label="Agregar guardia" title="Agregar guardia">
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
              <h2>Asignaciones</h2>
            </div>
            <p className="settings-hint">Borra los turnos y auditorias elegidos a mano en todo el calendario.</p>
            <button className="reset-button danger" onClick={confirmResetAssignments}>
              <RotateCcw size={16} />
              Reiniciar asignaciones
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
