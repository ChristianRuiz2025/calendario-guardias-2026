import React, { useEffect, useState } from "react";
import {
  Building2,
  Repeat,
  Monitor,
  Moon,
  Sun,
  CalendarClock,
  ChevronRight,
  Clock,
  ListChecks,
  Mail,
  Palette,
  Plus,
  Trash2,
  TreePalm,
  Users,
  X,
} from "lucide-react";
import AuditRotationEditor from "./AuditRotationEditor";
import MailSettings from "./MailSettings.jsx";
import { dateKey, findRotationGuard } from "./auditRotation";
import { resolveRecipients } from "./mailSettings";
import OfficeRotationEditor from "./OfficeRotationEditor";
import { resolveOfficeOrder } from "./officeRotation";

import { MAX_DATE, MIN_DATE } from "./calendarYears";

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

const THEME_LABELS = { system: "Automatico", light: "Claro", dark: "Oscuro" };

// Estilos de Configuracion > Apariencia (ver src/useTheme.js); Marca CESA es el predeterminado.
const STYLE_OPTIONS = [
  { id: "cesa", label: "Marca CESA", hint: "Predeterminado: grises con el rojo de CESA" },
  { id: "clasico", label: "Clasico", hint: "Azul grisaceo, tarjetas solidas" },
  { id: "cristal", label: "Cristal", hint: "Translucido sobre fondo de color" },
  { id: "papel", label: "Papel", hint: "Crema, letra tipo libro, como impreso" },
  { id: "pastel", label: "Pastel", hint: "Tonos suaves y esquinas redondeadas" },
];

const WEEKDAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// "2026-04-02" -> "Abril 2026" (el calendario maneja varios anios)
function monthLabel(dayKey) {
  const [year, month] = dayKey.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
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

// Secciones del menu lateral de Configuracion, agrupadas.
const NAV_GROUPS = [
  {
    label: "Equipo",
    items: [
      { id: "guards", label: "Guardias", icon: Users },
      { id: "shifts", label: "Turnos", icon: Clock },
      { id: "audits", label: "Auditorias", icon: ListChecks },
    ],
  },
  {
    label: "Calendario",
    items: [
      { id: "office", label: "Dias de oficina", icon: Building2 },
      { id: "officeRotation", label: "Rotacion de oficina", icon: Repeat },
      { id: "closes", label: "Cierres", icon: CalendarClock },
      { id: "holidays", label: "Dias feriados", icon: TreePalm },
    ],
  },
  {
    label: "Otros",
    items: [
      { id: "mail", label: "Correos", icon: Mail },
      { id: "appearance", label: "Apariencia", icon: Palette },
    ],
  },
];

// Seccion de Configuracion: solo se muestra la elegida en el menu lateral.
function SettingsSection({ title, summary, action, open, className = "", children }) {
  if (!open) {
    return null;
  }
  return (
    <section className={["settings-page", className].join(" ")} aria-label={title}>
      <div className="settings-page-head">
        <div>
          <h3>{title}</h3>
          {summary ? <p className="settings-page-summary">{summary}</p> : null}
        </div>
        {action}
      </div>
      <div className="settings-page-body">{children}</div>
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
  holidays,
  onClose,
  onUpdateGuard,
  onAddGuard,
  onRemoveGuard,
  onUpdateShift,
  onAddShift,
  onRemoveShift,
  onUpdateOfficeDays,
  officeRotation,
  onUpdateOfficeRotation,
  onUpdateMsCloseDay,
  onAddHoliday,
  onRemoveHoliday,
  auditRotations,
  onSaveAuditRotation,
  onRemoveAuditRotation,
  themeMode,
  onUpdateThemeMode,
  styleMode,
  onUpdateStyleMode,
  currentGuard,
}) {
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayName, setNewHolidayName] = useState("");
  const holidayGroups = groupHolidaysByMonth(Object.keys(holidays));
  const [activeSection, setActiveSection] = useState("guards");
  const mailRecipients = resolveRecipients(mailSettings, guards);

  // Se ve una seccion a la vez, la elegida en el menu lateral.
  function section(id) {
    return { open: activeSection === id };
  }

  // Para los botones "+" del encabezado: muestra la seccion y luego agrega.
  function openAnd(id, action) {
    setActiveSection(id);
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
      <div className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        {/* Sin barra arriba: el titulo va en el menu lateral y la X en la esquina. */}
        <button className="icon-button settings-close" onClick={onClose} aria-label="Cerrar" title="Cerrar">
          <X size={18} />
        </button>

        <div className="settings-layout">
          <nav className="settings-nav" aria-label="Secciones de configuracion">
            <h2 id="settings-title" className="settings-nav-title">
              Configuracion
            </h2>
            {NAV_GROUPS.map((group) => (
              <div className="settings-nav-group" key={group.label}>
                <p className="settings-nav-label">{group.label}</p>
                {group.items.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={activeSection === id ? "active" : ""}
                    aria-current={activeSection === id ? "page" : undefined}
                    onClick={() => setActiveSection(id)}
                  >
                    <Icon size={16} aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div className="settings-content">
            <SettingsSection
              {...section("appearance")}
              title="Apariencia"
              summary={`${STYLE_OPTIONS.find((option) => option.id === styleMode)?.label ?? ""} · ${THEME_LABELS[themeMode]}`}
            >
              <p className="settings-subtitle">Estilo</p>
              <div className="accent-options" role="radiogroup" aria-label="Estilo de la aplicacion">
                {STYLE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    className={styleMode === option.id ? "active" : ""}
                    aria-checked={styleMode === option.id}
                    onClick={() => onUpdateStyleMode(option.id)}
                  >
                    <span className={`style-swatch ${option.id}`} aria-hidden="true" />
                    <span className="accent-option-text">
                      <strong>{option.label}</strong>
                      <span>{option.hint}</span>
                    </span>
                  </button>
                ))}
              </div>

              <p className="settings-subtitle">Tema</p>
              <div className="theme-options" role="radiogroup" aria-label="Modo claro u oscuro">
                {[
                  { id: "system", icon: Monitor, hint: "Igual que tu equipo" },
                  { id: "light", icon: Sun, hint: "Fondo claro" },
                  { id: "dark", icon: Moon, hint: "Fondo oscuro" },
                ].map(({ id, icon: Icon, hint }) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    className={themeMode === id ? "active" : ""}
                    aria-checked={themeMode === id}
                    onClick={() => onUpdateThemeMode(id)}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <strong>{THEME_LABELS[id]}</strong>
                    <span>{hint}</span>
                  </button>
                ))}
              </div>
              <p className="settings-hint">El estilo y el tema se guardan solo en este navegador.</p>
            </SettingsSection>

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

            <SettingsSection
              {...section("officeRotation")}
              title="Rotacion de oficina"
              summary={
                resolveOfficeOrder(officeRotation.order, guards)
                  .map((guard) => guard.name)
                  .join(" → ") || "Sin personas"
              }
            >
              <OfficeRotationEditor
                guards={guards}
                shifts={shifts}
                officeDays={officeDays}
                holidays={holidays}
                rotation={officeRotation}
                onSave={onUpdateOfficeRotation}
              />
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
              {...section("holidays")}
              title="Dias feriados"
              summary={`${Object.keys(holidays).length} ${Object.keys(holidays).length === 1 ? "dia" : "dias"}`}
            >
              <p className="settings-hint">Esos dias no hay guardias y se muestran en dorado.</p>
              <form className="holiday-form" onSubmit={submitHoliday}>
                <input
                  type="date"
                  min={MIN_DATE}
                  max={MAX_DATE}
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
    </div>
  );
}
