// POST /api/enviar-mes: envia por correo la tabla del mes a los destinatarios de
// Configuracion > Correo del mes.
//
// Autenticacion: la sesion de la app (cookie de /api/auth).
// Cuerpo: { "month": 0-11 (por defecto el mes actual), "image": "data:image/png;base64,..." (opcional) }
// Con "image" (la foto del calendario que toma la app) el correo lleva esa imagen incrustada;
// sin ella, una tabla HTML con el mismo diseno.
//
// Variables de entorno en Vercel (solo servidor, sin prefijo VITE_):
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
import { MONTH_NAMES, buildLegendHtml, buildMonthEmail, buildMonthWeeks } from "../src/monthEmail.js";

const YEAR = 2026;
const IMAGE_CID = "calendario@guardias-cesa";
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

function useGraph() {
  return Boolean(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET);
}

// Envia con Microsoft Graph como el buzon `from` (flujo client credentials de la app de Azure).
async function sendWithGraph({ from, to, cc, replyTo, subject, html, inlineImage }) {
  const tokenResponse = await fetch(
    `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
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
    headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: recipients(to),
        ccRecipients: recipients(cc),
        replyTo: replyTo ? recipients([replyTo]) : [],
        attachments: inlineImage
          ? [
              {
                "@odata.type": "#microsoft.graph.fileAttachment",
                name: "calendario.png",
                contentType: "image/png",
                contentBytes: inlineImage.toString("base64"),
                contentId: IMAGE_CID,
                isInline: true,
              },
            ]
          : [],
      },
      saveToSentItems: true,
    }),
  });
  if (!sendResponse.ok) {
    const detail = await sendResponse.json().catch(() => ({}));
    throw new Error(detail.error?.message ?? `sendMail ${sendResponse.status}`);
  }
}

async function sendWithSmtp({ from, to, cc, replyTo, subject, html, text, inlineImage }) {
  const port = Number(process.env.SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.office365.com",
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: { name: "Guardias CESA", address: from },
    to,
    cc,
    replyTo,
    subject,
    text,
    html,
    attachments: inlineImage ? [{ filename: "calendario.png", content: inlineImage, cid: IMAGE_CID }] : [],
  });
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
  const sessionUser = requireUser(req, res);
  if (!sessionUser) {
    return undefined;
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

  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  if (!from || (!useGraph() && !process.env.SMTP_PASS)) {
    return res
      .status(500)
      .json({ error: "Falta configurar el envio de correo en Vercel (MAIL_FROM y Graph, o SMTP_USER y SMTP_PASS)" });
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
    year: YEAR,
    monthIndex,
    guards,
    shifts,
    officeDays: Array.isArray(officeDays) ? officeDays : DEFAULT_OFFICE_DAYS,
    msCloseDay: Number.isInteger(msCloseDay) ? msCloseDay : DEFAULT_MS_CLOSE_DAY,
    assignments: Object.fromEntries(
      calendar.assignments.map((row) => [`${row.day_key}|${row.guard_id}`, row.shift_id])
    ),
    holidays: Object.fromEntries(calendar.holidays.map((row) => [row.day_key, row.name ?? ""])),
    vacations: Object.fromEntries(calendar.vacations.map((row) => [`${row.day_key}|${row.guard_id}`, true])),
    auditAssignments: Object.fromEntries(calendar.auditAssignments.map((row) => [row.week_key, row.guard_id])),
    auditRotations: calendar.auditRotations.map(rotationFromRow),
  });

  const sender = guards.find(
    (guard) => (guard.email ?? "").trim().toLowerCase() === sessionUser.email?.toLowerCase()
  );
  const title = renderSubject(mailSettings, MONTH_NAMES[monthIndex], YEAR);
  const intro = mailSettings.message.trim()
    ? `<p style="font-family:Arial,sans-serif;font-size:14px;color:#16212e;margin:0 0 12px">` +
      `${escapeHtml(mailSettings.message.trim()).replace(/\n/g, "<br>")}</p>`
    : "";
  const email = buildMonthEmail({ title, intro, monthLabel: `${MONTH_NAMES[monthIndex]} ${YEAR}`, weeks, shifts });
  const { text } = email;
  // Con la foto del calendario, el correo es esa imagen (igual a la app) mas la simbologia.
  const html = inlineImage
    ? `<div style="background:#ffffff;padding:12px;max-width:760px">` +
      `<p style="font-family:Arial,sans-serif;font-size:16px;font-weight:bold;color:#16212e;margin:0 0 10px">${escapeHtml(title)}</p>` +
      intro +
      `<img src="cid:${IMAGE_CID}" alt="${escapeHtml(title)}" width="720" style="display:block;width:100%;max-width:720px;height:auto">` +
      `${buildLegendHtml()}</div>`
    : email.html;
  const sentBy = sender?.name ?? sessionUser.email;

  const message = {
    inlineImage,
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
      `</head><body style="margin:0;background:#ffffff">${html}` +
      `<p style="font-family:Arial,sans-serif;font-size:12px;color:#5c758a;padding:0 12px">Enviado por ${sentBy
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")}.</p></body></html>`,
  };

  try {
    await (useGraph() ? sendWithGraph(message) : sendWithSmtp(message));
  } catch (sendError) {
    console.error(sendError);
    return res.status(502).json({ error: `El servidor de correo rechazo el envio: ${sendError.message}` });
  }

  return res.status(200).json({ enviado: true, para: to, cc });
}
