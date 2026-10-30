import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  DEFAULT_SUBJECT,
  includedGuards,
  isValidEmail,
  renderSubject,
  resolveRecipients,
} from "./mailSettings";

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export default function MailSettings({ guards, settings, onUpdate }) {
  const [newEmail, setNewEmail] = useState("");
  const [newType, setNewType] = useState("to");
  const [formError, setFormError] = useState("");

  const included = includedGuards(settings, guards);
  const { to, cc } = resolveRecipients(settings, guards);
  const today = new Date();
  const subjectPreview = renderSubject(settings, MONTH_NAMES[today.getMonth()], today.getFullYear());

  function toggleGuard(guardId) {
    const excluded = settings.excludedGuards.includes(guardId)
      ? settings.excludedGuards.filter((id) => id !== guardId)
      : [...settings.excludedGuards, guardId];
    onUpdate({ excludedGuards: excluded });
  }

  function addExtra(event) {
    event.preventDefault();
    const email = newEmail.trim();
    if (!isValidEmail(email)) {
      setFormError("Escribe un correo valido.");
      return;
    }
    const known = [...guards.map((guard) => guard.email ?? ""), ...settings.extra.map((item) => item.email)];
    if (known.some((item) => item.trim().toLowerCase() === email.toLowerCase())) {
      setFormError("Ese correo ya esta en la lista.");
      return;
    }
    onUpdate({ extra: [...settings.extra, { email, type: newType }] });
    setNewEmail("");
    setFormError("");
  }

  function updateExtra(index, changes) {
    onUpdate({ extra: settings.extra.map((item, itemIndex) => (itemIndex === index ? { ...item, ...changes } : item)) });
  }

  return (
    <div className="mail-settings">
      <div className="mail-block">
        <h3>Personas del calendario</h3>
        <p className="settings-hint">Reciben el correo por defecto. Quita la palomita para excluir a alguien.</p>
        <ul className="mail-list">
          {guards.map((guard) => {
            const hasEmail = isValidEmail(guard.email);
            return (
              <li key={guard.id}>
                <label className={["mail-guard", hasEmail ? "" : "disabled"].join(" ")}>
                  <input
                    type="checkbox"
                    checked={hasEmail && !settings.excludedGuards.includes(guard.id)}
                    disabled={!hasEmail}
                    onChange={() => toggleGuard(guard.id)}
                  />
                  <span className="mail-swatch" style={{ backgroundColor: guard.color }} aria-hidden="true" />
                  <span className="mail-name">{guard.name}</span>
                  <span className="mail-address">{hasEmail ? guard.email : "Sin correo (agregalo en Guardias)"}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mail-block">
        <h3>Destinatarios adicionales</h3>
        <p className="settings-hint">Por ejemplo, tu jefe. Elige si va en Para o en copia (CC).</p>
        <form className="mail-add" onSubmit={addExtra}>
          <input
            type="email"
            value={newEmail}
            onChange={(event) => {
              setNewEmail(event.target.value);
              setFormError("");
            }}
            placeholder="correo@compusoluciones.com"
            aria-label="Correo adicional"
          />
          <select value={newType} onChange={(event) => setNewType(event.target.value)} aria-label="Tipo de destinatario">
            <option value="to">Para</option>
            <option value="cc">CC</option>
          </select>
          <button type="submit" className="icon-button" aria-label="Agregar destinatario" title="Agregar destinatario">
            <Plus size={18} />
          </button>
        </form>
        {formError ? <p className="form-error">{formError}</p> : null}
        {settings.extra.length > 0 ? (
          <ul className="mail-list">
            {settings.extra.map((item, index) => (
              <li key={item.email} className="mail-extra">
                <span className="mail-address">{item.email}</span>
                <div className="mail-type" role="group" aria-label={`Tipo de ${item.email}`}>
                  {[
                    ["to", "Para"],
                    ["cc", "CC"],
                  ].map(([type, label]) => (
                    <button
                      key={type}
                      type="button"
                      className={item.type === type ? "active" : ""}
                      aria-pressed={item.type === type}
                      onClick={() => updateExtra(index, { type })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="icon-button danger"
                  onClick={() => onUpdate({ extra: settings.extra.filter((_, itemIndex) => itemIndex !== index) })}
                  aria-label={`Quitar ${item.email}`}
                  title="Quitar"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mail-block">
        <h3>Contenido</h3>
        <label className="mail-field">
          Asunto
          <input
            value={settings.subject}
            onChange={(event) => onUpdate({ subject: event.target.value })}
            onBlur={(event) => {
              if (!event.target.value.trim()) {
                onUpdate({ subject: DEFAULT_SUBJECT });
              }
            }}
          />
        </label>
        <p className="settings-hint">
          {"{mes}"} y {"{anio}"} se cambian por el mes enviado. Ejemplo: <strong>{subjectPreview}</strong>
        </p>
        <label className="mail-field">
          Mensaje (opcional)
          <textarea
            rows={3}
            value={settings.message}
            onChange={(event) => onUpdate({ message: event.target.value })}
            placeholder="Hola, comparto como quedan las guardias del mes."
          />
        </label>
      </div>

      <div className={["mail-summary", to.length === 0 ? "empty" : ""].join(" ")}>
        {to.length === 0 ? (
          "No hay destinatarios: liga correos en Guardias o agrega uno adicional."
        ) : (
          <>
            <span>
              <strong>Para ({to.length}):</strong> {to.join(", ")}
            </span>
            {cc.length > 0 ? (
              <span>
                <strong>CC ({cc.length}):</strong> {cc.join(", ")}
              </span>
            ) : null}
            <span className="settings-hint">
              {included.length} de {guards.length} personas del calendario incluidas.
            </span>
          </>
        )}
      </div>
    </div>
  );
}
