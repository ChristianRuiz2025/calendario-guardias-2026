import React, { useEffect, useState } from "react";

// Marca cada semana del calendario con el color de quien tiene auditorias (Configuracion >
// Apariencia > Semana de auditorias):
//   "tinted"  contorno y fondo suave del color alrededor de la semana
//   "stripe"  solo una franja de color a la izquierda
// Se dibuja como capa detras de la tabla (no es parte de ella), asi que no sale en la foto del
// correo. tableRef: la tabla del calendario; colors: el color de cada semana (o null).
export default function WeekMarks({ tableRef, colors, mode }) {
  const [boxes, setBoxes] = useState([]);

  // useEffect (no useLayoutEffect): la tabla va despues de esta capa, y su ref se asigna hasta que
  // React termina de montar todo.
  useEffect(() => {
    const table = tableRef.current;
    if (mode === "none" || !table) {
      setBoxes([]);
      return undefined;
    }

    function measure() {
      const wrap = table.parentElement;
      const wrapRect = wrap.getBoundingClientRect();
      const dateRows = table.querySelectorAll("tbody .date-row");
      const scheduleRows = table.querySelectorAll("tbody .schedule-row");
      const next = [];
      dateRows.forEach((dateRow, index) => {
        const scheduleRow = scheduleRows[index];
        if (!scheduleRow) {
          return;
        }
        const top = dateRow.getBoundingClientRect();
        const bottom = scheduleRow.getBoundingClientRect();
        // El ultimo td de la fila de turnos trae 10 px de separacion abajo (ver calendarRefined.css).
        const gap = parseFloat(getComputedStyle(scheduleRow.lastElementChild).borderBottomWidth) || 0;
        const box = {
          top: top.top - wrapRect.top + wrap.scrollTop,
          left: top.left - wrapRect.left + wrap.scrollLeft,
          width: top.width,
          height: bottom.bottom - top.top - gap,
        };
        // Contorno: 3-4 px de aire alrededor (deja separacion entre semanas). Franja: barra de 5 px pegada a la izquierda.
        next.push(
          mode === "stripe"
            ? { ...box, left: box.left - 7, width: 5 }
            : { top: box.top - 3, left: box.left - 4, width: box.width + 8, height: box.height + 6 }
        );
      });
      setBoxes(next);
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(table);
    return () => observer.disconnect();
  }, [tableRef, mode, colors.join("|")]);

  if (mode === "none") {
    return null;
  }

  return (
    <div className={`week-marks ${mode}`} aria-hidden="true">
      {boxes.map((box, index) =>
        colors[index] ? (
          <span
            key={index}
            className="week-mark"
            style={{
              top: box.top,
              left: box.left,
              width: box.width,
              height: box.height,
              "--week-color": colors[index],
            }}
          />
        ) : null
      )}
    </div>
  );
}
