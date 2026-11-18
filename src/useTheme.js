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

// Tema claro u oscuro (Configuracion > Apariencia). "system" sigue al sistema; "light" y "dark"
// se guardan en este navegador.
export function useTheme() {
  const [storedTheme, setStoredTheme] = useState(readStoredTheme);
  const [system, setSystem] = useState(systemTheme);
  const theme = storedTheme ?? system;
  const themeMode = storedTheme ?? "system";

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

  function setThemeMode(mode) {
    const stored = mode === "light" || mode === "dark" ? mode : null;
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

  return { theme, themeMode, setThemeMode };
}

const STYLE_STORAGE_KEY = "calendario-estilo";
// Estilos visuales disponibles en Configuracion > Apariencia.
// "cesa" es el predeterminado.
export const STYLE_MODES = ["cesa", "clasico", "cristal", "papel", "pastel"];
export const DEFAULT_STYLE = "cesa";

function readStoredStyle() {
  try {
    const value = localStorage.getItem(STYLE_STORAGE_KEY);
    return STYLE_MODES.includes(value) ? value : DEFAULT_STYLE;
  } catch {
    return DEFAULT_STYLE;
  }
}

// Estilo de la app: "cesa" (predeterminado, src/themeCesa.css), "clasico", "cristal"
// (src/themeGlass.css), "papel" (src/themePaper.css) o "pastel" (src/themePastel.css). Se pone en <html data-style="..."> y se guarda en este navegador.
export function useStyleMode() {
  const [styleMode, setStyleModeState] = useState(readStoredStyle);

  useEffect(() => {
    document.documentElement.dataset.style = styleMode;
  }, [styleMode]);

  function setStyleMode(mode) {
    const next = STYLE_MODES.includes(mode) ? mode : DEFAULT_STYLE;
    setStyleModeState(next);
    try {
      if (next === DEFAULT_STYLE) {
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
