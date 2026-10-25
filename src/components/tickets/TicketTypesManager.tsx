"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FIELD_TYPE_LABELS,
  FIELD_TYPES,
  type FieldType,
  type TicketType,
} from "@/lib/portal/types";
import { useToast } from "@/components/Toast";
import { fetchJson } from "./helpers";

interface DraftField {
  uid: string;
  label: string;
  fieldKey: string;
  fieldType: FieldType;
  required: boolean;
  placeholder: string;
  options: string[];
}

const BASE_PLACEHOLDERS = [
  "{{folio}}",
  "{{fecha}}",
  "{{tipo}}",
  "{{cliente_nombre}}",
  "{{cliente_correo}}",
  "{{cliente_telefono}}",
];

let uidCounter = 0;
function nextUid(): string {
  uidCounter += 1;
  return `f${Date.now()}_${uidCounter}`;
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function emptyField(): DraftField {
  return {
    uid: nextUid(),
    label: "",
    fieldKey: "",
    fieldType: "text",
    required: false,
    placeholder: "",
    options: [],
  };
}

function toDraftFields(type: TicketType): DraftField[] {
  return (type.fields ?? []).map((f) => ({
    uid: nextUid(),
    label: f.label,
    fieldKey: f.fieldKey,
    fieldType: f.fieldType,
    required: f.required,
    placeholder: f.placeholder ?? "",
    options: f.options ?? [],
  }));
}

export function TicketTypesManager() {
  const { toast } = useToast();
  const [types, setTypes] = useState<TicketType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState<TicketType | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [letterTemplate, setLetterTemplate] = useState("");
  const [fields, setFields] = useState<DraftField[]>([]);
  const [saving, setSaving] = useState(false);

  const loadTypes = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson<{ types: TicketType[] }>(
        "/api/admin/ticket-types"
      );
      setTypes(data.types);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar tipos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTypes();
  }, [loadTypes]);

  const resetForm = () => {
    setName("");
    setDescription("");
    setActive(true);
    setLetterTemplate("");
    setFields([]);
    setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEdit = (type: TicketType) => {
    setEditing(type);
    setName(type.name);
    setDescription(type.description ?? "");
    setActive(type.active);
    setLetterTemplate(type.letterTemplate ?? "");
    setFields(toDraftFields(type));
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    resetForm();
  };

  const updateField = (uid: string, patch: Partial<DraftField>) => {
    setFields((prev) =>
      prev.map((f) => (f.uid === uid ? { ...f, ...patch } : f))
    );
  };

  const removeField = (uid: string) => {
    setFields((prev) => prev.filter((f) => f.uid !== uid));
  };

  const moveField = (index: number, dir: -1 | 1) => {
    setFields((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const availablePlaceholders = useMemo(() => {
    const keys = fields
      .map((f) => f.fieldKey.trim() || slugify(f.label))
      .filter(Boolean)
      .map((k) => `{{${k}}}`);
    return [...BASE_PLACEHOLDERS, ...keys];
  }, [fields]);

  const handleSave = async () => {
    if (name.trim().length < 2) {
      toast("El nombre debe tener al menos 2 caracteres.", "error");
      return;
    }
    const cleanFields = fields
      .filter((f) => f.label.trim().length > 0)
      .map((f) => ({
        label: f.label.trim(),
        fieldKey: f.fieldKey.trim() || undefined,
        fieldType: f.fieldType,
        required: f.required,
        placeholder: f.placeholder.trim() || undefined,
        options:
          f.fieldType === "select"
            ? f.options.map((o) => o.trim()).filter(Boolean)
            : undefined,
      }));

    setSaving(true);
    try {
      const body = JSON.stringify({
        name: name.trim(),
        description: description.trim() || null,
        active,
        letterTemplate: letterTemplate.trim() || null,
        fields: cleanFields,
      });
      if (editing) {
        await fetchJson(`/api/admin/ticket-types/${editing.id}`, {
          method: "PUT",
          body,
        });
        toast("Tipo actualizado correctamente.", "success");
      } else {
        await fetchJson("/api/admin/ticket-types", { method: "POST", body });
        toast("Tipo creado correctamente.", "success");
      }
      closeForm();
      await loadTypes();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (type: TicketType) => {
    if (
      !window.confirm(
        `¿Eliminar el tipo "${type.name}"? Si tiene solicitudes se desactivará en lugar de borrarse.`
      )
    ) {
      return;
    }
    try {
      const data = await fetchJson<{ deleted: boolean; deactivated: boolean }>(
        `/api/admin/ticket-types/${type.id}`,
        { method: "DELETE" }
      );
      toast(
        data.deactivated
          ? "El tipo tenía solicitudes: se desactivó en lugar de eliminarse."
          : "Tipo eliminado correctamente.",
        "success"
      );
      await loadTypes();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al eliminar", "error");
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      {!formOpen && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-violet-900">Tipo de Solicitud</h3>
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm [@media(hover:hover)]:hover:from-violet-700 [@media(hover:hover)]:hover:to-purple-700"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              Nuevo tipo
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-gray-500">Cargando tipos...</p>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
              <button
                onClick={loadTypes}
                className="ml-2 font-medium underline hover:no-underline"
              >
                Reintentar
              </button>
            </div>
          ) : types.length === 0 ? (
            <p className="rounded-xl border border-violet-100 bg-white px-4 py-8 text-center text-sm text-gray-400">
              No hay tipos de solicitud. Crea el primero.
            </p>
          ) : (
            <ul className="space-y-2">
              {types.map((type) => (
                <li
                  key={type.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-violet-100 bg-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {type.name}
                      </span>
                      {!type.active && (
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                          inactivo
                        </span>
                      )}
                    </div>
                    <p className="truncate text-sm text-gray-500">
                      {type.description ?? "Sin descripción"} ·{" "}
                      {type.fields?.length ?? 0} campos
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => openEdit(type)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-violet-800 [@media(hover:hover)]:hover:bg-violet-50"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(type)}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                    >
                      Eliminar
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
            <h3 className="text-lg font-bold text-gray-900">
              {editing ? `Editar: ${editing.name}` : "Nuevo tipo de solicitud"}
            </h3>
            <button
              onClick={closeForm}
              className="rounded-lg px-3 py-1.5 text-sm text-gray-500 [@media(hover:hover)]:hover:bg-violet-50"
            >
              Cancelar
            </button>
          </div>

          <div className="space-y-4 rounded-xl border border-violet-100 bg-white p-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Nombre
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                placeholder="Ej. Carta de no adeudo"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Descripción
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
              />
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="rounded border-gray-200 text-emerald-600 focus:ring-emerald-500"
              />
              Activo
            </label>
          </div>

          {/* Constructor de campos */}
          <div className="space-y-3 rounded-xl border border-violet-100 bg-white p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-violet-800">
                Campos del formulario
              </h4>
              <button
                onClick={() => setFields((prev) => [...prev, emptyField()])}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-violet-800 [@media(hover:hover)]:hover:bg-violet-50"
              >
                + Agregar campo
              </button>
            </div>

            {fields.length === 0 ? (
              <p className="text-sm text-gray-400">
                Sin campos. Agrega los datos que el cliente debe capturar.
              </p>
            ) : (
              <ul className="space-y-3">
                {fields.map((field, index) => (
                  <li
                    key={field.uid}
                    className="rounded-lg border border-violet-100 bg-violet-50/40 p-3"
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex flex-col gap-1 pt-1">
                        <button
                          onClick={() => moveField(index, -1)}
                          disabled={index === 0}
                          className="rounded border border-gray-200 bg-white px-1.5 text-xs text-violet-700 disabled:opacity-30"
                          aria-label="Subir"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveField(index, 1)}
                          disabled={index === fields.length - 1}
                          className="rounded border border-gray-200 bg-white px-1.5 text-xs text-violet-700 disabled:opacity-30"
                          aria-label="Bajar"
                        >
                          ↓
                        </button>
                      </div>

                      <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-500">
                            Etiqueta
                          </label>
                          <input
                            value={field.label}
                            onChange={(e) =>
                              updateField(field.uid, { label: e.target.value })
                            }
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                            placeholder="Ej. Número de vivienda"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-500">
                            Tipo de campo
                          </label>
                          <select
                            value={field.fieldType}
                            onChange={(e) =>
                              updateField(field.uid, {
                                fieldType: e.target.value as FieldType,
                              })
                            }
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                          >
                            {FIELD_TYPES.map((ft) => (
                              <option key={ft} value={ft}>
                                {FIELD_TYPE_LABELS[ft]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-500">
                            Clave (opcional)
                          </label>
                          <input
                            value={field.fieldKey}
                            onChange={(e) =>
                              updateField(field.uid, {
                                fieldKey: e.target.value,
                              })
                            }
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-mono text-gray-900"
                            placeholder={slugify(field.label) || "auto"}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-500">
                            Placeholder (opcional)
                          </label>
                          <input
                            value={field.placeholder}
                            onChange={(e) =>
                              updateField(field.uid, {
                                placeholder: e.target.value,
                              })
                            }
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                          />
                        </div>

                        {field.fieldType === "select" && (
                          <div className="sm:col-span-2">
                            <label className="mb-1 block text-xs font-medium text-gray-500">
                              Opciones de la lista
                            </label>
                            <div className="space-y-2">
                              {field.options.map((opt, optIndex) => (
                                <div
                                  key={optIndex}
                                  className="flex items-center gap-2"
                                >
                                  <input
                                    value={opt}
                                    onChange={(e) => {
                                      const options = [...field.options];
                                      options[optIndex] = e.target.value;
                                      updateField(field.uid, { options });
                                    }}
                                    className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                                    placeholder={`Opción ${optIndex + 1}`}
                                  />
                                  <button
                                    onClick={() =>
                                      updateField(field.uid, {
                                        options: field.options.filter(
                                          (_, i) => i !== optIndex
                                        ),
                                      })
                                    }
                                    className="rounded-lg border border-red-200 px-2 py-1.5 text-xs text-red-600 hover:bg-red-50"
                                  >
                                    Quitar
                                  </button>
                                </div>
                              ))}
                              <button
                                onClick={() =>
                                  updateField(field.uid, {
                                    options: [...field.options, ""],
                                  })
                                }
                                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-white"
                              >
                                + Agregar opción
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between sm:col-span-2">
                          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={field.required}
                              onChange={(e) =>
                                updateField(field.uid, {
                                  required: e.target.checked,
                                })
                              }
                              className="rounded border-gray-200 text-emerald-600 focus:ring-emerald-500"
                            />
                            Requerido
                          </label>
                          <button
                            onClick={() => removeField(field.uid)}
                            className="text-sm text-red-600 hover:text-red-800"
                          >
                            Eliminar campo
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Plantilla de carta */}
          <div className="space-y-2 rounded-xl border border-violet-100 bg-white p-4">
            <label className="block text-sm font-semibold text-violet-800">
              Plantilla de la carta (HTML)
            </label>
            <textarea
              value={letterTemplate}
              onChange={(e) => setLetterTemplate(e.target.value)}
              rows={10}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-sm text-gray-900"
              placeholder="<h1>Carta {{folio}}</h1><p>Estimado(a) {{cliente_nombre}}...</p>"
            />
            <div className="rounded-lg bg-violet-50/40 px-3 py-2">
              <p className="text-xs font-medium text-violet-700">
                Placeholders disponibles:
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {availablePlaceholders.map((ph) => (
                  <code
                    key={ph}
                    className="rounded bg-violet-100 px-1.5 py-0.5 text-[11px] text-gray-700"
                  >
                    {ph}
                  </code>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={closeForm}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-violet-800 [@media(hover:hover)]:hover:bg-violet-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? "Guardando..." : editing ? "Guardar cambios" : "Crear tipo"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
