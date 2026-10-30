// Sesiones de la app: cookie "guardias_session" HttpOnly con un token firmado (HMAC-SHA256)
// que lleva el id y el correo del usuario. Variable de entorno: SESSION_SECRET (larga y aleatoria).

import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "guardias_session";
const SESSION_DAYS = 30;

function sign(payload) {
  return createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url");
}

export function createSessionToken(user) {
  const payload = Buffer.from(
    JSON.stringify({ id: user.id, email: user.email, exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000 })
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
    return data.exp > Date.now() ? { id: data.id, email: data.email } : null;
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

// El usuario de la sesion, o null si no hay sesion valida.
export function getSessionUser(req) {
  return verifySessionToken(readCookie(req, COOKIE_NAME));
}

function cookieAttributes(req, maxAgeSeconds) {
  // "Secure" solo con https (en Vercel siempre); asi tambien funciona en pruebas locales.
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

// Para las funciones que requieren sesion: responde 401 y devuelve null si no hay.
export function requireUser(req, res) {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Tu sesion expiro. Vuelve a iniciar sesion." });
    return null;
  }
  return user;
}
