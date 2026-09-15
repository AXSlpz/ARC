"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface ServiceType {
  id: number;
  slug: string;
  name: string;
  keywords: string;
  active: boolean;
}

type Recurrence = "once" | "daily" | "weekly" | "every_n_days" | "monthly";

interface ScheduleItem {
  id: number;
  service_type_id: number;
  service_type_name?: string;
  title: string | null;
  start_date: string;
  time: string | null;
  recurrence: Recurrence;
  interval_days: number | null;
  weekdays: number[] | null;
  notes: string | null;
  active: boolean;
  recurrence_label?: string;
  next_occurrences?: string[];
}

interface FormState {
  service_type_id: number | "";
  title: string;
  start_date: string;
  time: string;
  noTime: boolean;
  recurrence: Recurrence;
  interval_days: number;
  weekdays: number[];
  notes: string;
  active: boolean;
}

interface CondominioServicesPanelProps {
  condominioId: number;
  condominioName: string;
  onClose: () => void;
  onChanged?: () => void;
}

const WEEKDAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: "once", label: "Una sola vez" },
  { value: "daily", label: "Todos los días" },
  { value: "weekly", label: "Días de la semana" },
  { value: "every_n_days", label: "Cada N días" },
  { value: "monthly", label: "Cada mes (mismo día)" },
];

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function emptyForm(): FormState {
  return {
    service_type_id: "",
    title: "",
    start_date: todayIso(),
    time: "09:00",
    noTime: true,
    recurrence: "weekly",
    interval_days: 15,
    weekdays: [1],
    notes: "",
    active: true,
  };
}

