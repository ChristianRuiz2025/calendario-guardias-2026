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
