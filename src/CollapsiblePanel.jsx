import React, { useState } from "react";
import { ChevronRight } from "lucide-react";

// Panel de la barra lateral que se abre y cierra (empieza cerrado); el resumen se ve aun cerrado.
export default function CollapsiblePanel({ title, summary, className = "", children }) {
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
          <ChevronRight size={18} className="holiday-chevron" aria-hidden="true" />
          <h2>{title}</h2>
          {summary ? <span className="settings-section-summary">{summary}</span> : null}
        </button>
      </div>
      {open ? <div className="settings-section-body">{children}</div> : null}
    </section>
  );
}
