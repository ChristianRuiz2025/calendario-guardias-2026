// Servidor local de /api para desarrollo (Vite le pasa /api por proxy, ver vite.config.js).
// Usa el mismo adaptador que la Lambda. Variables: .env.local (ver .env.example).
// Uso: npm run dev:api

import { createServer } from "node:http";
import { runHandler } from "../api/_lib/adapter.js";
import { resolveRoute } from "../api/_lib/routes.js";

const PORT = Number(process.env.API_PORT || 3001);
const MAX_BODY_BYTES = 6 * 1024 * 1024; // mismo limite que Lambda

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const handler = resolveRoute(url.pathname);
  if (!handler) {
    res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "No encontrado" }));
    return;
  }

  let rawBody;
  try {
    rawBody = await readBody(req);
  } catch {
    res.writeHead(413, { "content-type": "application/json" }).end(JSON.stringify({ error: "Cuerpo demasiado grande" }));
    return;
  }

  const out = await runHandler(handler, {
    method: req.method,
    headers: req.headers,
    query: Object.fromEntries(url.searchParams),
    rawBody,
  });
  if (out.cookies.length) {
    out.headers["set-cookie"] = out.cookies;
  }
  res.writeHead(out.statusCode, out.headers).end(out.body);
  console.log(`${req.method} ${url.pathname} -> ${out.statusCode}`);
}).listen(PORT, () => console.log(`API local en http://localhost:${PORT}/api`));
