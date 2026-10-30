// Arma el correo del mes (lo usa api/enviar-mes.js) con el mismo diseno que el calendario
// de la app: tablas con estilos en linea, porque los clientes de correo ignoran las hojas
// de estilo. Tambien devuelve una version en texto.

import { dateKey, getAuditGuard, startOfWorkWeek } from "./auditRotation.js";
import { buildCloseDays } from "./calendarRules.js";

const WEEKDAYS = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes"];

export const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

// Mismos colores que src/styles.css (tema claro).
const COLORS = {
  monthRow: "#1f577e",
  header: "#9fc5e4",
  headerText: "#001729",
  timeText: "#003b60",
  dateRow: "#050505",
  outsideDate: "#404040",
  outsideDateText: "#d7d7d7",
  outside: "#777270",
  cell: "#fffdf7",
  offDuty: "#a5a5a5",
  offDutyText: "#202020",
  holiday: "#d19a00",
  holidayText: "#16100a",
  border: "#131313",
  office: "#d92828",
  monthEnd: "#149a4f",
  msClose: "#e0b400",
};

const FONT = "font-family:Arial,Helvetica,sans-serif";
const CELL_HEIGHT = 78;

// Semanas (lunes a viernes) que tocan el mes, con lo que hay cada dia, para buildMonthEmail.
// shifts deben venir ordenados por hora de entrada (su indice es la fila en el calendario).
// assignments y vacations usan llaves "YYYY-MM-DD|guardId", igual que en la app.
export function buildMonthWeeks({
  year,
  monthIndex,
  guards,
  shifts,
  assignments,
  holidays,
  vacations,
  auditAssignments,
  auditRotations,
  officeDays,
  msCloseDay,
}) {
  const closeDays = buildCloseDays(year, holidays, msCloseDay);
  const weeks = [];
  const monday = startOfWorkWeek(new Date(year, monthIndex, 1));

  while (monday.getMonth() === monthIndex || monday < new Date(year, monthIndex, 1)) {
    const days = Array.from({ length: 5 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      const key = dateKey(date);
      const inMonth = date.getMonth() === monthIndex;
      return {
        date,
        inMonth,
        holiday: key in holidays ? holidays[key] : null,
        markers: inMonth
          ? [
              officeDays.includes(date.getDay()) ? COLORS.office : null,
              closeDays.monthEndDays.has(key) ? COLORS.monthEnd : null,
              closeDays.msCloseDays.has(key) ? COLORS.msClose : null,
            ].filter(Boolean)
          : [],
        // Una columna por persona: su turno (con su fila) o si esta de vacaciones.
        columns: guards.map((guard) => {
          const vacation = Boolean(vacations[`${key}|${guard.id}`]);
          const shiftIndex = shifts.findIndex((shift) => shift.id === assignments[`${key}|${guard.id}`]);
          return { guard, vacation, shiftIndex: vacation ? -1 : shiftIndex };
        }),
      };
    });

    if (days.some((day) => day.inMonth)) {
      weeks.push({ days, auditGuard: getAuditGuard(monday, guards, auditAssignments, auditRotations) });
    }
    monday.setDate(monday.getDate() + 7);
  }

  return weeks;
}

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

// Borde de dia especial. Con dos o mas, izquierda de un color y derecha del otro
// (los clientes de correo no dibujan el borde dividido de la app).
function markerBorder(markers) {
  if (markers.length === 0) {
    return `border:1px dotted ${COLORS.border}`;
  }
  const first = markers[0];
  const last = markers.at(-1);
  return `border:4px solid ${first};border-right-color:${last}`;
}