export function CondominioServicesPanel({
  condominioId,
  condominioName,
  onClose,
  onChanged,
}: CondominioServicesPanelProps) {
  const [types, setTypes] = useState<ServiceType[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [typesOpen, setTypesOpen] = useState(false);
  const [typeEditingId, setTypeEditingId] = useState<number | null>(null);
  const [typeName, setTypeName] = useState("");
  const [typeKeywords, setTypeKeywords] = useState("");
  const [savingType, setSavingType] = useState(false);

  const baseUrl = `/api/condominios/${condominioId}/schedules`;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [typesRes, schedRes] = await Promise.all([
        fetch("/api/service-types?all=1"),
        fetch(baseUrl),
      ]);
      if (!typesRes.ok) throw new Error("No se pudo cargar tipos de servicio");
      if (!schedRes.ok) {
        const data = await schedRes.json().catch(() => ({}));
        throw new Error(data.error ?? "Error al cargar programación");
      }
      setTypes(await typesRes.json());
      const data = await schedRes.json();
      setSchedules(Array.isArray(data.schedules) ? data.schedules : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    const activeTypes = types.filter((t) => t.active);
    setForm({
      ...emptyForm(),
      service_type_id: activeTypes[0]?.id ?? "",
    });
    setFormOpen(true);
    setTypesOpen(false);
    setError("");
  };

  const openNewType = () => {
    setTypeEditingId(null);
    setTypeName("");
    setTypeKeywords("");
    setTypesOpen(true);
    setError("");
  };

  const openEditType = (t: ServiceType) => {
    setTypeEditingId(t.id);
    setTypeName(t.name);
    setTypeKeywords(t.keywords ?? "");
    setTypesOpen(true);
    setError("");
  };

  const handleSaveType = async () => {
    if (!typeName.trim()) {
      setError("El nombre del tipo es obligatorio");
      return;
    }
    setSavingType(true);
    setError("");
    try {
      const url =
        typeEditingId != null
          ? `/api/service-types/${typeEditingId}`
          : "/api/service-types";
      const method = typeEditingId != null ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: typeName.trim(),
          keywords: typeKeywords.trim(),
          active: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar tipo");
      setTypeEditingId(null);
      setTypeName("");
      setTypeKeywords("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar tipo");
    } finally {
      setSavingType(false);
    }
  };

  const handleDeleteType = async (t: ServiceType) => {
    if (
      !window.confirm(
        `¿Eliminar el tipo "${t.name}"? Si ya tiene programaciones, se desactivará.`
      )
    ) {
      return;
    }
    setError("");
    try {
      const res = await fetch(`/api/service-types/${t.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al eliminar tipo");
      if (typeEditingId === t.id) {
        setTypeEditingId(null);
        setTypeName("");
        setTypeKeywords("");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar tipo");
    }
  };

  const openEdit = (s: ScheduleItem) => {
    setEditingId(s.id);
    setForm({
      service_type_id: s.service_type_id,
      title: s.title ?? "",
      start_date: s.start_date,
      time: s.time ?? "09:00",
      noTime: !s.time,
      recurrence: s.recurrence,
      interval_days: s.interval_days ?? 15,
      weekdays: s.weekdays ?? [1],
      notes: s.notes ?? "",
      active: s.active,
    });
    setFormOpen(true);
    setError("");
  };

  const payload = useMemo(
    () => ({
      service_type_id: Number(form.service_type_id),
      title: form.title.trim() || null,
      start_date: form.start_date,
      time: form.noTime ? null : form.time,
      recurrence: form.recurrence,
      interval_days:
        form.recurrence === "every_n_days" ? form.interval_days : null,
      weekdays: form.recurrence === "weekly" ? form.weekdays : null,
      notes: form.notes.trim() || null,
      active: form.active,
    }),
    [form]
  );

  const handleSave = async () => {
    if (!form.service_type_id) {
      setError("Selecciona un tipo de servicio");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const url = editingId != null ? `${baseUrl}/${editingId}` : baseUrl;
      const method = editingId != null ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar");
      setFormOpen(false);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("¿Eliminar esta programación?")) return;
    setError("");
    try {
      const res = await fetch(`${baseUrl}/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al eliminar");
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
    }
  };

  const toggleWeekday = (day: number) => {
    setForm((f) => {
      const has = f.weekdays.includes(day);
      return {
        ...f,
        weekdays: has
          ? f.weekdays.filter((d) => d !== day)
          : [...f.weekdays, day].sort((a, b) => a - b),
      };
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-violet-100 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-violet-900">
              Servicios programados
            </h3>
            <p className="mt-0.5 truncate text-sm text-gray-500">
              {condominioName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            Cerrar
          </button>
        </div>

        <div className="shrink-0 flex flex-wrap items-center gap-2 border-b border-gray-100 px-5 py-3 sm:px-6">
          <button
            type="button"
            onClick={openCreate}
            disabled={types.filter((t) => t.active).length === 0}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            + Programar servicio
          </button>
          <button
            type="button"
            onClick={() => {
              if (typesOpen) {
                setTypesOpen(false);
              } else {
                openNewType();
              }
            }}
            className="rounded-lg border border-violet-200 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50"
          >
            {typesOpen ? "Ocultar servicios" : "Gestionar servicios"}
          </button>
          <p className="text-xs text-gray-500">
            El bot usará esta programación cuando un residente de este condominio
            pregunte (ej. cuándo pasan la basura).
          </p>
        </div>

        {error && (
          <p className="mx-5 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 sm:mx-6">
            {error}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4 sm:px-6">
          {typesOpen && (
            <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-indigo-900">
                  Tipos de servicio
                </h4>
                <button
                  type="button"
                  onClick={openNewType}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                >
                  + Nuevo tipo
                </button>
              </div>
              <p className="mt-1 text-xs text-indigo-800/80">
                Nombre visible y palabras clave (separadas por coma) para que el
                bot reconozca preguntas.
              </p>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Nombre
                  </label>
                  <input
                    type="text"
                    value={typeName}
                    onChange={(e) => setTypeName(e.target.value)}
                    placeholder="Ej. Fumigación"
                    className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Keywords (opcional)
                  </label>
                  <input
                    type="text"
                    value={typeKeywords}
                    onChange={(e) => setTypeKeywords(e.target.value)}
                    placeholder="fumigacion,plagas,insectos"
                    className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="mt-2 flex justify-end gap-2">
                {typeEditingId != null && (
                  <button
                    type="button"
                    onClick={openNewType}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600"
                  >
                    Cancelar edición
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleSaveType()}
                  disabled={savingType}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {savingType
                    ? "Guardando..."
                    : typeEditingId != null
                      ? "Guardar cambios"
                      : "Agregar tipo"}
                </button>
              </div>

              <div className="mt-3 max-h-48 space-y-1.5 overflow-auto">
                {types.map((t) => (
                  <div
                    key={t.id}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 ${
                      t.active
                        ? "border-indigo-100"
                        : "border-gray-100 opacity-60"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {t.name}
                        {!t.active ? " (inactivo)" : ""}
                      </p>
                      {t.keywords && (
                        <p className="truncate text-[11px] text-gray-400">
                          {t.keywords}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => openEditType(t)}
                        className="rounded-md px-2 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-50"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteType(t)}
                        className="rounded-md px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <p className="py-10 text-center text-sm text-gray-400">Cargando...</p>
          ) : schedules.length === 0 && !formOpen ? (
            <div className="py-12 text-center text-sm text-gray-500">
              No hay servicios programados en este condominio.
            </div>
          ) : (
            <div className="space-y-3">
              {schedules.map((s) => (
                <div
                  key={s.id}
                  className={`rounded-xl border px-4 py-3 ${
                    s.active
                      ? "border-violet-100 bg-violet-50/30"
                      : "border-gray-100 bg-gray-50 opacity-70"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">
                        {s.title?.trim() || s.service_type_name}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {s.recurrence_label}
                        {s.time ? ` · ${s.time}` : " · sin hora"}
                        {!s.active ? " · inactivo" : ""}
                      </p>
                      {s.next_occurrences && s.next_occurrences.length > 0 && (
                        <p className="mt-1 text-xs text-violet-700">
                          Próximas: {s.next_occurrences.join(", ")}
                        </p>
                      )}
                      {s.notes && (
                        <p className="mt-1 text-xs text-gray-500">{s.notes}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(s)}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(s.id)}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {formOpen && (
            <div className="mt-4 rounded-xl border border-violet-200 bg-white p-4 shadow-sm">
              <h4 className="text-sm font-semibold text-violet-900">
                {editingId != null ? "Editar programación" : "Nueva programación"}
              </h4>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Tipo de servicio
                  </label>
                  <select
                    value={form.service_type_id}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        service_type_id: e.target.value
                          ? Number(e.target.value)
                          : "",
                      }))
                    }
                    className="w-full rounded-lg border border-violet-200 px-3 py-2 text-sm"
                  >
                    <option value="">Selecciona...</option>
                    {types
                      .filter((t) => t.active || t.id === form.service_type_id)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                          {!t.active ? " (inactivo)" : ""}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Título (opcional)
                  </label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, title: e.target.value }))
                    }
                    placeholder="Ej. Basura orgánica"
                    className="w-full rounded-lg border border-violet-200 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Fecha de inicio
                  </label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, start_date: e.target.value }))
                    }
                    className="w-full rounded-lg border border-violet-200 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Hora
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={form.time}
                      disabled={form.noTime}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, time: e.target.value }))
                      }
                      className="w-full rounded-lg border border-violet-200 px-3 py-2 text-sm disabled:bg-gray-50"
                    />
                    <label className="flex shrink-0 items-center gap-1 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={form.noTime}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, noTime: e.target.checked }))
                        }
                      />
                      Sin hora
                    </label>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Periodicidad
                  </label>
                  <select
                    value={form.recurrence}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        recurrence: e.target.value as Recurrence,
                      }))
                    }
                    className="w-full rounded-lg border border-violet-200 px-3 py-2 text-sm"
                  >
                    {RECURRENCE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                {form.recurrence === "weekly" && (
                  <div className="sm:col-span-2">
                    <p className="mb-1.5 text-xs font-medium text-gray-700">
                      Días de la semana
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {WEEKDAYS.map((d) => {
                        const on = form.weekdays.includes(d.value);
                        return (
                          <button
                            key={d.value}
                            type="button"
                            onClick={() => toggleWeekday(d.value)}
                            className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                              on
                                ? "bg-violet-600 text-white"
                                : "bg-violet-50 text-violet-700 hover:bg-violet-100"
                            }`}
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {form.recurrence === "every_n_days" && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Cada cuántos días
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={form.interval_days}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          interval_days: Math.max(1, Number(e.target.value) || 1),
                        }))
                      }
                      className="w-full rounded-lg border border-violet-200 px-3 py-2 text-sm"
                    />
                  </div>
                )}

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Notas (opcional)
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, notes: e.target.value }))
                    }
                    rows={2}
                    className="w-full rounded-lg border border-violet-200 px-3 py-2 text-sm"
                    placeholder="Ej. Dejar bolsas en el acceso principal"
                  />
                </div>

                {editingId != null && (
                  <label className="flex items-center gap-2 text-sm text-gray-700 sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, active: e.target.checked }))
                      }
                    />
                    Activo
                  </label>
                )}
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  disabled={saving}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
