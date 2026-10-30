// /api/auth: inicio y cierre de sesion contra la tabla app_users de MySQL.
//   GET                                         usuario de la sesion actual (401 si no hay)
//   POST { action: "login", email, password }   valida la contrasena (bcrypt) y crea la sesion
//   POST { action: "logout" }                   borra la sesion

import bcrypt from "bcryptjs";
import { clearSessionCookie, getSessionUser, setSessionCookie } from "./_lib/auth.js";
import { query } from "./_lib/db.js";

const DUMMY_HASH = "$2a$10$/aMgcd/2nbPNwhGw2uxEUuF1WKAB/nGizNwhSjmCZNeW6GrYrXdbe";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const user = getSessionUser(req);
    return user ? res.status(200).json({ user }) : res.status(401).json({ error: "Sin sesion" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  if (!process.env.SESSION_SECRET) {
    return res.status(500).json({ error: "Falta configurar SESSION_SECRET en Vercel" });
  }

  const action = req.body?.action;
  if (action === "logout") {
    clearSessionCookie(req, res);
    return res.status(200).json({ ok: true });
  }
  if (action !== "login") {
    return res.status(400).json({ error: "Accion no valida" });
  }

  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!email || !password) {
    return res.status(400).json({ error: "Escribe tu correo y contrasena." });
  }

  try {
    const [row] = await query("SELECT id, email, password_hash FROM app_users WHERE LOWER(email) = ? LIMIT 1", [email]);
    // Se compara aunque no exista el usuario (contra un hash de una contrasena aleatoria),
    // para no revelar que correos existen por el tiempo de respuesta.
    const valid = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
    if (!row || !valid) {
      return res.status(401).json({ error: "Correo o contrasena incorrectos." });
    }
    const user = { id: row.id, email: row.email };
    setSessionCookie(req, res, user);
    return res.status(200).json({ user });
  } catch (dbError) {
    console.error(dbError);
    return res.status(500).json({ error: "No se pudo conectar a la base de datos." });
  }
}
