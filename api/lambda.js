// Handler de AWS Lambda para API Gateway HTTP API (payload 2.0), ruta ANY /api/{proxy+}.
// Variables de la Lambda:
//   APP_SECRET_ARN  secreto con las variables de la app (ver .env.example)
//   ORIGIN_VERIFY   valor del header x-origin-verify que agrega CloudFront; las peticiones sin
//                   el (p. ej. directo a la URL execute-api) se rechazan con 403.

import { timingSafeEqual } from "node:crypto";
import { runHandler } from "./_lib/adapter.js";
import { resolveRoute } from "./_lib/routes.js";
import { loadSecrets } from "./_lib/secrets.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function reply(statusCode, error) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify({ error }) };
}

function fromCloudFront(headers) {
  const expected = Buffer.from(process.env.ORIGIN_VERIFY ?? "");
  const received = Buffer.from(String(headers["x-origin-verify"] ?? ""));
  return expected.length > 0 && expected.length === received.length && timingSafeEqual(expected, received);
}

export async function handler(event) {
  const headers = { ...(event.headers ?? {}) };
  if (!fromCloudFront(headers)) {
    return reply(403, "Prohibido");
  }
  delete headers["x-origin-verify"];

  const route = resolveRoute(event.rawPath);
  if (!route) {
    return reply(404, "No encontrado");
  }

  try {
    await loadSecrets();
  } catch (error) {
    console.error("No se pudo leer el secreto", error);
    return reply(500, "Error de configuracion del servidor");
  }

  // API Gateway separa las cookies del resto de los headers.
  if (Array.isArray(event.cookies) && event.cookies.length) {
    headers.cookie = event.cookies.join("; ");
  }
  const rawBody = event.body
    ? event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body
    : "";

  const out = await runHandler(route, {
    method: event.requestContext?.http?.method ?? "GET",
    headers,
    query: event.queryStringParameters ?? {},
    rawBody,
  });
  return { statusCode: out.statusCode, headers: out.headers, cookies: out.cookies, body: out.body };
}
