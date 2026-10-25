"use client";

import { useEffect, useState } from "react";
import {
  DetailPopup,
  detailBtnPress,
} from "@/components/residentes/DetailPopup";
import { crmFetch, errorMessage, parseTagsInput, pathId } from "./helpers";
import type { Prospecto } from "./types";

const fieldClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-base text-gray-900 placeholder-gray-400 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400 sm:text-sm";

function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-gray-600">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-gray-400">{hint}</p> : null}
    </div>
  );
}

export function ProspectoFormModal({
  open,
  prospecto,
  onClose,
  onSaved,
}: {
  open: boolean;
  prospecto: Prospecto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(prospecto?.name ?? "");
    setPhone(prospecto?.phone ?? "");
    setEmail(prospecto?.email ?? "");
    setCompany(prospecto?.company ?? "");
    setNotes(prospecto?.notes ?? "");
    setTags(
      Array.isArray(prospecto?.tags)
        ? prospecto.tags.join(", ")
        : typeof prospecto?.tags === "string"
          ? prospecto.tags
          : ""
    );
    setError("");
    setSaving(false);
  }, [open, prospecto]);

  async function handleSave() {
    if (!name.trim() || !phone.trim()) {
      setError("Nombre y teléfono son obligatorios.");
      return;
    }
    setSaving(true);
    setError("");
    const body = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      company: company.trim() || undefined,
      notes: notes.trim() || undefined,
      tags: parseTagsInput(tags),
    };
    try {
      if (prospecto) {
        await crmFetch(`/api/admin/crm/prospectos/${pathId(prospecto.id)}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await crmFetch("/api/admin/crm/prospectos", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err, "No se pudo guardar el prospecto."));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const isEditing = Boolean(prospecto);

  return (
    <DetailPopup
      title={isEditing ? "Editar Prospecto" : "Nuevo Prospecto"}
      onClose={onClose}
      footer={
        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className={detailBtnPress(
              "rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 [@media(hover:hover)]:hover:bg-gray-50"
            )}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className={detailBtnPress(
              "rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 px-6 py-2 text-sm font-medium text-white [@media(hover:hover)]:hover:from-violet-700 [@media(hover:hover)]:hover:to-purple-700 disabled:opacity-50"
            )}
          >
            {saving ? "Guardando…" : isEditing ? "Guardar Cambios" : "Dar de Alta"}
          </button>
        </div>
      }
    >
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <fieldset>
        <legend className="mb-3 block w-full border-b border-violet-200 pb-1.5 text-base font-semibold text-violet-700">
          Datos Generales
        </legend>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field label="Nombre" htmlFor="crm-p-name" required>
              <input
                id="crm-p-name"
                className={fieldClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
              />
            </Field>
          </div>
          <Field label="Teléfono" htmlFor="crm-p-phone" required>
            <input
              id="crm-p-phone"
              className={fieldClass}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="3312345678"
              inputMode="tel"
              autoComplete="off"
            />
          </Field>
          <Field label="Email" htmlFor="crm-p-email">
            <input
              id="crm-p-email"
              type="email"
              className={fieldClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field label="Empresa" htmlFor="crm-p-company">
            <input
              id="crm-p-company"
              className={fieldClass}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field
            label="Etiquetas"
            htmlFor="crm-p-tags"
            hint="Separadas por coma. Ej. lead, whatsapp"
          >
            <input
              id="crm-p-tags"
              className={fieldClass}
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="lead, whatsapp"
              autoComplete="off"
            />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-3 block w-full border-b border-violet-200 pb-1.5 text-base font-semibold text-violet-700">
          Notas
        </legend>
        <textarea
          id="crm-p-notes"
          className={`${fieldClass} min-h-[120px]`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </fieldset>
    </DetailPopup>
  );
}
