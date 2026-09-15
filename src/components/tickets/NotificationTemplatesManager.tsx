"use client";

import { useCallback, useEffect, useState } from "react";
import type { NotificationTemplate } from "@/lib/portal/types";
import { useToast } from "@/components/Toast";
import { fetchJson } from "./helpers";

const PLACEHOLDERS = [
  "{{nombre}}",
  "{{folio}}",
  "{{vivienda}}",
  "{{condominio}}",
  "{{motivo}}",
];

function truncateBody(body: string, max = 96): string {
  const oneLine = body.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

export function NotificationTemplatesManager() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<NotificationTemplate | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson<{ templates: NotificationTemplate[] }>(
        "/api/admin/notification-templates"
      );
      setTemplates(data.templates);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al cargar plantillas"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const resetForm = () => {
    setName("");
    setBody("");
    setActive(true);
    setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEdit = (template: NotificationTemplate) => {
    setEditing(template);
    setName(template.name);
    setBody(template.body);
    setActive(template.active);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    resetForm();
  };

  const handleSave = async () => {
    if (name.trim().length < 2) {
      toast("El nombre debe tener al menos 2 caracteres.", "error");
      return;
    }
    if (body.trim().length === 0) {
      toast("El cuerpo de la plantilla es obligatorio.", "error");
      return;
    }

    setSaving(true);
    try {
      const payload = JSON.stringify({
        name: name.trim(),
        body,
        active,
      });
      if (editing) {
        await fetchJson(`/api/admin/notification-templates/${editing.id}`, {
          method: "PUT",
          body: payload,
        });
        toast("Plantilla actualizada correctamente.", "success");
      } else {
        await fetchJson("/api/admin/notification-templates", {
          method: "POST",
          body: payload,
        });
        toast("Plantilla creada correctamente.", "success");
      }
      closeForm();
      await loadTemplates();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (template: NotificationTemplate) => {
    if (
      !window.confirm(
        `¿Desactivar la plantilla "${template.name}"? Dejará de estar disponible para nuevas notificaciones.`
      )
    ) {
      return;
    }
    try {
      await fetchJson(`/api/admin/notification-templates/${template.id}`, {
        method: "DELETE",
      });
      toast("Plantilla desactivada.", "success");
      await loadTemplates();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al desactivar", "error");
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      {!formOpen && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">
              Plantillas de notificación
            </h3>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              Nueva plantilla
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">Cargando plantillas...</p>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
              <button
                type="button"
                onClick={loadTemplates}
                className="ml-2 font-medium underline hover:no-underline"
              >
                Reintentar
              </button>
            </div>
          ) : templates.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">
              No hay plantillas. Crea la primera.
            </p>
          ) : (
            <ul className="space-y-2">
              {templates.map((template) => (
                <li
                  key={template.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">
                        {template.name}
                      </span>
                      {template.active ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          activo
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                          inactivo
                        </span>
                      )}
                    </div>
                    <p className="truncate text-sm text-slate-500">
                      {truncateBody(template.body) || "Sin contenido"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(template)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(template)}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                    >
                      Desactivar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {formOpen && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">
              {editing
                ? `Editar: ${editing.name}`
                : "Nueva plantilla de notificación"}
            </h3>
            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
            >
              Cancelar
            </button>
          </div>

          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <label
                htmlFor="template-name"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Nombre
              </label>
              <input
                id="template-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-400 focus:outline-none"
                placeholder="Ej. Aviso de mantenimiento"
              />
            </div>
            <div>
              <label
                htmlFor="template-body"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Cuerpo del mensaje
              </label>
              <textarea
                id="template-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-violet-400 focus:outline-none"
                placeholder="Hola {{nombre}}, te escribimos de {{condominio}} respecto a {{motivo}}…"
              />
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
              />
              Activo
            </label>
            <div className="rounded-lg bg-violet-50 px-3 py-2">
              <p className="text-xs font-medium text-violet-800">
                Placeholders disponibles:
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {PLACEHOLDERS.map((ph) => (
                  <code
                    key={ph}
                    className="rounded bg-violet-100 px-1.5 py-0.5 text-[11px] text-violet-800"
                  >
                    {ph}
                  </code>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {saving
                ? "Guardando..."
                : editing
                  ? "Guardar cambios"
                  : "Crear plantilla"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
