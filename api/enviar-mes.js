// POST /api/enviar-mes: envia por correo la tabla del mes a los destinatarios de
// Configuracion > Correo del mes.
//
// Autenticacion: header "Authorization: Bearer <token de sesion de Supabase>" (lo manda la app).
// Cuerpo: { "month": 0-11 (por defecto el mes actual), "image": "data:image/png;base64,..." (opcional) }
// Con "image" (la foto del calendario que toma la app) el correo lleva esa imagen incrustada;
// sin ella, una tabla HTML con el mismo diseno.
//
// Variables de entorno en Vercel (solo servidor, sin prefijo VITE_):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   MAIL_FROM  buzon que envia (p. ej. soportecesa@compusoluciones.com)
// Envio con Microsoft Graph (recomendado para Microsoft 365; app de Azure con permiso Mail.Send):
//   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET
// O envio por SMTP, si no estan las de Graph:
//   SMTP_USER, SMTP_PASS  (MAIL_FROM por defecto es SMTP_USER)
//   SMTP_HOST, SMTP_PORT  opcionales; por defecto smtp.office365.com y 587

import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_AUDIT_ROTATIONS, rotationFromRow } from "../src/auditRotation.js";
import {
  DEFAULT_HOLIDAYS,
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

  const supabase = createClient(
    process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  // Solo alguien con sesion iniciada en la app puede enviar el correo.
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const { data: userData, error: userError } = token ? await supabase.auth.getUser(token) : { data: null };
  if (userError || !userData?.user) {
    return res.status(401).json({ error: "No autorizado" });
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

  const [guardsRes, assignmentsRes, auditRes, shiftsRes, holidaysRes, settingsRes, rotationsRes, vacationsRes] =
    await Promise.all([
      supabase.from("guards").select("*").order("created_at"),
      supabase.from("shift_assignments").select("*"),
      supabase.from("audit_assignments").select("*"),
      supabase.from("shift_templates").select("*"),
      supabase.from("holidays").select("*"),
      supabase.from("app_settings").select("*"),
      supabase.from("audit_rotations").select("*"),
      supabase.from("vacations").select("*"),
    ]);

  if (guardsRes.error || assignmentsRes.error || auditRes.error) {
    console.error(guardsRes.error ?? assignmentsRes.error ?? auditRes.error);
    return res.status(500).json({ error: "No se pudo leer el calendario" });
  }

  const guards = guardsRes.data;
  // Igual que en la app: si una tabla opcional no existe se usan los valores por defecto.
  const setting = (key) => settingsRes.data?.find((row) => row.key === key)?.value;
  // Por defecto lo reciben todas las personas del calendario con correo, mas los adicionales.
  const mailSettings = normalizeMailSettings(setting("mail_recipients"));
  const { to, cc } = resolveRecipients(mailSettings, guards);
  if (to.length === 0) {
    return res.status(400).json({ error: "No hay destinatarios. Revisa Configuracion > Correos" });
  }

  // Turnos ordenados por hora de entrada, igual que en la app.
  const shifts = (
    shiftsRes.data?.length
      ? shiftsRes.data.map((row) => ({ id: row.id, start: row.start_time, end: row.end_time }))
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
      assignmentsRes.data.map((row) => [`${row.day_key}|${row.guard_id}`, row.shift_id])
    ),
    holidays: holidaysRes.error
      ? DEFAULT_HOLIDAYS
      : Object.fromEntries(holidaysRes.data.map((row) => [row.day_key, row.name ?? ""])),
    vacations: Object.fromEntries((vacationsRes.data ?? []).map((row) => [`${row.day_key}|${row.guard_id}`, true])),
    auditAssignments: Object.fromEntries(auditRes.data.map((row) => [row.week_key, row.guard_id])),
    auditRotations: rotationsRes.error ? DEFAULT_AUDIT_ROTATIONS : rotationsRes.data.map(rotationFromRow),
  });

  const sender = guards.find(
    (guard) => (guard.email ?? "").trim().toLowerCase() === userData.user.email?.toLowerCase()
  );
  const title = renderSubject(mailSettings, MONTH_NAMES[monthIndex], YEAR);
  const intro = mailSettings.message.trim()
    ? `<p style="font-family:Arial,sans-serif;font-size:14px;color:#16212e;margin:0 0 12px">` +
      `${escapeHtml(mailSettings.message.trim()).replace(/\n/g, "<br>")}</p>`
    : "";
  const email = buildMonthEmail({ title, monthLabel: `${MONTH_NAMES[monthIndex]} ${YEAR}`, weeks, shifts });
  const { text } = email;
  // Con la foto del calendario, el correo es esa imagen (igual a la app) mas la simbologia.
  const html = inlineImage
    ? `<div style="background:#ffffff;padding:12px;max-width:760px">` +
      intro +
      `<p style="font-family:Arial,sans-serif;font-size:16px;font-weight:bold;color:#16212e;margin:0 0 10px">${escapeHtml(title)}</p>` +
      `<img src="cid:${IMAGE_CID}" alt="${escapeHtml(title)}" width="720" style="display:block;width:100%;max-width:720px;height:auto">` +
      `${buildLegendHtml()}</div>`
    : intro + email.html;
  const sentBy = sender?.name ?? userData.user.email;

  const message = {
    inlineImage,
    from,
    to,
    cc,
    replyTo: userData.user.email,
    subject: title,
    text: `${mailSettings.message.trim() ? `${mailSettings.message.trim()}\n\n` : ""}${text}\n\nEnviado por ${sentBy}.`,
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
