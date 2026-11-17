import React, { useEffect, useRef, useState } from "react";
import { LogOut, Moon, MoreVertical, Settings, Sun } from "lucide-react";

// Menu de tres puntos del encabezado de la barra lateral: tema, Configuracion y Cerrar sesion.
export default function SidebarMenu({ theme, onToggleTheme, onOpenSettings, onSignOut }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  // Se cierra al dar clic fuera o con Escape.
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    function handlePointer(event) {
      if (!menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    function handleKey(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function choose(action) {
    setOpen(false);
    action();
  }

  return (
    <div className="sidebar-menu" ref={menuRef}>
      <button
        type="button"
        className="sidebar-menu-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-label="Mas opciones"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Mas opciones"
      >
        <MoreVertical size={18} />
      </button>
      {open ? (
        <div className="sidebar-menu-list" role="menu">
          <button type="button" role="menuitem" onClick={() => choose(onToggleTheme)}>
            {theme === "dark" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
            {theme === "dark" ? "Modo claro" : "Modo oscuro"}
          </button>
          <button type="button" role="menuitem" onClick={() => choose(onOpenSettings)}>
            <Settings size={16} aria-hidden="true" />
            Configuracion
          </button>
          <button type="button" role="menuitem" className="danger" onClick={() => choose(onSignOut)}>
            <LogOut size={16} aria-hidden="true" />
            Cerrar sesion
          </button>
        </div>
      ) : null}
    </div>
  );
}
