// POST /api/enviar-mes: envia por correo la tabla del mes a los destinatarios de
// Configuracion > Correo del mes.
//
// Autenticacion: la sesion de la app (cookie de /api/auth).
// Cuerpo: { "month": 0-11 (por defecto el mes actual), "image": "data:image/png;base64,..." (opcional),
//          "logo": "data:image/png;base64,..." (opcional, el logo de siclik CESA que va arriba del correo) }
// Con "image" (la foto del calendario que toma la app) el correo lleva esa imagen incrustada;
// sin ella, una tabla HTML con el mismo diseno.
//
// Variables de entorno (solo servidor, sin prefijo VITE_; en AWS vienen del secreto):
//   las de MySQL (ver api/_lib/db.js) y SESSION_SECRET
//   MAIL_FROM  buzon que envia (p. ej. soportecesa@compusoluciones.com)
// Envio con Microsoft Graph (recomendado para Microsoft 365; app de Azure con permiso Mail.Send):
//   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET
// O envio por SMTP, si no estan las de Graph:
//   SMTP_USER, SMTP_PASS  (MAIL_FROM por defecto es SMTP_USER)
//   SMTP_HOST, SMTP_PORT  opcionales; por defecto smtp.office365.com y 587

import nodemailer from "nodemailer";
import { requireUser } from "./_lib/auth.js";
import { loadCalendar } from "./_lib/db.js";
import { rotationFromRow } from "../src/auditRotation.js";
import {
  DEFAULT_MS_CLOSE_DAY,
  DEFAULT_OFFICE_DAYS,
  DEFAULT_SHIFTS,
} from "../src/calendarDefaults.js";
import { normalizeMailSettings, renderSubject, resolveRecipients } from "../src/mailSettings.js";
import { MONTH_NAMES, buildMonthEmail, buildMonthWeeks } from "../src/monthEmail.js";
import { isValidYear } from "../src/calendarYears.js";
import { buildOfficeDefaults, normalizeOfficeRotation } from "../src/officeRotation.js";

const IMAGE_CID = "calendario@guardias-cesa";
const LOGO_CID = "logo@guardias-cesa";
const MAX_LOGO_BYTES = 200 * 1024;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

function useGraph() {
  return Boolean(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET);
}

// Tiempo total para enviar (conexion, autenticacion y envio): la Lambda tiene 20 s en total, y sin
// limite un puerto bloqueado la dejaria colgada hasta que AWS la corta, sin decir por que.
const MAIL_DEADLINE_MS = 12000;

// Al usuario solo un mensaje generico; el detalle (host, codigo, respuesta del proveedor) va al log.
const MAIL_ERROR = "No se pudo enviar el correo. Intenta mas tarde o avisa al administrador.";

function withDeadline(promise, signal) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
  ]);
}

// Envia con Microsoft Graph como el buzon `from` (flujo client credentials de la app de Azure).
// Imagenes incrustadas del correo: la foto del calendario y el logo, las que vengan.
function inlineImages({ inlineImage, logoImage }) {
  return [
    inlineImage ? { name: "calendario.png", content: inlineImage, cid: IMAGE_CID } : null,
    logoImage ? { name: "siclik-cesa.png", content: logoImage, cid: LOGO_CID } : null,
  ].filter(Boolean);
}

