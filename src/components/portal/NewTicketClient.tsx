"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Ticket, TicketType, TicketTypeField } from "@/lib/portal/types";
import {
  ATTACHMENT_MAX_FILES,
  fetchJson,
  uploadAttachments,
} from "@/components/portal/portalClient";
import { AttachmentPicker } from "@/components/portal/AttachmentPicker";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40";

const primaryBtnClass =
  "w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50 sm:w-auto";

const secondaryBtnClass =
  "w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-center text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 sm:w-auto";

/**
 * Decisión campo "file": ahora SÍ se sube el archivo real. El campo dinámico de
 * tipo `file` no guarda un value string en la creación del ticket (se manda el
 * nombre sólo como referencia legible para el admin) y el archivo se sube como
 * adjunto general del ticket vía /attachments tras crearlo.
 */
function DynamicField({
  field,
  value,
  onChange,
}: {
  field: TicketTypeField;
  value: string;
  onChange: (value: string) => void;
}) {
  const commonProps = {
    id: `field-${field.fieldKey}`,
    required: field.required,
  };

  switch (field.fieldType) {
    case "textarea":
      return (
        <textarea
          {...commonProps}
          rows={4}
          value={value}
          placeholder={field.placeholder ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      );
    case "number":
      return (
        <input
          {...commonProps}
          type="number"
          value={value}
          placeholder={field.placeholder ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      );
    case "date":
      return (
        <input
          {...commonProps}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      );
    case "phone":
      return (
        <input
          {...commonProps}
          type="tel"
          value={value}
          placeholder={field.placeholder ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      );
    case "select":
      return (
        <select
          {...commonProps}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        >
          <option value="">Selecciona una opción</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    case "boolean":
      return (
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            id={commonProps.id}
            type="checkbox"
            checked={value === "sí"}
            onChange={(e) => onChange(e.target.checked ? "sí" : "no")}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          Sí
        </label>
      );
    case "text":
    default:
      return (
        <input
          {...commonProps}
          type="text"
          value={value}
          placeholder={field.placeholder ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      );
  }
}

/** Divide una lista de archivos en lotes que respetan el máximo por envío. */
function chunkFiles(files: File[], size: number): File[][] {
  const chunks: File[][] = [];
  for (let i = 0; i < files.length; i += size) {
    chunks.push(files.slice(i, i + size));
  }
  return chunks;
}

export function NewTicketClient({
  initialTypes,
  initialError = "",
}: {
  initialTypes: TicketType[];
  initialError?: string;
}) {
  const router = useRouter();
  const [loadError] = useState(initialError);
  const [types] = useState<TicketType[]>(initialTypes);
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [fileFields, setFileFields] = useState<Record<string, File[]>>({});
  const [generalFiles, setGeneralFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [uploadNotice, setUploadNotice] = useState("");

  const selectedType = useMemo(
    () => types.find((t) => t.id === selectedTypeId) ?? null,
    [types, selectedTypeId],
  );

  const fields = useMemo<TicketTypeField[]>(() => {
    const list = selectedType?.fields ?? [];
    return [...list].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [selectedType]);

  const chooseType = (type: TicketType) => {
    setSelectedTypeId(type.id);
    setValues({});
    setFileFields({});
    setGeneralFiles([]);
    setSubmitError("");
    setUploadNotice("");
  };

  const setFieldValue = (fieldKey: string, value: string) => {
    setValues((prev) => ({ ...prev, [fieldKey]: value }));
  };

  const setFileFieldValue = (fieldKey: string, files: File[]) => {
    setFileFields((prev) => ({ ...prev, [fieldKey]: files }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType) return;

    const missing = fields.find((f) => {
      if (!f.required) return false;
      if (f.fieldType === "file") return (fileFields[f.fieldKey] ?? []).length === 0;
      return !(values[f.fieldKey] ?? "").trim();
    });
    if (missing) {
      setSubmitError(`El campo "${missing.label}" es obligatorio`);
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    setUploadNotice("");
    try {
      // 1) Crear el ticket. Los campos file no mandan archivo aquí: sólo el
      //    nombre como referencia legible (o null si no se adjuntó nada).
      const payload = {
        ticketTypeId: selectedType.id,
        values: fields.map((f) => {
          if (f.fieldType === "file") {
            const names = (fileFields[f.fieldKey] ?? [])
              .map((file) => file.name)
              .join(", ");
            return { fieldKey: f.fieldKey, value: names || null };
          }
          return {
            fieldKey: f.fieldKey,
            value: (values[f.fieldKey] ?? "").trim() || null,
          };
        }),
      };
      const data = await fetchJson<{ ticket: Ticket }>("/api/portal/tickets", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const ticketId = data.ticket.id;

      // 2) Subir todos los archivos (generales + de campos file) como adjuntos
      //    generales del ticket, en lotes de máximo ATTACHMENT_MAX_FILES.
      const allFiles = [
        ...generalFiles,
        ...fields
          .filter((f) => f.fieldType === "file")
          .flatMap((f) => fileFields[f.fieldKey] ?? []),
      ];
      const uploadErrors: string[] = [];
      for (const batch of chunkFiles(allFiles, ATTACHMENT_MAX_FILES)) {
        try {
          const result = await uploadAttachments(ticketId, batch);
          uploadErrors.push(...result.errors);
        } catch (err) {
          uploadErrors.push(
            err instanceof Error ? err.message : "Error al subir archivos",
          );
        }
      }

      if (uploadErrors.length > 0) {
        // El ticket ya se creó; avisamos y navegamos igualmente al detalle.
        setUploadNotice(
          `Ticket creado. Algunos archivos no se subieron: ${uploadErrors.join(", ")}`,
        );
      }
      router.replace(`/portal/tickets/${ticketId}`);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "No se pudo crear la solicitud",
      );
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <Link
          href="/portal/tickets"
          className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
        >
          ← Volver
        </Link>
      </div>

      <h1 className="mb-1 text-xl font-bold text-slate-900 sm:text-2xl">
        Nueva solicitud
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        {selectedType
          ? "Completa los datos de tu solicitud."
          : "Elige el tipo de solicitud que deseas crear."}
      </p>

      {loadError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {loadError}
        </div>
      )}

      {!loadError && !selectedType && (
        <>
          {types.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
              No hay tipos de solicitud disponibles por el momento.
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {types.map((type) => (
                <li key={type.id}>
                  <button
                    type="button"
                    onClick={() => chooseType(type)}
                    className="flex h-full w-full flex-col rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50/40"
                  >
                    <span className="text-sm font-semibold text-slate-900">
                      {type.name}
                    </span>
                    {type.description && (
                      <span className="mt-1 text-sm text-slate-500">
                        {type.description}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {!loadError && selectedType && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {selectedType.name}
              </p>
              {selectedType.description && (
                <p className="mt-0.5 text-sm text-slate-500">
                  {selectedType.description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectedTypeId(null)}
              className="shrink-0 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
            >
              Cambiar tipo
            </button>
          </div>

          <div className="space-y-4">
            {fields.length === 0 && (
              <p className="text-sm text-slate-500">
                Este tipo de solicitud no requiere datos adicionales.
              </p>
            )}
            {fields.map((field) => (
              <div key={field.id}>
                <label
                  htmlFor={`field-${field.fieldKey}`}
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  {field.label}
                  {field.required && (
                    <span className="ml-0.5 text-rose-500">*</span>
                  )}
                </label>
                {field.fieldType === "file" ? (
                  <AttachmentPicker
                    files={fileFields[field.fieldKey] ?? []}
                    onChange={(f) => setFileFieldValue(field.fieldKey, f)}
                    disabled={submitting}
                  />
                ) : (
                  <DynamicField
                    field={field}
                    value={values[field.fieldKey] ?? ""}
                    onChange={(v) => setFieldValue(field.fieldKey, v)}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Archivos generales de la solicitud */}
          <div className="mt-6 border-t border-slate-100 pt-5">
            <p className="mb-1.5 text-sm font-medium text-slate-700">
              Archivos de la solicitud (opcional)
            </p>
            <p className="mb-2 text-xs text-slate-500">
              Adjunta documentos o fotos que respalden tu solicitud.
            </p>
            <AttachmentPicker
              files={generalFiles}
              onChange={setGeneralFiles}
              disabled={submitting}
            />
          </div>

          {submitError && (
            <p className="mt-4 text-sm text-rose-600">{submitError}</p>
          )}
          {uploadNotice && (
            <p className="mt-4 text-sm text-amber-600">{uploadNotice}</p>
          )}

          <div className="mt-6 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
            <Link href="/portal/tickets" className={secondaryBtnClass}>
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className={primaryBtnClass}
            >
              {submitting ? "Enviando…" : "Enviar solicitud"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
