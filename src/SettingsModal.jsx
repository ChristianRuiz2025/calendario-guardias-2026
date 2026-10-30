import React, { useEffect, useState } from "react";
import { ChevronRight, Plus, Trash2, X } from "lucide-react";
import AuditRotationEditor from "./AuditRotationEditor";
import MailSettings from "./MailSettings";
import InvgateSettings from "./InvgateSettings";
import { dateKey, findRotationGuard } from "./auditRotation";
import { resolveRecipients } from "./mailSettings";

const YEAR = 2026;

const WEEKDAY_OPTIONS = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miercoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
];

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

const WEEKDAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// "2026-04-02" -> "Abril" (con el anio si no es el del calendario)
function monthLabel(dayKey) {
  const [year, month] = dayKey.split("-").map(Number);
  return year === YEAR ? MONTH_NAMES[month - 1] : `${MONTH_NAMES[month - 1]} ${year}`;
}

// Agrupa los feriados por mes: [{ month: "Abril", days: [{ dayKey, day: 2, weekday: "Jueves" }, ...] }]
function groupHolidaysByMonth(dayKeys) {
  const groups = [];
  [...dayKeys].sort().forEach((dayKey) => {
    const [year, month, day] = dayKey.split("-").map(Number);
    const label = monthLabel(dayKey);
    const weekday = WEEKDAY_NAMES[new Date(year, month - 1, day).getDay()];
    const group = groups.at(-1);
    if (group?.month === label) {
      group.days.push({ dayKey, day, weekday });
    } else {
      groups.push({ month: label, days: [{ dayKey, day, weekday }] });
    }
  });
  return groups;
}

// "08:00" + "17:00" -> "8 a 5"
function shiftLabel(shift) {
  const hour = (time) => {
    const value = Number(time.split(":")[0]) % 12;
    return value === 0 ? 12 : value;
  };
  return `${hour(shift.start)} a ${hour(shift.end)}`;
}

// Seccion de Configuracion que se abre y cierra; el resumen se ve aun cerrada.
function SettingsSection({ title, summary, action, open, onToggle, className = "", children }) {
  return (
    <section className={["panel", "settings-section", open ? "open" : "", className].join(" ")}>
      <div className="settings-section-head">
        <button type="button" className="settings-section-toggle" onClick={onToggle} aria-expanded={open}>
          <ChevronRight size={18} className="holiday-chevron" aria-hidden="true" />
          <h2>{title}</h2>
          {summary ? <span className="settings-section-summary">{summary}</span> : null}
        </button>
        {action}
      </div>
      {open ? <div className="settings-section-body">{children}</div> : null}
    </section>
  );
}

