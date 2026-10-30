// Configuracion del correo del mes (app_settings, llave "mail_recipients").
// La usan la app (Configuracion > Correos) y la API (api/enviar-mes.js).
//
// {
//   excludedGuards: ["guardId"],                 personas del calendario que NO reciben el correo
//   extra: [{ email: "jefe@x.com", type: "to" }], destinatarios adicionales ("to" = Para, "cc" = CC)
//   subject: "Guardias {mes} {anio}",
//   message: "Texto opcional arriba del calendario",
// }
// Por defecto lo reciben todas las personas del calendario que tienen correo.

export const DEFAULT_SUBJECT = "Guardias {mes} {anio}";

export const DEFAULT_MAIL_SETTINGS = { excludedGuards: [], extra: [], subject: DEFAULT_SUBJECT, message: "" };

const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export function isValidEmail(value) {
  return EMAIL_PATTERN.test(String(value ?? "").trim());
}

function splitAddresses(value) {
  return String(value ?? "")
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

// Acepta el formato anterior ({ to: "a@x.com, b@x.com", cc: "" }) y lo convierte.
export function normalizeMailSettings(value) {
  if (!value || typeof value !== "object") {
    return DEFAULT_MAIL_SETTINGS;
  }

  const legacyExtra = [
    ...splitAddresses(value.to).map((email) => ({ email, type: "to" })),
    ...splitAddresses(value.cc).map((email) => ({ email, type: "cc" })),
  ];
  const extra = (Array.isArray(value.extra) ? value.extra : legacyExtra)
    .filter((item) => isValidEmail(item?.email))
    .map((item) => ({ email: item.email.trim(), type: item.type === "cc" ? "cc" : "to" }));

  return {
    excludedGuards: Array.isArray(value.excludedGuards) ? value.excludedGuards : [],
    extra,
    subject: typeof value.subject === "string" && value.subject.trim() ? value.subject : DEFAULT_SUBJECT,
    message: typeof value.message === "string" ? value.message : "",
  };
}

// Personas del calendario con correo valido que reciben el correo.
export function includedGuards(settings, guards) {
  return guards.filter((guard) => isValidEmail(guard.email) && !settings.excludedGuards.includes(guard.id));
}

// { to: [...], cc: [...] } sin repetidos (sin importar mayusculas). Si un correo esta en Para y CC, queda en Para.
export function resolveRecipients(settings, guards) {
  const seen = new Set();
  const add = (list, email) => {
    const key = email.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      list.push(email.trim());
    }
  };

  const to = [];
  const cc = [];
  includedGuards(settings, guards).forEach((guard) => add(to, guard.email));
  settings.extra.filter((item) => item.type === "to").forEach((item) => add(to, item.email));
  settings.extra.filter((item) => item.type === "cc").forEach((item) => add(cc, item.email));
  return { to, cc };
}

// "Guardias {mes} {anio}" -> "Guardias Noviembre 2026"
export function renderSubject(settings, monthName, year) {
  return (settings.subject || DEFAULT_SUBJECT).replace(/\{mes\}/gi, monthName).replace(/\{a(ni|ñ)o\}/gi, String(year));
}
