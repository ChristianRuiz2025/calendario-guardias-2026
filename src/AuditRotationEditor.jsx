import React, { useState } from "react";
import { ChevronRight, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { dateKey, findRotationGuard, parseDateKey } from "./auditRotation";

// "2026-11-02" -> "2 de noviembre de 2026"
function formatDate(value) {
  return parseDateKey(value).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
}

// Convierte el orden guardado (ids, o nombres en los periodos por defecto) en personas.
function resolveOrder(order, guards) {
  const result = [];
  order.forEach((entry) => {
    const guard = findRotationGuard(entry, guards);
    if (guard && !result.includes(guard)) {
      result.push(guard);
    }
  });
  return result;
}

function emptyForm(guards) {
  return { id: null, order: guards.map((guard) => guard.id), start: "", end: "", noEnd: true };
}

export default function AuditRotationEditor({ guards, rotations, onSave, onRemove }) {
  const [form, setForm] = useState(() => emptyForm(guards));
  const [dragIndex, setDragIndex] = useState(null);
  const [formError, setFormError] = useState("");
  const [listOpen, setListOpen] = useState(false);

  const today = dateKey(new Date());
  const sortedRotations = [...rotations].sort((a, b) => a.start.localeCompare(b.start));
  const included = form.order.map((id) => guards.find((guard) => guard.id === id)).filter(Boolean);
  const excluded = guards.filter((guard) => !form.order.includes(guard.id));

  function updateForm(changes) {
    setForm((current) => ({ ...current, ...changes }));
    setFormError("");
  }

  function moveGuard(from, to) {
    if (from === to || from === null) {
      return;
    }
    const order = included.map((guard) => guard.id);
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    updateForm({ order });
  }

  function editRotation(rotation) {
    setForm({
      id: rotation.id,
      order: resolveOrder(rotation.order, guards).map((guard) => guard.id),
      start: rotation.start,
      end: rotation.end ?? "",
      noEnd: !rotation.end,
    });
    setFormError("");
  }

  function submit(event) {
    event.preventDefault();
    const order = included.map((guard) => guard.id);

    if (order.length === 0) {
      setFormError("Agrega al menos una persona al orden.");
      return;
    }
    if (!form.start) {
      setFormError("Elige la fecha de inicio.");
      return;
    }
    if (!form.noEnd && (!form.end || form.end < form.start)) {
      setFormError("La fecha fin debe ser igual o posterior a la de inicio.");
      return;
    }

    onSave({ id: form.id ?? crypto.randomUUID(), start: form.start, end: form.noEnd ? null : form.end, order });
    setForm(emptyForm(guards));
  }

  function confirmRemove(rotation) {
    if (window.confirm(`Eliminar el orden que empieza el ${formatDate(rotation.start)}?`)) {
      onRemove(rotation.id);
      if (form.id === rotation.id) {
        setForm(emptyForm(guards));
      }
    }
  }

  return (
    <div className="rotation-editor">
      <form className="rotation-form" onSubmit={submit}>
        <p className="settings-hint">Arrastra a las personas para ponerlas en orden. Rotan una por semana.</p>
        <ol className="rotation-order">
          {included.map((guard, index) => (
            <li
              key={guard.id}
              className={["rotation-person", dragIndex === index ? "dragging" : ""].join(" ")}
              style={{ backgroundColor: guard.color }}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                setDragIndex(index);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                moveGuard(dragIndex, index);
                setDragIndex(index);
              }}
              onDragEnd={() => setDragIndex(null)}
            >
              <GripVertical size={16} aria-hidden="true" />
              <span className="rotation-position">{index + 1}</span>
              <span className="rotation-name">{guard.name}</span>
              <button
                type="button"
                className="rotation-person-remove"
                onClick={() => updateForm({ order: form.order.filter((id) => id !== guard.id) })}
                aria-label={`Quitar a ${guard.name} del orden`}
                title="Quitar del orden"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ol>
        {excluded.length > 0 ? (
          <div className="rotation-excluded">
            <span className="settings-hint">Fuera del orden:</span>
            {excluded.map((guard) => (
              <button
                type="button"
                key={guard.id}
                className="rotation-chip"
                style={{ backgroundColor: guard.color }}
                onClick={() => updateForm({ order: [...form.order, guard.id] })}
                title="Agregar al orden"
              >
                <Plus size={12} />
                {guard.name}
              </button>
            ))}
          </div>
        ) : null}

        <div className="rotation-dates">
          <label>
            Asignar orden desde el dia
            <input type="date" value={form.start} onChange={(event) => updateForm({ start: event.target.value })} />
          </label>
          <label>
            Hasta
            <input
              type="date"
              value={form.end}
              min={form.start || undefined}
              disabled={form.noEnd}
              onChange={(event) => updateForm({ end: event.target.value })}
            />
          </label>
        </div>
        <label className="rotation-no-end">
          <input type="checkbox" checked={form.noEnd} onChange={(event) => updateForm({ noEnd: event.target.checked })} />
          Sin fecha fin
        </label>

        {formError ? <p className="form-error">{formError}</p> : null}

        <div className="rotation-actions">
          {form.id ? (
            <button type="button" className="reset-button" onClick={() => setForm(emptyForm(guards))}>
              Cancelar
            </button>
          ) : null}
          <button type="submit" className="download-button">
            {form.id ? "Guardar cambios" : "Guardar orden"}
          </button>
        </div>
      </form>

      <div className={["rotation-list", listOpen ? "open" : ""].join(" ")}>
        <button
          type="button"
          className="holiday-month-toggle"
          onClick={() => setListOpen((current) => !current)}
          aria-expanded={listOpen}
        >
          <ChevronRight size={16} className="holiday-chevron" aria-hidden="true" />
          <span>Ordenes guardados</span>
          <span className="holiday-count">{sortedRotations.length}</span>
        </button>
        {listOpen && sortedRotations.length === 0 ? <p className="settings-hint">No hay ordenes guardados.</p> : null}
        {(listOpen ? sortedRotations : []).map((rotation) => {
          const isActive = rotation.start <= today && (!rotation.end || today <= rotation.end);
          return (
            <div className={["rotation-item", form.id === rotation.id ? "editing" : ""].join(" ")} key={rotation.id}>
              <div className="rotation-item-head">
                <span>
                  {formatDate(rotation.start)} → {rotation.end ? formatDate(rotation.end) : "Sin fecha fin"}
                </span>
                {isActive ? <span className="rotation-badge">Vigente</span> : null}
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => editRotation(rotation)}
                  aria-label="Editar orden"
                  title="Editar"
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  className="icon-button danger"
                  onClick={() => confirmRemove(rotation)}
                  aria-label="Eliminar orden"
                  title="Eliminar"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="rotation-chips">
                {resolveOrder(rotation.order, guards).map((guard, index) => (
                  <span className="rotation-chip" key={guard.id} style={{ backgroundColor: guard.color }}>
                    {index + 1}. {guard.name}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
