import React, { useState } from "react";
import { CalendarDays } from "lucide-react";
import { apiRequest } from "./apiClient";

// onLogin(user): se llama cuando el servidor acepta el correo y la contrasena.
export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { user } = await apiRequest("/api/auth", { method: "POST", body: { action: "login", email, password } });
      onLogin(user);
    } catch (signInError) {
      setError(signInError.status === 401 ? "Correo o contrasena incorrectos." : signInError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="brand">
          <CalendarDays aria-hidden="true" />
          <div>
            <h1>Guardias 2026</h1>
            <p>Inicia sesion para continuar</p>
          </div>
        </div>

        <label htmlFor="login-email">Correo</label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <label htmlFor="login-password">Contrasena</label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        {error ? <p className="login-error">{error}</p> : null}

        <button type="submit" disabled={submitting}>
          {submitting ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </main>
  );
}