// Columnas de un dia: cada persona pinta su columna desde la fila de su hora de entrada.
function dayGrid(columns, shiftCount) {
  const rowHeight = Math.round(CELL_HEIGHT / shiftCount);
  const width = `${Math.floor(100 / columns.length)}%`;
  const base = `width:${width};${FONT};font-size:11px;font-weight:bold;text-align:center;border-right:2px solid #7a7a7a`;
  const rows = [];

  for (let row = 0; row < shiftCount; row += 1) {
    const cells = columns
      .map(({ guard, vacation, shiftIndex }) => {
        const initials = escapeHtml(guard.initials ?? guard.name.slice(0, 1));
        if (vacation) {
          return row === 0
            ? `<td rowspan="${shiftCount}" style="${base};color:#111111;background-color:${guard.color};` +
                `background-image:repeating-linear-gradient(-45deg,${guard.color} 0 5px,#ffffff 5px 10px)">` +
                `<span style="background:#ffffff;padding:1px 3px;border-radius:3px">${initials}</span></td>`
            : "";
        }
        if (shiftIndex < 0) {
          return row === 0
            ? `<td rowspan="${shiftCount}" style="${base};color:${COLORS.offDutyText};background:${COLORS.offDuty}">${initials}</td>`
            : "";
        }
        if (row === 0 && shiftIndex > 0) {
          return `<td rowspan="${shiftIndex}" style="${base};background:${COLORS.cell}">&nbsp;</td>`;
        }
        if (row === shiftIndex) {
          return `<td rowspan="${shiftCount - shiftIndex}" style="${base};color:#111111;background:${guard.color}">${initials}</td>`;
        }
        return "";
      })
      .join("");
    rows.push(`<tr style="height:${rowHeight}px">${cells}</tr>`);
  }

  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" ` +
    `style="width:100%;height:${CELL_HEIGHT}px;border-collapse:collapse">${rows.join("")}</table>`
  );
}

function legendItem(swatchStyle, label) {
  return (
    `<td style="padding:0 8px;${FONT};font-size:12px;font-weight:bold;color:#40586b;white-space:nowrap">` +
    `<span style="display:inline-block;width:12px;height:12px;vertical-align:middle;margin-right:5px;${swatchStyle}"></span>` +
    `${label}</td>`
  );
}

// Simbologia del calendario (debajo de la tabla o de la imagen).
export function buildLegendHtml() {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px auto 0"><tr>` +
    legendItem(`border:3px solid ${COLORS.office}`, "Dias de oficina") +
    legendItem(`border:3px solid ${COLORS.monthEnd}`, "Guardias fin de Mes") +
    legendItem(`border:3px solid ${COLORS.msClose}`, "Cierre MS") +
    legendItem(
      "border:1px solid #5c758a;background-color:#d0d7de;background-image:repeating-linear-gradient(-45deg,#5c758a 0 3px,#ffffff 3px 6px)",
      "Vacaciones"
    ) +
    `</tr></table>`
  );
}

