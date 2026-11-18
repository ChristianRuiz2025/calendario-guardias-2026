import React, { useEffect, useRef, useState } from "react";

const SHOW_DELAY_MS = 350;
const GAP = 8;

// Etiquetas al pasar el raton con el estilo de la app, para cualquier elemento con "title".
// Mientras se muestra, el title se mueve a data-app-title para que el navegador no muestre la
// suya; al salir se regresa (los lectores de pantalla siguen usando aria-label).
export default function AppTooltip() {
  const [tip, setTip] = useState(null);
  const tipRef = useRef(null);
  const timerRef = useRef(null);
  const targetRef = useRef(null);

  useEffect(() => {
    function restoreTitle() {
      const target = targetRef.current;
      if (target?.dataset.appTitle !== undefined) {
        target.setAttribute("title", target.dataset.appTitle);
        delete target.dataset.appTitle;
      }
      targetRef.current = null;
    }

    function hide() {
      clearTimeout(timerRef.current);
      restoreTitle();
      setTip(null);
    }

    function handleOver(event) {
      const target = event.target.closest?.("[title]");
      if (!target || target === targetRef.current) {
        return;
      }
      const text = target.getAttribute("title");
      hide();
      if (!text) {
        return;
      }
      targetRef.current = target;
      target.dataset.appTitle = text;
      target.removeAttribute("title");
      timerRef.current = setTimeout(() => {
        if (targetRef.current === target && target.isConnected) {
          setTip({ text, rect: target.getBoundingClientRect() });
        }
      }, SHOW_DELAY_MS);
    }

    function handleOut(event) {
      const target = targetRef.current;
      if (target && !target.contains(event.relatedTarget)) {
        hide();
      }
    }

    document.addEventListener("mouseover", handleOver);
    document.addEventListener("mouseout", handleOut);
    document.addEventListener("mousedown", hide);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      hide();
      document.removeEventListener("mouseover", handleOver);
      document.removeEventListener("mouseout", handleOut);
      document.removeEventListener("mousedown", hide);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  // Arriba del elemento y centrada; abajo si no cabe arriba; siempre dentro de la ventana.
  const [position, setPosition] = useState(null);
  useEffect(() => {
    if (!tip || !tipRef.current) {
      setPosition(null);
      return;
    }
    const box = tipRef.current.getBoundingClientRect();
    const { rect } = tip;
    let top = rect.top - box.height - GAP;
    let placement = "top";
    if (top < 6) {
      top = rect.bottom + GAP;
      placement = "bottom";
    }
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - box.width / 2, 6),
      window.innerWidth - box.width - 6
    );
    setPosition({ top, left, placement });
  }, [tip]);

  if (!tip) {
    return null;
  }

  return (
    <div
      ref={tipRef}
      className={["app-tooltip", position ? `visible ${position.placement}` : ""].join(" ")}
      role="tooltip"
      style={position ? { top: position.top, left: position.left } : { top: -9999, left: -9999 }}
    >
      {tip.text}
    </div>
  );
}
