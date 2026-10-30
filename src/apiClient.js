// Llamadas del navegador al backend (/api). La sesion viaja en una cookie HttpOnly.

export const SESSION_EXPIRED_EVENT = "guardias:session-expired";

export async function apiRequest(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));

  if (response.status === 401 && path !== "/api/auth") {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
  if (!response.ok) {
    const error = new Error(result.error ?? `Error ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return result;
}
