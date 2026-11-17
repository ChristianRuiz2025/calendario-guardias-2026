import { useEffect, useState } from "react";

const STORAGE_KEY = "calendario-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function readStoredTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function systemTheme() {
  return window.matchMedia?.(DARK_QUERY).matches ? "dark" : "light";
}

// Tema claro u oscuro. Por defecto sigue al sistema; el boton guarda la eleccion
// en este navegador.
export function useTheme() {
  const [storedTheme, setStoredTheme] = useState(readStoredTheme);
  const [system, setSystem] = useState(systemTheme);
  const theme = storedTheme ?? system;

  useEffect(() => {
    const media = window.matchMedia?.(DARK_QUERY);
    if (!media) {
      return undefined;
    }
    const handleChange = () => setSystem(media.matches ? "dark" : "light");
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    // Si la eleccion coincide con el sistema, se vuelve a seguir al sistema.
    const stored = next === system ? null : next;
    setStoredTheme(stored);
    try {
      if (stored) {
        localStorage.setItem(STORAGE_KEY, stored);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Sin almacenamiento solo dura esta sesion.
    }
  }

  return { theme, toggleTheme };
}

const ACCENT_STORAGE_KEY = "calendario-accent";

function readStoredAccent() {
  try {
    return localStorage.getItem(ACCENT_STORAGE_KEY) === "default" ? "default" : "profile";
  } catch {
    return "profile";
  }
}

// Color de acento: "profile" usa el color de la persona que inicio sesion,
// "default" deja el azul de la app. La eleccion se guarda en este navegador.
export function useAccentMode() {
  const [accentMode, setAccentModeState] = useState(readStoredAccent);

  function setAccentMode(mode) {
    const next = mode === "default" ? "default" : "profile";
    setAccentModeState(next);
    try {
      if (next === "default") {
        localStorage.setItem(ACCENT_STORAGE_KEY, next);
      } else {
        localStorage.removeItem(ACCENT_STORAGE_KEY);
      }
    } catch {
      // Sin almacenamiento solo dura esta sesion.
    }
  }

  return { accentMode, setAccentMode };
}

const STYLE_STORAGE_KEY = "calendario-estilo";
// Estilos visuales disponibles en Configuracion > Apariencia.
export const STYLE_MODES = ["clasico", "cristal"];

function readStoredStyle() {
  try {
    const value = localStorage.getItem(STYLE_STORAGE_KEY);
    return STYLE_MODES.includes(value) ? value : "clasico";
  } catch {
    return "clasico";
  }
}

// Estilo de la app: "clasico" (tarjetas solidas) o "cristal" (tarjetas translucidas sobre un fondo
// de color, ver src/themeGlass.css). Se pone en <html data-style="..."> y se guarda en este navegador.
export function useStyleMode() {
  const [styleMode, setStyleModeState] = useState(readStoredStyle);

  useEffect(() => {
    document.documentElement.dataset.style = styleMode;
  }, [styleMode]);

  function setStyleMode(mode) {
    const next = STYLE_MODES.includes(mode) ? mode : "clasico";
    setStyleModeState(next);
    try {
      if (next === "clasico") {
        localStorage.removeItem(STYLE_STORAGE_KEY);
      } else {
        localStorage.setItem(STYLE_STORAGE_KEY, next);
      }
    } catch {
      // Sin almacenamiento solo dura esta sesion.
    }
  }

  return { styleMode, setStyleMode };
}
