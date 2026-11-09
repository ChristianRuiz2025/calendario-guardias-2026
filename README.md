# Calendario de Guardias 2026

SPA en React 19 + Vite 7 con una API en Node (`api/`) sobre MySQL.

## Cómo funciona

**Frontend (`src/`)**: una sola página, sin router. `main.jsx` contiene la UI. Toda la comunicación pasa por `apiClient.js` (fetch same-origin a `/api/*`) y la sesión viaja en la cookie HttpOnly `guardias_session`. `useCalendarData.js` carga todo con `GET /api/calendar` y guarda cada cambio con `POST /api/calendar { op, ... }`. "Enviar por correo" toma una imagen del calendario (`html-to-image`) y la manda a `/api/enviar-mes`. El ICS se genera en el navegador.

**API (`api/`)**: handlers con la firma `handler(req, res)` (estilo Vercel). En AWS y en local los ejecuta el adaptador `api/_lib/adapter.js`, y el router está en `api/_lib/routes.js`.

| Ruta | Autenticación | Qué hace |
|---|---|---|
| `GET/POST /api/auth` | — | Sesión actual, login (bcrypt contra `app_users`) y logout. La cookie va firmada con HMAC y dura 30 días. |
| `GET/POST /api/calendar` | cookie | Lee todo el calendario o aplica una operación en transacción (lista blanca `OPERATIONS`). |
| `POST /api/enviar-mes` | cookie | Envía el mes por correo con Microsoft Graph o SMTP. |
| `GET /api/auditorias` | `Authorization: Bearer <AUDITORIAS_API_KEY>` | Orden de auditorías por semana, para servicios externos. |

**BD**: MySQL 5.7+ (o MariaDB 10.5+). Las tablas están en `mysql/01b_crear_tablas_mysql_sin_llaves_foraneas.sql` y los scripts de migración desde Supabase en `mysql/02_*` y `04_*`. Para dar de alta un usuario: `npm run crear-usuario -- correo "contraseña"`.

**Variables de entorno** (solo del servidor): ver `.env.example`.

## Desarrollo local

Requisitos: Node 22 y Docker.

```bash
cp .env.local.example .env.local
npm install
npm run dev:db     # MySQL 5.7 en el puerto 3307, con tablas y datos de prueba (docker/seed.sql)
npm run dev:api    # API en http://localhost:3001
npm run dev        # Vite en http://localhost:5173 (pasa /api a la API local)
```

El usuario de prueba está en `docker/seed.sql`. Para reiniciar la BD: `docker compose down -v && npm run dev:db`.
