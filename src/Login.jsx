import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import BrandLogo from "./BrandLogo";
import { apiRequest } from "./apiClient";

// onLogin(user): se llama cuando el servidor acepta el correo y la contrasena.
export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { user } = await apiRequest("/api/auth", { method: "POST", body: { action: "login", email, password } });
      onLogin(user);
    } catch (signInError) {
      setError(signInError.status === 401 ? "Correo o contraseña incorrectos." : signInError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <div className="login-split">
        {/* Panel de marca: logo, franja con los colores de la flecha y para que sirve la app. */}
        <section className="login-panel" aria-label="siclik CESA">
          <BrandLogo className="login-logo" />
          <div className="login-panel-copy">
            <span className="login-stripe" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <h1>Calendario de guardias</h1>
            <p>Turnos, vacaciones, comidas y auditorias del equipo.</p>
          </div>
          <p className="login-panel-foot">Mesa de ayuda CESA</p>
        </section>

        <form className="login-card" onSubmit={handleSubmit}>
          <h2>Inicia sesión</h2>

          <label htmlFor="login-email">Correo</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label htmlFor="login-password">Contraseña</label>
          <div className="login-password">
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              type="button"
              className="login-eye"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              aria-pressed={showPassword}
              title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error ? <p className="login-error">{error}</p> : null}

          <button type="submit" disabled={submitting}>
            {submitting ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </main>
  );
}
