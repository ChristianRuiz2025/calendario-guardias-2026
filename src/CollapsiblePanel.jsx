import React, { useState } from "react";
import { ChevronRight } from "lucide-react";

// Panel de la barra lateral que se abre y cierra (empieza cerrado); el resumen se ve aun cerrado.
// icon: componente de lucide-react que va antes del titulo (opcional).
export default function CollapsiblePanel({ title, summary, icon: Icon, className = "", children }) {
  const [open, setOpen] = useState(false);

  return (
    <section className={["panel", "settings-section", "sidebar-collapsible", open ? "open" : "", className].join(" ")}>
      <div className="settings-section-head">
        <button
          type="button"
          className="settings-section-toggle"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
        >
          {Icon ? <Icon size={17} className="sidebar-collapsible-icon" aria-hidden="true" /> : null}
          <h2>{title}</h2>
          {summary ? <span className="settings-section-summary">{summary}</span> : null}
          <ChevronRight size={17} className="holiday-chevron" aria-hidden="true" />
        </button>
      </div>
      {open ? <div className="settings-section-body">{children}</div> : null}
    </section>
  );
}
