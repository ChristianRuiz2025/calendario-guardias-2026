import React, { useEffect, useRef, useState } from "react";

const SHOW_DELAY_MS = 350;
const GAP = 8;

// Pasa el "title" de un elemento a data-tip, para que el navegador nunca muestre su etiqueta.
// Si el elemento no tiene aria-label, el texto queda en aria-description para lectores de pantalla.
function moveTitle(element) {
  const text = element.getAttribute("title");
  if (text === null) {
    return;
  }
  element.removeAttribute("title");
  if (!text) {
    return;
  }
  element.dataset.tip = text;
  if (!element.hasAttribute("aria-label")) {
    element.setAttribute("aria-description", text);
  }
}

// Etiquetas al pasar el raton con el estilo de la app, para cualquier elemento con "title".
// Un MutationObserver cambia cada title a data-tip en cuanto aparece (o React lo actualiza), y la
// etiqueta se busca con elementFromPoint, que tambien encuentra botones desactivados (esos no
// reciben eventos del raton).
export default function AppTooltip() {
  const [tip, setTip] = useState(null);
  const [position, setPosition] = useState(null);
  const tipRef = useRef(null);
  const currentRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    document.querySelectorAll("[title]").forEach(moveTitle);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          moveTitle(mutation.target);
        } else {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType !== 1) {
              return;
            }
            if (node.hasAttribute("title")) {
              moveTitle(node);
            }
            node.querySelectorAll?.("[title]").forEach(moveTitle);
          });
        }
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["title"] });

    function hide() {
      clearTimeout(timerRef.current);
      currentRef.current = null;
      setTip(null);
    }

    let frame = 0;
    function handleMove(event) {
      if (frame) {
        return;
      }
      const { clientX, clientY } = event;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const element = document.elementFromPoint(clientX, clientY)?.closest("[data-tip]") ?? null;
        if (element === currentRef.current) {
          return;
        }
        hide();
        if (!element) {
          return;
        }
        currentRef.current = element;
        timerRef.current = setTimeout(() => {
          if (currentRef.current === element && element.isConnected && element.dataset.tip) {
            setTip({ text: element.dataset.tip, rect: element.getBoundingClientRect() });
          }
        }, SHOW_DELAY_MS);
      });
    }

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mousedown", hide);
    document.addEventListener("mouseleave", hide);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      hide();
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mousedown", hide);
      document.removeEventListener("mouseleave", hide);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  // Arriba del elemento y centrada; abajo si no cabe arriba; siempre dentro de la ventana.
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