export default function SettingsModal({
  guards,
  shifts,
  officeDays,
  msCloseDay,
  mailSettings,
  onUpdateMailSettings,
  invgateSettings,
  invgateLastRun,
  onUpdateInvgateSettings,
  onInvgateRequest,
  onInvgateRunResult,
  holidays,
  onClose,
  onUpdateGuard,
  onAddGuard,
  onRemoveGuard,
  onUpdateShift,
  onAddShift,
  onRemoveShift,
  onUpdateOfficeDays,
  onUpdateMsCloseDay,
  onAddHoliday,
  onRemoveHoliday,
  auditRotations,
  onSaveAuditRotation,
  onRemoveAuditRotation,
}) {
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayName, setNewHolidayName] = useState("");
  const holidayGroups = groupHolidaysByMonth(Object.keys(holidays));
  const [openSections, setOpenSections] = useState([]);
  const mailRecipients = resolveRecipients(mailSettings, guards);

  // Todas las secciones empiezan cerradas; se pueden abrir varias a la vez.
  function section(id) {
    return {
      open: openSections.includes(id),
      onToggle: () =>
        setOpenSections((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id])),
    };
  }

  // Para los botones "+" del encabezado: abre la seccion y luego agrega.
  function openAnd(id, action) {
    setOpenSections((current) => (current.includes(id) ? current : [...current, id]));
    action();
  }

  // "Abi → Jona → Chris" del orden de auditorias vigente hoy.
  const today = dateKey(new Date());
  const activeRotation = [...auditRotations]
    .filter((rotation) => rotation.start <= today && (!rotation.end || today <= rotation.end))
    .sort((a, b) => a.start.localeCompare(b.start))
    .at(-1);
  const activeRotationSummary = activeRotation
    ? activeRotation.order
        .map((entry) => findRotationGuard(entry, guards)?.name)
        .filter(Boolean)
        .join(" → ")
    : "Sin orden vigente";
  const [openMonths, setOpenMonths] = useState([]);

  function toggleMonth(month) {
    setOpenMonths((current) =>
      current.includes(month) ? current.filter((item) => item !== month) : [...current, month],
    );
  }

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function toggleOfficeDay(day) {
    onUpdateOfficeDays(officeDays.includes(day) ? officeDays.filter((item) => item !== day) : [...officeDays, day]);
  }

  function submitHoliday(event) {
    event.preventDefault();
    if (!newHolidayDate) {
      return;
    }
    onAddHoliday(newHolidayDate, newHolidayName.trim());
    // Abre el mes del feriado nuevo para que se vea en la lista.
    const month = monthLabel(newHolidayDate);
    setOpenMonths((current) => (current.includes(month) ? current : [...current, month]));
    setNewHolidayDate("");
    setNewHolidayName("");
  }

  function confirmRemoveShift(shift) {
    if (
      window.confirm(`Eliminar el turno ${shiftLabel(shift)}? Los dias que lo tienen asignado quedaran sin guardia.`)
    ) {
      onRemoveShift(shift.id);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="modal-header">
          <h2 id="settings-title">Configuracion</h2>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar" title="Cerrar">
            <X size={18} />
          </button>
        </header>

        <div className="modal-body">
            <SettingsSection
              {...section("guards")}
              title="Guardias"
              summary={`${guards.length} ${guards.length === 1 ? "persona" : "personas"}`}
              action={
                <button
                  className="icon-button"
                  onClick={() => openAnd("guards", onAddGuard)}
                  aria-label="Agregar guardia"
                  title="Agregar guardia"
                >
                  <Plus size={18} />
                </button>
              }
            >
              <p className="settings-hint">El correo liga a cada persona con su inicio de sesion para descargar sus ICS.</p>
              <div className="guard-list">
                {guards.map((guard) => (
                  <div className="guard-row" key={guard.id}>
                    <input
                      className="swatch"
                      type="color"
                      value={guard.color}
                      onChange={(event) => onUpdateGuard(guard.id, "color", event.target.value)}
                      aria-label={`Color de ${guard.name}`}
                    />
                    <input
                      value={guard.initials}
                      onChange={(event) => onUpdateGuard(guard.id, "initials", event.target.value)}
                      aria-label={`Iniciales de ${guard.name}`}
                    />
                    <input
                      value={guard.name}
                      onChange={(event) => onUpdateGuard(guard.id, "name", event.target.value)}
                      aria-label={`Nombre de ${guard.name}`}
                    />
                    <input
                      type="email"
                      value={guard.email ?? ""}
                      onChange={(event) => onUpdateGuard(guard.id, "email", event.target.value.trim())}
                      placeholder="Correo"
                      aria-label={`Correo de ${guard.name}`}
                    />
                    <button
                      className="icon-button danger"
                      onClick={() => onRemoveGuard(guard.id)}
                      aria-label={`Eliminar ${guard.name}`}
                      title="Eliminar guardia"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </SettingsSection>

            <SettingsSection
              {...section("office")}
              title="Dias de oficina"
              summary={
                WEEKDAY_OPTIONS.filter((day) => officeDays.includes(day.value))
                  .map((day) => day.label)
                  .join(", ") || "Ninguno"
              }
            >
              <p className="settings-hint">Se marcan con borde rojo en el calendario.</p>
              <div className="weekday-toggle">
                {WEEKDAY_OPTIONS.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    className={officeDays.includes(day.value) ? "active" : ""}
                    aria-pressed={officeDays.includes(day.value)}
                    onClick={() => toggleOfficeDay(day.value)}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </SettingsSection>

            <SettingsSection {...section("closes")} title="Cierres" summary={`Cierre MS dia ${msCloseDay}`}>
              <div className="close-rule">
                <span className="legend-swatch month-end" aria-hidden="true" />
                <div>
                  <strong>Cierre fin de mes</strong>
                  <p className="settings-hint">
                    Ultimo dia habil del mes. Si cae en fin de semana o feriado, se recorre hacia atras.
                  </p>
                </div>
              </div>
              <div className="close-rule">
                <span className="legend-swatch ms-close" aria-hidden="true" />
                <div>
                  <strong>Cierre MS</strong>
                  <p className="settings-hint">
                    Dia{" "}
                    <input
                      className="close-day-input"
                      type="number"
                      min="1"
                      max="28"
                      value={msCloseDay}
                      onChange={(event) => {
                        const day = Number(event.target.value);
                        if (Number.isInteger(day) && day >= 1 && day <= 28) {
                          onUpdateMsCloseDay(day);
                        }
                      }}
                      aria-label="Dia del cierre MS"
                    />{" "}
                    de cada mes. Si cae en fin de semana o feriado, se recorre al siguiente dia habil.
                  </p>
                </div>
              </div>
            </SettingsSection>

            <SettingsSection
              {...section("audits")}
              title="Orden automatico de auditorias"
              summary={activeRotationSummary}
            >
              <AuditRotationEditor
                guards={guards}
                rotations={auditRotations}
                onSave={onSaveAuditRotation}
                onRemove={onRemoveAuditRotation}
              />
            </SettingsSection>

            <SettingsSection
              {...section("shifts")}
              className="shift-panel"
              title="Turnos"
              summary={shifts.map(shiftLabel).join(" · ")}
              action={
                <button
                  className="icon-button"
                  onClick={() => openAnd("shifts", onAddShift)}
                  aria-label="Agregar turno"
                  title="Agregar turno"
                >
                  <Plus size={18} />
                </button>
              }
            >
              <div className="shift-editor shift-editor-head">
                <span>Entrada</span>
                <span>Salida</span>
                <span />
              </div>
              {shifts.map((shift) => (
                <div key={shift.id} className="shift-editor">
                  <input
                    type="time"
                    value={shift.start}
                    onChange={(event) => onUpdateShift(shift.id, "start", event.target.value)}
                    aria-label={`Entrada del turno ${shiftLabel(shift)}`}
                  />
                  <input
                    type="time"
                    value={shift.end}
                    onChange={(event) => onUpdateShift(shift.id, "end", event.target.value)}
                    aria-label={`Salida del turno ${shiftLabel(shift)}`}
                  />
                  <button
                    className="icon-button danger"
                    onClick={() => confirmRemoveShift(shift)}
                    disabled={shifts.length === 1}
                    aria-label={`Eliminar turno ${shiftLabel(shift)}`}
                    title={shifts.length === 1 ? "Debe quedar al menos un turno" : "Eliminar turno"}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <p className="settings-hint">
                Se ordenan por hora de entrada. Los cambios aplican a todos los dias que ya tienen ese turno y a los ICS
                que se descarguen.
              </p>
            </SettingsSection>

            <SettingsSection
              {...section("mail")}
              title="Correos"
              summary={mailRecipients.to.length ? `Para ${mailRecipients.to.length} · CC ${mailRecipients.cc.length}` : "Sin destinatarios"}
            >
              <p className="settings-hint">A quien y como se envia el correo de "Enviar por correo".</p>
              <MailSettings guards={guards} settings={mailSettings} onUpdate={onUpdateMailSettings} />
            </SettingsSection>

            <SettingsSection
              {...section("invgate")}
              title="InvGate"
              summary={
                !invgateSettings.enabled ? "Desactivado" : invgateSettings.dryRun !== false ? "Simulando" : "Activo"
              }
            >
              <InvgateSettings
                settings={invgateSettings}
                lastRun={invgateLastRun}
                onUpdate={onUpdateInvgateSettings}
                request={onInvgateRequest}
                onRunResult={onInvgateRunResult}
              />
            </SettingsSection>

            <SettingsSection
              {...section("holidays")}
              title="Dias feriados"
              summary={`${Object.keys(holidays).length} ${Object.keys(holidays).length === 1 ? "dia" : "dias"}`}
            >
              <p className="settings-hint">Esos dias no hay guardias y se muestran en dorado.</p>
              <form className="holiday-form" onSubmit={submitHoliday}>
                <input
                  type="date"
                  min={`${YEAR}-01-01`}
                  max={`${YEAR}-12-31`}
                  value={newHolidayDate}
                  onChange={(event) => setNewHolidayDate(event.target.value)}
                  aria-label="Fecha del feriado"
                  required
                />
                <input
                  value={newHolidayName}
                  onChange={(event) => setNewHolidayName(event.target.value)}
                  placeholder="Nombre (opcional)"
                  aria-label="Nombre del feriado"
                />
                <button type="submit" className="icon-button" aria-label="Agregar feriado" title="Agregar feriado">
                  <Plus size={18} />
                </button>
              </form>
              <div className="holiday-list">
                {holidayGroups.length === 0 ? <p className="settings-hint">No hay feriados.</p> : null}
                {holidayGroups.map((group) => {
                  const isOpen = openMonths.includes(group.month);
                  return (
                    <div className={["holiday-month", isOpen ? "open" : ""].join(" ")} key={group.month}>
                      <button
                        type="button"
                        className="holiday-month-toggle"
                        onClick={() => toggleMonth(group.month)}
                        aria-expanded={isOpen}
                      >
                        <ChevronRight size={16} className="holiday-chevron" aria-hidden="true" />
                        <span>{group.month}</span>
                        <span className="holiday-count">
                          {group.days.length} {group.days.length === 1 ? "dia" : "dias"}
                        </span>
                      </button>
                      {isOpen ? (
                        <table className="holiday-table">
                          <tbody>
                            {group.days.map((holiday) => (
                              <tr key={holiday.dayKey}>
                                <td className="holiday-day">{holiday.day}</td>
                                <td className="holiday-weekday">{holiday.weekday}</td>
                                <td>
                                  <input
                                    value={holidays[holiday.dayKey]}
                                    onChange={(event) => onAddHoliday(holiday.dayKey, event.target.value)}
                                    placeholder="No hay Clases"
                                    aria-label={`Nombre del feriado ${holiday.dayKey}`}
                                  />
                                </td>
                                <td className="holiday-action">
                                  <button
                                    className="icon-button danger"
                                    onClick={() => onRemoveHoliday(holiday.dayKey)}
                                    aria-label={`Eliminar feriado ${holiday.dayKey}`}
                                    title="Eliminar feriado"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </SettingsSection>
        </div>
      </div>
    </div>
  );
}
