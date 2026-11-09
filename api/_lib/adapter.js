// Ejecuta un handler de /api (firma estilo Vercel: handler(req, res)) a partir de una peticion
// "normalizada". Lo usan la Lambda (api/lambda.js) y el servidor local (scripts/dev-api.mjs),
// para que en local corra exactamente el mismo codigo que en AWS.
//
// Entrada: { method, headers (llaves en minusculas), query (objeto), rawBody (texto o "") }
// Salida:  { statusCode, headers, cookies: [Set-Cookie...], body (texto) }

function parseBody(rawBody, contentType) {
  if (!rawBody) {
    return undefined;
  }
  if (String(contentType ?? "").includes("application/json")) {
    return JSON.parse(rawBody);
  }
  return rawBody;
}

export async function runHandler(handler, { method, headers, query, rawBody }) {
  const out = { statusCode: 200, headers: {}, cookies: [], body: "" };

  const res = {
    status(code) {
      out.statusCode = code;
      return res;
    },
    setHeader(name, value) {
      const key = String(name).toLowerCase();
      if (key === "set-cookie") {
        out.cookies.push(...[].concat(value).map(String));
      } else {
        out.headers[key] = String(value);
      }
      return res;
    },
    getHeader(name) {
      return out.headers[String(name).toLowerCase()];
    },
    json(data) {
      out.headers["content-type"] ??= "application/json; charset=utf-8";
      out.body = JSON.stringify(data);
      return res;
    },
    send(data) {
      if (data !== null && typeof data === "object" && !Buffer.isBuffer(data)) {
        return res.json(data);
      }
      out.body = data === undefined ? "" : String(data);
      return res;
    },
    end(data) {
      if (data !== undefined) {
        out.body = String(data);
      }
      return res;
    },
  };

  let body;
  try {
    body = parseBody(rawBody, headers["content-type"]);
  } catch {
    res.status(400).json({ error: "El cuerpo no es JSON valido" });
    return out;
  }

  const req = { method, headers, query: query ?? {}, body };

  try {
    await handler(req, res);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno" });
  }
  return out;
}
