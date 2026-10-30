import React, { useState } from "react";
import { RefreshCw } from "lucide-react";

const ACTION_LABELS = {
  add: "Entra al grupo",
  remove: "Sale del grupo",
  none: "Sin cambio",
  skip: "Omitido",
};

function formatRunTime(isoDate) {
  return new Date(isoDate).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// request(body) llama a /api/invgate-sync con la sesion del usuario y devuelve el JSON.
export default function InvgateSettings({ settings, lastRun, onUpdate, request, onRunResult }) {
  const [groups, setGroups] = useState(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function loadGroups() {
    setBusy("groups");
    setMessage("");
    try {
      const result = await request({ action: "groups" });
      setGroups(result.groups);
    } catch (requestError) {
      setMessage(requestError.message);
    }
    setBusy("");
  }

  async function run(simulate) {
    setBusy(simulate ? "simulate" : "run");
    setMessage("");
    try {
      onRunResult(await request({ action: "run", simulate }));
    } catch (requestError) {
      setMessage(requestError.message);
    }
    setBusy("");
  }

  const selectedGroup = groups?.find((group) => String(group.id) === String(settings.groupId));

  return (
    <div className="invgate-settings">
      <p className="settings-hint">
        Cada 15 minutos pone en el grupo de InvGate que recibe solicitudes solo a quien esta en turno, y saca a quien
        esta antes de su entrada, despues de su salida, de vacaciones, en feriado o en fin de semana.
      </p>

      <div className="invgate-group">
        <label className="mail-field">
          Grupo de InvGate que recibe las solicitudes
          {groups ? (
            <select
              value={settings.groupId ?? ""}
              onChange={(event) => onUpdate({ groupId: event.target.value ? Number(event.target.value) : null })}
            >
              <option value="">Elige un grupo</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name} ({group.total ?? 0} miembros)
                </option>
              ))}
            </select>
          ) : (
            <span className="invgate-group-current">
              {settings.groupId ? `Grupo #${settings.groupId}` : "Sin grupo elegido"}
            </span>
          )}
        </label>
        <button type="button" className="reset-button" onClick={loadGroups} disabled={busy !== ""}>
          <RefreshCw size={16} />
          {busy === "groups" ? "Cargando..." : groups ? "Recargar grupos" : "Cargar grupos de InvGate"}
        </button>
        {selectedGroup ? <p className="settings-hint">Grupo elegido: {selectedGroup.name}</p> : null}
      </div>

      <label className="invgate-check">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(event) => onUpdate({ enabled: event.target.checked })}
        />
        Activar la sincronizacion automatica (cada 15 minutos)
      </label>
      <label className="invgate-check">
        <input
          type="checkbox"
          checked={settings.dryRun !== false}
          onChange={(event) => onUpdate({ dryRun: event.target.checked })}
        />
        Solo simular: calcula los cambios pero no modifica nada en InvGate
      </label>

      <div className="invgate-actions">
        <button
          type="button"
          className="reset-button"
          onClick={() => run(true)}
          disabled={busy !== "" || !settings.groupId}
        >
          {busy === "simulate" ? "Calculando..." : "Probar ahora (simulacion)"}
        </button>
        <button
          type="button"
          className="download-button"
          onClick={() => run(false)}
          disabled={busy !== "" || !settings.groupId || settings.dryRun !== false}
          title={settings.dryRun !== false ? "Quita 'Solo simular' para aplicar cambios" : "Aplica los cambios en InvGate"}
        >
          {busy === "run" ? "Sincronizando..." : "Sincronizar ahora"}
        </button>
      </div>

      {message ? <p className="form-error">{message}</p> : null}

      {lastRun ? (
        <div className="invgate-result">
          <p className="settings-hint">
            Ultima revision: {formatRunTime(lastRun.at)}
            {lastRun.simulate ? " (simulacion, no se cambio nada)" : ""}
          </p>
          {lastRun.error ? <p className="form-error">{lastRun.error}</p> : null}
          {lastRun.items ? (
            <table className="invgate-table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Disponible</th>
                  <th>Motivo</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {lastRun.items.map((item) => (
                  <tr key={item.email ?? item.name}>
                    <td>{item.name}</td>
                    <td>{item.available ? "Si" : "No"}</td>
                    <td>{item.reason}</td>
                    <td className={`invgate-action ${item.action}`}>{ACTION_LABELS[item.action] ?? item.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
