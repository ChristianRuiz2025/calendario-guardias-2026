import React, { useState } from "react";
import { Download } from "lucide-react";
import CollapsiblePanel from "./CollapsiblePanel";

const STORAGE_KEY = "calendario-ics-descarga";

// Archivos ICS que puede bajar "Descargar mes"; todos marcados por defecto.
export const ICS_KINDS = [
  { id: "shifts", label: "Turnos", hint: "Fuera de oficina antes y despues de tu horario" },
  { id: "vacations", label: "Vacaciones", hint: "Ausente de 8:00 a 19:00" },
  { id: "lunches", label: "Comidas", hint: "Comida, Ausente" },
  { id: "audits", label: "Auditorias", hint: "Lunes a viernes de tu semana" },
];

const ALL_KINDS = ICS_KINDS.map((kind) => kind.id);

function readStoredKinds() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(value) ? value.filter((id) => ALL_KINDS.includes(id)) : ALL_KINDS;
  } catch {
    return ALL_KINDS;
  }
}

// ICS elegidos para descargar; la eleccion se guarda en este navegador.
export function useIcsKinds() {
  const [kinds, setKinds] = useState(readStoredKinds);

  function toggleKind(id) {
    setKinds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Sin almacenamiento solo dura esta sesion.
      }
      return next;
    });
  }

  return { kinds, toggleKind };
}

export default function DownloadOptions({ kinds, onToggle, onDownload, monthName }) {
  return (
    <CollapsiblePanel
      title="Descargar ICS"
      summary={kinds.length === ICS_KINDS.length ? "Todos" : `${kinds.length} de ${ICS_KINDS.length}`}
      className="download-options"
    >
      <div className="download-kinds">
        {ICS_KINDS.map((kind) => (
          <label key={kind.id} className="download-kind">
            <input type="checkbox" checked={kinds.includes(kind.id)} onChange={() => onToggle(kind.id)} />
            <span>
              <strong>{kind.label}</strong>
              <small>{kind.hint}</small>
            </span>
          </label>
        ))}
      </div>
      <button type="button" className="download-button" onClick={onDownload} disabled={kinds.length === 0}>
        <Download size={16} />
        Descargar {monthName}
      </button>
    </CollapsiblePanel>
  );
}
