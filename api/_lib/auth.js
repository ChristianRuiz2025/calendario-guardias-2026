// Sesiones de la app: cookie "guardias_session" HttpOnly con un token firmado (HMAC-SHA256)
// que lleva el id del usuario. Variable de entorno: SESSION_SECRET (larga y aleatoria).
//
// En cada peticion se comprueba en app_users que el usuario siga existiendo y que su contrasena
// no haya cambiado (el token lleva una huella de password_hash). Asi, borrar un usuario o cambiarle
// la contrasena cierra sus sesiones de inmediato; cambiar SESSION_SECRET las cierra todas.

import { createHmac, timingSafeEqual } from "node:crypto";
import { query } from "./db.js";

const COOKIE_NAME = "guardias_session";
const SESSION_DAYS = 30;

function sign(payload) {
  return createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url");
}

// Huella de la contrasena: cambia si cambia password_hash, pero no permite recuperarlo.
function passwordVersion(passwordHash) {
  return sign(`pv:${passwordHash}`).slice(0, 22);
}

// user: { id, passwordHash } (passwordHash es app_users.password_hash).
export function createSessionToken(user) {
  const payload = Buffer.from(
    JSON.stringify({
      id: user.id,
      pv: passwordVersion(user.passwordHash),
      exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
    })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifySessionToken(token) {
  const [payload, signature] = String(token ?? "").split(".");
  if (!payload || !signature || !process.env.SESSION_SECRET) {
    return null;
  }
  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.exp > Date.now() ? { id: data.id, pv: data.pv } : null;
  } catch {
    return null;
  }
}

function readCookie(req, name) {
  const cookies = String(req.headers.cookie ?? "").split(";");
  for (const cookie of cookies) {
    const [key, ...rest] = cookie.trim().split("=");
    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

// El usuario de la sesion ({ id, email }), o null si no hay sesion valida o el usuario ya no
// existe o cambio de contrasena. Lanza error si no se puede consultar la base de datos.
export async function getSessionUser(req) {
  const session = verifySessionToken(readCookie(req, COOKIE_NAME));
  if (!session) {
    return null;
  }
  const [row] = await query("SELECT id, email, password_hash FROM app_users WHERE id = ? LIMIT 1", [session.id]);
  if (!row || session.pv !== passwordVersion(row.password_hash)) {
    return null;
  }
  return { id: row.id, email: row.email };
}

function cookieAttributes(req, maxAgeSeconds) {
  // "Secure" solo con https (en AWS siempre, via CloudFront y API Gateway); asi tambien funciona en pruebas locales.
  const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  return `; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function setSessionCookie(req, res, user) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(createSessionToken(user))}${cookieAttributes(req, SESSION_DAYS * 24 * 60 * 60)}`
  );
}

export function clearSessionCookie(req, res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${cookieAttributes(req, 0)}`);
}

// Para las funciones que requieren sesion: responde 401 (o 500 si falla la base de datos) y
// devuelve null si no hay sesion valida.
export async function requireUser(req, res) {
  let user;
  try {
    user = await getSessionUser(req);
  } catch (dbError) {
    console.error(dbError);
    res.status(500).json({ error: "No se pudo conectar a la base de datos." });
    return null;
  }
  if (!user) {
    res.status(401).json({ error: "Tu sesion expiro. Vuelve a iniciar sesion." });
    return null;
  }
  return user;
}
