// Arma el resumen del mes para pegarlo en un correo: una tabla HTML con estilos en
// linea (los clientes de correo ignoran las hojas de estilo) y una version en texto.

const WEEKDAYS = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes"];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// "08:00" -> "8:00"
function formatTime(time) {
  return time.replace(/^0/, "");
}

function chip(text, background) {
  return (
    `<span style="display:inline-block;margin:1px 0;padding:2px 6px;border-radius:4px;` +
    `background:${background};color:#111111;font-size:12px;font-weight:bold;white-space:nowrap">` +
    `${escapeHtml(text)}</span>`
  );
}

const CELL = "border:1px solid #c7d5e3;padding:4px;vertical-align:top;font-family:Arial,sans-serif;font-size:12px";

// days: para cada dia de la semana { date, key, inMonth, holiday (nombre o null), shifts: [{ guard, start, end }],
// vacation: [guard] }. weeks: [{ days, auditGuard }]
export function buildMonthEmail({ title, weeks }) {
  const headerCells = [...WEEKDAYS, "Auditorias"]
    .map(
      (label) =>
        `<th style="${CELL};background:#1f577e;color:#ffffff;text-align:center;font-weight:bold">${label}</th>`
    )
    .join("");

  const textLines = [title, ""];

  const rows = weeks
    .map(({ days, auditGuard }) => {
      const cells = days
        .map((day) => {
          if (!day.inMonth) {
            return `<td style="${CELL};background:#e5e7eb"></td>`;
          }

          const dateLabel = `<div style="font-weight:bold;margin-bottom:3px">${day.date.getDate()}</div>`;
          if (day.holiday !== null) {
            textLines.push(`${day.date.getDate()}: ${day.holiday || "Feriado"}`);
            return `<td style="${CELL};background:#d19a00">${dateLabel}${escapeHtml(day.holiday || "Feriado")}</td>`;
          }

          const lines = [
            ...day.shifts.map(({ guard, start, end }) => ({
              html: chip(`${guard.name} ${formatTime(start)}-${formatTime(end)}`, guard.color),
              text: `${guard.name} ${formatTime(start)}-${formatTime(end)}`,
            })),
            ...day.vacation.map((guard) => ({
              html: chip(`${guard.name} vacaciones`, "#e5e7eb"),
              text: `${guard.name} vacaciones`,
            })),
          ];
          textLines.push(`${day.date.getDate()}: ${lines.map((line) => line.text).join(", ") || "Sin guardias"}`);
          return `<td style="${CELL}">${dateLabel}${lines.map((line) => line.html).join("<br>")}</td>`;
        })
        .join("");

      const audit = auditGuard ? chip(auditGuard.name, auditGuard.color) : "Sin asignar";
      textLines.push(`Auditorias de la semana: ${auditGuard ? auditGuard.name : "Sin asignar"}`, "");
      return `<tr>${cells}<td style="${CELL};text-align:center;vertical-align:middle">${audit}</td></tr>`;
    })
    .join("");

  const html =
    `<p style="font-family:Arial,sans-serif;font-size:14px;font-weight:bold">${escapeHtml(title)}</p>` +
    `<table style="border-collapse:collapse;width:100%;max-width:760px">` +
    `<thead><tr>${headerCells}</tr></thead><tbody>${rows}</tbody></table>`;

  return { html, text: textLines.join("\n") };
}
