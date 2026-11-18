import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";

// Confirmaciones y avisos con el estilo de la app (en lugar de window.confirm / window.alert).
// Toma el estilo elegido en Apariencia porque usa las mismas clases que la ventana de
// Configuracion (.modal-backdrop / .modal).
//
//   if (await confirmDialog({ title, message, confirmLabel: "Eliminar", danger: true })) { ... }
//   await alertDialog({ title, message });

let openDialog = null;

export function confirmDialog(options) {
  return new Promise((resolve) => {
    if (!openDialog) {
      resolve(window.confirm(options.message));
      return;
    }
    openDialog({ ...options, kind: "confirm", resolve });
  });
}

export function alertDialog(options) {
  return new Promise((resolve) => {
    if (!openDialog) {
      window.alert(options.message);
      resolve();
      return;
    }
    openDialog({ ...options, kind: "alert", resolve: () => resolve() });
  });
}

// true mientras hay un dialogo abierto (para que Escape no cierre tambien Configuracion).
export function isDialogOpen() {
  return Boolean(document.querySelector(".app-dialog"));
}

export default function AppDialog() {
  const [dialog, setDialog] = useState(null);
  const confirmRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    openDialog = (next) => setDialog(next);
    return () => {
      openDialog = null;
    };
  }, []);

  function close(result) {
    dialog?.resolve(result);
    setDialog(null);
  }

  useEffect(() => {
    if (!dialog) {
      return undefined;
    }
    // En una eliminacion el foco va a "Cancelar", para que Enter no borre por accidente.
    (dialog.danger ? cancelRef.current : confirmRef.current)?.focus();
    function handleKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog]);

  if (!dialog) {
    return null;
  }

  const Icon = dialog.danger ? AlertTriangle : Info;

  return (
    <div
      className="modal-backdrop app-dialog-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && close(false)}
    >
      <div
        className={["modal", "app-dialog", dialog.danger ? "danger" : ""].join(" ")}
        role={dialog.kind === "confirm" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby="app-dialog-message"
      >
        <div className="app-dialog-body">
          <span className="app-dialog-icon" aria-hidden="true">
            <Icon size={20} />
          </span>
          <div>
            <h2 id="app-dialog-title">{dialog.title}</h2>
            <p id="app-dialog-message">{dialog.message}</p>
          </div>
        </div>
        <div className="app-dialog-actions">
          {dialog.kind === "confirm" ? (
            <button type="button" ref={cancelRef} className="app-dialog-button" onClick={() => close(false)}>
              {dialog.cancelLabel ?? "Cancelar"}
            </button>
          ) : null}
          <button
            type="button"
            ref={confirmRef}
            className={["app-dialog-button", "primary", dialog.danger ? "danger" : ""].join(" ")}
            onClick={() => close(true)}
          >
            {dialog.confirmLabel ?? (dialog.kind === "confirm" ? "Aceptar" : "Entendido")}
          </button>
        </div>
      </div>
    </div>
  );
}
