// POST /api/invgate-sync: pone en el grupo de InvGate que recibe solicitudes solo a quien
// esta en turno segun el calendario, y saca a quien esta fuera de horario, de vacaciones,
// en feriado o en fin de semana. Ver src/invgateAvailability.js para las reglas.
//
// Quien la llama:
// - La tarea programada (cada 15 minutos): header "x-cron-secret: <CRON_SECRET>".
// - La app (Configuracion > InvGate): header "Authorization: Bearer <token de sesion de Supabase>".
//
// Cuerpo (opcional):
//   { "action": "groups" }                 lista los grupos de InvGate para elegir uno
//   { "action": "run", "simulate": true }  calcula sin cambiar nada en InvGate
//   { "action": "run" }                    aplica (si la configuracion no esta en "solo simular")
//
// Configuracion en app_settings, llave "invgate": { enabled, dryRun, groupId }.
// Variables de entorno en Vercel (solo servidor):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET
//   INVGATE_URL       p. ej. https://cesa.cloud.invgate.net
//   INVGATE_USER, INVGATE_PASSWORD  usuario de la API de InvGate (Configuracion > Integraciones > API)

import { createClient } from "@supabase/supabase-js";
import { DEFAULT_HOLIDAYS, DEFAULT_SHIFTS } from "../src/calendarDefaults.js";
import { computeAvailability, mexicoNow } from "../src/invgateAvailability.js";

function sameEmail(a, b) {
  return Boolean(a) && Boolean(b) && a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Llama a la API v1 de InvGate. Los parametros van en la URL; los arreglos como "users[]".
async function invgate(method, path, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(`${key}[]`, String(item)));
    } else if (value !== undefined && value !== null) {
      query.append(key, String(value));
    }
  });

  const base = process.env.INVGATE_URL.replace(/\/+$/, "");
  const credentials = Buffer.from(`${process.env.INVGATE_USER}:${process.env.INVGATE_PASSWORD}`).toString("base64");
  const response = await fetch(`${base}/api/v1${path}?${query}`, {
    method,
    headers: { Authorization: `Basic ${credentials}`, Accept: "application/json" },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`InvGate ${method} ${path} respondio ${response.status}: ${body.slice(0, 200)}`);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`InvGate ${method} ${path} no respondio JSON: ${body.slice(0, 200)}`);
  }
}

// InvGate a veces responde un objeto en lugar de un arreglo.
function asList(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return value && typeof value === "object" ? Object.values(value) : [];
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

  const fromCron = Boolean(process.env.CRON_SECRET) && req.headers["x-cron-secret"] === process.env.CRON_SECRET;
  if (!fromCron) {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const { data, error } = token ? await supabase.auth.getUser(token) : { data: null };
    if (error || !data?.user) {
      return res.status(401).json({ error: "No autorizado" });
    }
  }

  if (!process.env.INVGATE_URL || !process.env.INVGATE_USER || !process.env.INVGATE_PASSWORD) {
    return res.status(500).json({ error: "Falta configurar INVGATE_URL, INVGATE_USER e INVGATE_PASSWORD en Vercel" });
  }

  const action = req.body?.action ?? "run";

  if (action === "groups") {
    try {
      const groups = asList(await invgate("GET", "/groups"));
      return res.status(200).json({ groups: groups.map((group) => ({ id: group.id, name: group.name, total: group.total })) });
    } catch (invgateError) {
      console.error(invgateError);
      return res.status(502).json({ error: invgateError.message });
    }
  }

  const now = mexicoNow();
  const [settingsRes, guardsRes, assignmentsRes, shiftsRes, holidaysRes, vacationsRes] = await Promise.all([
    supabase.from("app_settings").select("*").eq("key", "invgate"),
    supabase.from("guards").select("*").order("created_at"),
    supabase.from("shift_assignments").select("*").eq("day_key", now.dayKey),
    supabase.from("shift_templates").select("*"),
    supabase.from("holidays").select("*"),
    supabase.from("vacations").select("*").eq("day_key", now.dayKey),
  ]);

  if (guardsRes.error || assignmentsRes.error) {
    console.error(guardsRes.error ?? assignmentsRes.error);
    return res.status(500).json({ error: "No se pudo leer el calendario" });
  }

  const settings = settingsRes.data?.[0]?.value ?? {};
  if (fromCron && !settings.enabled) {
    return res.status(200).json({ omitido: "La sincronizacion con InvGate esta desactivada" });
  }
  if (!settings.groupId) {
    return res.status(400).json({ error: "Elige el grupo de InvGate en Configuracion > InvGate" });
  }
  const simulate = Boolean(req.body?.simulate) || settings.dryRun !== false;

  const availability = computeAvailability({
    guards: guardsRes.data,
    shifts: shiftsRes.data?.length
      ? shiftsRes.data.map((row) => ({ id: row.id, start: row.start_time, end: row.end_time }))
      : DEFAULT_SHIFTS,
    assignments: Object.fromEntries(assignmentsRes.data.map((row) => [`${row.day_key}|${row.guard_id}`, row.shift_id])),
    holidays: holidaysRes.error
      ? DEFAULT_HOLIDAYS
      : Object.fromEntries(holidaysRes.data.map((row) => [row.day_key, row.name ?? ""])),
    vacations: Object.fromEntries((vacationsRes.data ?? []).map((row) => [`${row.day_key}|${row.guard_id}`, true])),
    now,
  });

  let items;
  try {
    const members = asList(await invgate("GET", "/groups.users", { id: settings.groupId }));
    items = [];
    for (const { guard, available, reason } of availability) {
      const item = { name: guard.name, email: guard.email ?? null, available, reason, invgateUserId: null, action: "none" };
      items.push(item);
      if (!guard.email) {
        item.action = "skip";
        item.reason = `${reason}. Sin correo en el calendario, no se puede buscar en InvGate`;
        continue;
      }

      const member = members.find((user) => sameEmail(user.email, guard.email));
      let userId = member?.id ?? null;
      if (!userId) {
        const found = await invgate("GET", "/user.by", { email: guard.email }).catch(() => null);
        userId = found?.id ?? null;
      }
      item.invgateUserId = userId;
      item.inGroup = Boolean(member);
      if (!userId) {
        item.action = "skip";
        item.reason = `${reason}. No se encontro en InvGate con ese correo`;
        continue;
      }
      if (available && !member) {
        item.action = "add";
      } else if (!available && member) {
        item.action = "remove";
      }
    }

    const toAdd = items.filter((item) => item.action === "add").map((item) => item.invgateUserId);
    const toRemove = items.filter((item) => item.action === "remove").map((item) => item.invgateUserId);
    if (!simulate) {
      if (toAdd.length > 0) {
        await invgate("POST", "/groups.users", { id: settings.groupId, users: toAdd });
      }
      if (toRemove.length > 0) {
        await invgate("DELETE", "/groups.users", { id: settings.groupId, users: toRemove });
      }
    }
  } catch (invgateError) {
    console.error(invgateError);
    await supabase
      .from("app_settings")
      .upsert({ key: "invgate_last_run", value: { at: new Date().toISOString(), simulate, error: invgateError.message } });
    return res.status(502).json({ error: invgateError.message });
  }

  const result = { at: new Date().toISOString(), now, simulate, items };
  await supabase.from("app_settings").upsert({ key: "invgate_last_run", value: result });
  return res.status(200).json(result);
}