async function sendWithGraph(message, signal) {
  const { from, to, cc, replyTo, subject, html } = message;
  const tokenResponse = await fetch(
    `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: process.env.MS_CLIENT_ID,
        client_secret: process.env.MS_CLIENT_SECRET,
        scope: "https://graph.microsoft.com/.default",
      }),
    }
  );
  const token = await tokenResponse.json();
  if (!tokenResponse.ok) {
    throw new Error(token.error_description ?? token.error ?? `token ${tokenResponse.status}`);
  }

  const recipients = (addresses) => addresses.map((address) => ({ emailAddress: { address } }));
  const sendResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
    method: "POST",
    signal,
    headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: recipients(to),
        ccRecipients: recipients(cc),
        replyTo: replyTo ? recipients([replyTo]) : [],
        attachments: inlineImages(message).map((image) => ({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: image.name,
          contentType: "image/png",
          contentBytes: image.content.toString("base64"),
          contentId: image.cid,
          isInline: true,
        })),
      },
      saveToSentItems: true,
    }),
  });
  if (!sendResponse.ok) {
    const detail = await sendResponse.json().catch(() => ({}));
    throw new Error(detail.error?.message ?? `sendMail ${sendResponse.status}`);
  }
}

async function sendWithSmtp(message, signal) {
  const { from, to, cc, replyTo, subject, html, text } = message;
  const port = Number(process.env.SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.office365.com",
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: MAIL_DEADLINE_MS,
    greetingTimeout: MAIL_DEADLINE_MS,
    socketTimeout: MAIL_DEADLINE_MS,
  });
  // nodemailer no acepta AbortSignal: al vencer el tiempo total se cierra la conexion.
  signal.addEventListener("abort", () => transporter.close(), { once: true });
  const sending = transporter.sendMail({
    from: { name: "Guardias CESA", address: from },
    to,
    cc,
    replyTo,
    subject,
    text,
    html,
    attachments: inlineImages(message).map((image) => ({ filename: image.name, content: image.content, cid: image.cid })),
  });
  // Si vence el tiempo, el envio termina con error despues; se ignora para que no quede sin atender.
  sending.catch(() => {});
  await withDeadline(sending, signal);
}

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  // Solo alguien con sesion iniciada en la app puede enviar el correo.
  const sessionUser = await requireUser(req, res);
  if (!sessionUser) {
    return undefined;
  }

  const year = req.body?.year ?? new Date().getFullYear();
  if (!isValidYear(year)) {
    return res.status(400).json({ error: "El anio no es valido" });
  }
  const monthIndex = req.body?.month ?? new Date().getMonth();
  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return res.status(400).json({ error: "El mes debe ser un numero de 0 a 11" });
  }

  let inlineImage = null;
  if (req.body?.image) {
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(req.body.image);
    inlineImage = match ? Buffer.from(match[1], "base64") : null;
    if (!inlineImage || inlineImage.length > MAX_IMAGE_BYTES) {
      return res.status(400).json({ error: "La imagen del calendario no es valida" });
    }
  }

  let logoImage = null;
  if (req.body?.logo) {
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(req.body.logo);
    logoImage = match ? Buffer.from(match[1], "base64") : null;
    if (!logoImage || logoImage.length > MAX_LOGO_BYTES) {
      return res.status(400).json({ error: "El logo no es valido" });
    }
  }

  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  if (!from || (!useGraph() && !process.env.SMTP_PASS)) {
    return res
      .status(500)
      .json({ error: "Falta configurar el envio de correo en el servidor (MAIL_FROM y Graph, o SMTP_USER y SMTP_PASS)" });
  }

  let calendar;
  try {
    calendar = await loadCalendar();
  } catch (dbError) {
    console.error(dbError);
    return res.status(500).json({ error: "No se pudo leer el calendario" });
  }

  const guards = calendar.guards;
  // Igual que en la app: si falta un ajuste se usa su valor por defecto.
  const setting = (key) => calendar.settings.find((row) => row.key === key)?.value;
  // Por defecto lo reciben todas las personas del calendario con correo, mas los adicionales.
  const mailSettings = normalizeMailSettings(setting("mail_recipients"));
  const { to, cc } = resolveRecipients(mailSettings, guards);
  if (to.length === 0) {
    return res.status(400).json({ error: "No hay destinatarios. Revisa Configuracion > Correos" });
  }

  // Turnos ordenados por hora de entrada, igual que en la app.
  const shifts = (
    calendar.shiftTemplates.length
      ? calendar.shiftTemplates.map((row) => ({ id: row.id, start: row.start_time, end: row.end_time }))
      : DEFAULT_SHIFTS
  ).sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const officeDays = setting("office_days");
  const msCloseDay = setting("ms_close_day");
  const weeks = buildMonthWeeks({
    year,
    monthIndex,
    guards,
    shifts,
    officeDays: Array.isArray(officeDays) ? officeDays : DEFAULT_OFFICE_DAYS,
    msCloseDay: Number.isInteger(msCloseDay) ? msCloseDay : DEFAULT_MS_CLOSE_DAY,
    // Los turnos por defecto de la rotacion de oficina, y encima lo guardado (igual que en la app).
    assignments: {
      ...buildOfficeDefaults(
        normalizeOfficeRotation(setting("office_rotation")),
        Array.isArray(officeDays) ? officeDays : DEFAULT_OFFICE_DAYS,
        Object.fromEntries(calendar.holidays.map((row) => [row.day_key, row.name ?? ""])),
        guards,
        shifts,
        `${year}-01-01`,
        `${year}-12-31`
      ),
      ...Object.fromEntries(calendar.assignments.map((row) => [`${row.day_key}|${row.guard_id}`, row.shift_id])),
    },
    holidays: Object.fromEntries(calendar.holidays.map((row) => [row.day_key, row.name ?? ""])),
    vacations: Object.fromEntries(calendar.vacations.map((row) => [`${row.day_key}|${row.guard_id}`, true])),
    auditAssignments: Object.fromEntries(calendar.auditAssignments.map((row) => [row.week_key, row.guard_id])),
    auditRotations: calendar.auditRotations.map(rotationFromRow),
  });

  const sender = guards.find(
    (guard) => (guard.email ?? "").trim().toLowerCase() === sessionUser.email?.toLowerCase()
  );
  const title = renderSubject(mailSettings, MONTH_NAMES[monthIndex], year);
  // Tabla HTML de respaldo (si la app no pudo mandar la foto) y el texto plano del correo.
  const email = buildMonthEmail({ title, monthLabel: `${MONTH_NAMES[monthIndex]} ${year}`, weeks, shifts, tableOnly: true });
  const { text } = email;
  const sentBy = sender?.name ?? sessionUser.email;
  const monthLabel = `${MONTH_NAMES[monthIndex]} ${year}`;

  // Diseno minimalista: franja roja de CESA a la izquierda, logo, mes, mensaje, la foto del calendario
  // (igual a la app, estilo Clasico) y una linea de simbologia. Todo con tablas y estilos en linea,
  // que es lo que Outlook muestra bien. Sin foto, va la tabla HTML de respaldo.
  const FONT = "font-family:Arial,Helvetica,sans-serif";
  const legendBar = (color) =>
    `<span style="display:inline-block;width:14px;height:4px;background:${color};vertical-align:middle;margin-right:5px"></span>`;
  const logoHtml = logoImage
    ? `<img src="cid:${LOGO_CID}" alt="siclik CESA" width="150" height="21" ` +
      `style="display:block;width:150px;height:21px;border:0;margin:0 0 16px">`
    : "";
  const introHtml = mailSettings.message.trim()
    ? `<p style="${FONT};font-size:14px;line-height:1.5;color:#4b5563;margin:0 0 16px">` +
      `${escapeHtml(mailSettings.message.trim()).replace(/\n/g, "<br>")}</p>`
    : "";
  const calendarHtml = inlineImage
    ? `<img src="cid:${IMAGE_CID}" alt="Calendario de guardias ${escapeHtml(monthLabel)}" width="720" ` +
      `style="display:block;width:100%;max-width:720px;height:auto;border:0">`
    : email.html;
  const html =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff">` +
    `<tr><td style="padding:20px 16px">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:760px">` +
    `<tr><td width="4" style="width:4px;background:#ea0a2a"></td>` +
    `<td style="padding:4px 0 4px 20px">` +
    logoHtml +
    `<p style="${FONT};font-size:20px;font-weight:bold;color:#1f2328;margin:0 0 6px">${escapeHtml(monthLabel)}</p>` +
    introHtml +
    calendarHtml +
    `<p style="${FONT};font-size:12px;color:#6b7280;margin:14px 0 0">` +
    `${legendBar("#ea0a2a")}Oficina &nbsp;&nbsp; ${legendBar("#149a4f")}Fin de mes &nbsp;&nbsp; ` +
    `${legendBar("#e0b400")}Cierre MS &nbsp;&nbsp; &#9636; Vacaciones</p>` +
    `<p style="${FONT};font-size:12px;color:#9aa1ab;margin:14px 0 0">Enviado por ${escapeHtml(sentBy)} desde Calendario Guardias</p>` +
    `</td></tr></table>` +
    `</td></tr></table>`;

  const message = {
    inlineImage,
    logoImage,
    from,
    to,
    cc,
    replyTo: sessionUser.email,
    subject: title,
    // Titulo, luego el mensaje y luego el resumen del mes (text ya empieza con el titulo).
    text: [title, mailSettings.message.trim(), text.split("\n").slice(2).join("\n"), `Enviado por ${sentBy}.`]
      .filter(Boolean)
      .join("\n\n"),
    // "light only": pide a los clientes de correo no invertir los colores en modo oscuro.
    html:
      `<!doctype html><html><head><meta charset="utf-8">` +
      `<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">` +
      `</head><body style="margin:0;background:#ffffff">${html}</body></html>`,
  };

  try {
    const signal = AbortSignal.timeout(MAIL_DEADLINE_MS);
    await (useGraph() ? sendWithGraph(message, signal) : sendWithSmtp(message, signal));
  } catch (sendError) {
    console.error("Fallo el envio del correo:", sendError);
    return res.status(502).json({ error: MAIL_ERROR });
  }

  return res.status(200).json({ enviado: true, para: to, cc });
}