// weeks: lo que devuelve buildMonthWeeks. shifts: los turnos ordenados por hora de entrada.
// intro: HTML opcional (el mensaje de Configuracion) que va entre el titulo y la tabla.
export function buildMonthEmail({ title, intro = "", monthLabel, weeks, shifts }) {
  const shiftCount = Math.max(shifts.length, 1);
  const th = `${FONT};font-size:12px;border:1px dotted ${COLORS.border}`;
  const textLines = [title, ""];

  const header =
    `<tr><th style="${th};width:58px;background:${COLORS.monthRow};color:#ffffff;text-align:left;padding:6px">Entrada</th>` +
    `<th colspan="6" style="${th};background:${COLORS.monthRow};color:#ffffff;padding:6px">${escapeHtml(monthLabel)}</th></tr>` +
    `<tr><th style="${th};background:#111111"></th>` +
    [...WEEKDAYS, "Auditorias"]
      .map(
        (label) =>
          `<th style="${th};background:${COLORS.header};color:${COLORS.headerText};font-weight:normal;padding:5px">${label}</th>`
      )
      .join("") +
    `</tr>`;

  const timeStack =
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;height:${CELL_HEIGHT}px">` +
    shifts
      .map(
        (shift) =>
          `<tr><td style="${FONT};font-size:11px;color:${COLORS.timeText};padding-left:5px">${formatTime(shift.start)}</td></tr>`
      )
      .join("") +
    `</table>`;

  const body = weeks
    .map(({ days, auditGuard }) => {
      const dateRow =
        `<tr><td style="background:${COLORS.dateRow};border:1px dotted ${COLORS.border}"></td>` +
        days
          .map(
            (day) =>
              `<td style="${markerBorder(day.markers)};background:${day.inMonth ? COLORS.dateRow : COLORS.outsideDate};` +
              `color:${day.inMonth ? "#ffffff" : COLORS.outsideDateText};${FONT};font-size:13px;font-weight:bold;` +
              `text-align:center;padding:2px">${day.date.getDate()}</td>`
          )
          .join("") +
        `<td style="background:${COLORS.dateRow};border:1px dotted ${COLORS.border}"></td></tr>`;

      const dayCells = days
        .map((day) => {
          const style = `${markerBorder(day.markers)};padding:0;height:${CELL_HEIGHT}px;vertical-align:top`;
          if (!day.inMonth) {
            return `<td style="${style};background:${COLORS.outside}"></td>`;
          }
          if (day.holiday !== null) {
            textLines.push(`${day.date.getDate()}: ${day.holiday || "No hay Clases"}`);
            return (
              `<td style="${style};background:${COLORS.holiday};color:${COLORS.holidayText};${FONT};font-size:12px;` +
              `font-weight:bold;text-align:center;vertical-align:middle;padding:0 4px">${escapeHtml(day.holiday || "No hay Clases")}</td>`
            );
          }

          const summary = day.columns
            .map(({ guard, vacation, shiftIndex }) =>
              vacation
                ? `${guard.name} vacaciones`
                : shiftIndex >= 0
                  ? `${guard.name} ${formatTime(shifts[shiftIndex].start)}-${formatTime(shifts[shiftIndex].end)}`
                  : null
            )
            .filter(Boolean);
          textLines.push(`${day.date.getDate()}: ${summary.join(", ") || "Sin guardias"}`);
          return `<td style="${style};background:${COLORS.cell}">${dayGrid(day.columns, shiftCount)}</td>`;
        })
        .join("");

      textLines.push(`Auditorias de la semana: ${auditGuard ? auditGuard.name : "Sin asignar"}`, "");
      const audit = auditGuard
        ? `<td style="border:1px dotted ${COLORS.border};background:${auditGuard.color};color:#111111;${FONT};font-size:13px;font-weight:bold;text-align:center;text-transform:uppercase">${escapeHtml(auditGuard.name)}</td>`
        : `<td style="border:1px dotted ${COLORS.border};background:${COLORS.offDuty};color:${COLORS.offDutyText};${FONT};font-size:12px;font-weight:bold;text-align:center;text-transform:uppercase">Sin asignar</td>`;

      const scheduleRow =
        `<tr><td style="background:${COLORS.header};border:1px dotted ${COLORS.border};padding:0;vertical-align:top">${timeStack}</td>` +
        `${dayCells}${audit}</tr>`;

      return dateRow + scheduleRow;
    })
    .join("");

  const html =
    `<div style="background:#ffffff;padding:12px;max-width:760px">` +
    `<p style="${FONT};font-size:16px;font-weight:bold;color:#16212e;margin:0 0 10px">${escapeHtml(title)}</p>` +
    intro +
    `<table cellpadding="0" cellspacing="0" style="width:100%;max-width:720px;border-collapse:collapse;table-layout:fixed">` +
    `<colgroup><col style="width:58px"><col><col><col><col><col><col style="width:110px"></colgroup>` +
    `<thead>${header}</thead><tbody>${body}</tbody></table>${buildLegendHtml()}</div>`;

  return { html, text: textLines.join("\n") };
}
