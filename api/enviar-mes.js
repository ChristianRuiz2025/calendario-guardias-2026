// POST /api/enviar-mes: envia por correo la tabla del mes a los destinatarios de
// Configuracion > Correo del mes.
//
// Autenticacion: header "Authorization: Bearer <token de sesion de Supabase>" (lo manda la app).
// Cuerpo: { "month": 0-11 } (por defecto el mes actual)
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
import { DEFAULT_HOLIDAYS, DEFAULT_SHIFTS } from "../src/calendarDefaults.js";
import { MONTH_NAMES, buildMonthEmail, buildMonthWeeks } from "../src/monthEmail.js";

const YEAR = 2026;

function useGraph() {
  return Boolean(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET);
}

// Envia con Microsoft Graph como el buzon `from` (flujo client credentials de la app de Azure).
async function sendWithGraph({ from, to, cc, replyTo, subject, html }) {
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
      },
      saveToSentItems: true,
    }),
  });
  if (!sendResponse.ok) {
    const detail = await sendResponse.json().catch(() => ({}));
    throw new Error(detail.error?.message ?? `sendMail ${sendResponse.status}`);
  }
}

async function sendWithSmtp({ from, to, cc, replyTo, subject, html, text }) {
  const port = Number(process.env.SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.office365.com",
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({ from: { name: "Guardias CESA", address: from }, to, cc, replyTo, subject, text, html });
}

function splitAddresses(value) {
  return String(value ?? "")
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
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

  // Igual que en la app: si una tabla opcional no existe se usan los valores por defecto.
  const recipients = settingsRes.data?.find((row) => row.key === "mail_recipients")?.value ?? {};
  const to = splitAddresses(recipients.to);
  const cc = splitAddresses(recipients.cc);
  if (to.length === 0) {
    return res.status(400).json({ error: "Agrega al menos un destinatario en Configuracion > Correo del mes" });
  }

  const guards = guardsRes.data;
  const weeks = buildMonthWeeks({
    year: YEAR,
    monthIndex,
    guards,
    shifts: shiftsRes.data?.length
      ? shiftsRes.data.map((row) => ({ id: row.id, start: row.start_time, end: row.end_time }))
      : DEFAULT_SHIFTS,
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
  const title = `Guardias ${MONTH_NAMES[monthIndex]} ${YEAR}`;
  const { html, text } = buildMonthEmail({ title, weeks });
  const sentBy = sender?.name ?? userData.user.email;

  const message = {
    from,
    to,
    cc,
    replyTo: userData.user.email,
    subject: title,
    text: `${text}\n\nEnviado por ${sentBy}.`,
    html: `${html}<p style="font-family:Arial,sans-serif;font-size:12px;color:#5c758a">Enviado por ${sentBy
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")}.</p>`,
  };

  try {
    await (useGraph() ? sendWithGraph(message) : sendWithSmtp(message));
  } catch (sendError) {
    console.error(sendError);
    return res.status(502).json({ error: `El servidor de correo rechazo el envio: ${sendError.message}` });
  }

  return res.status(200).json({ enviado: true, para: to, cc });
}
