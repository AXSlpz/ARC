"use client";

import { useEffect, useId, useState } from "react";

export interface ManualIneInput {
  nombre: string;
  fechaNacimiento: string;
  curp: string;
  anioVencimiento: string;
  claveElector: string;
}

const EMPTY: ManualIneInput = {
  nombre: "",
  fechaNacimiento: "",
  curp: "",
  anioVencimiento: "",
  claveElector: "",
};

export function IneManualDialog({
  open,
  saving,
  error,
  onClose,
  onSave,
}: {
  open: boolean;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (input: ManualIneInput) => void;
}) {
  const titleId = useId();
  const [values, setValues] = useState<ManualIneInput>(EMPTY);

  useEffect(() => {
    if (!open) return;
    setValues(EMPTY);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || saving) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, saving]);

  if (!open) return null;

  const set = (key: keyof ManualIneInput, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/50 p-3 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90dvh] w-full max-w-md overflow-auto rounded-2xl bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">
            Ingresar manualmente
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Cerrar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-700"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          El nombre debe coincidir con la INE guardada. La vigencia no puede ser de un año anterior.
        </p>
        <div className="mt-4 space-y-3">
          <Field label="Nombre" value={values.nombre} onChange={(value) => set("nombre", value)} autoComplete="name" />
          <Field
            label="Nacimiento"
            value={values.fechaNacimiento}
            placeholder="DD/MM/AAAA"
            onChange={(value) => set("fechaNacimiento", value)}
          />
          <Field
            label="CURP"
            value={values.curp}
            onChange={(value) => set("curp", value.toUpperCase())}
            autoComplete="off"
          />
          <Field
            label="Vigencia"
            value={values.anioVencimiento}
            inputMode="numeric"
            placeholder="AAAA"
            onChange={(value) => set("anioVencimiento", value.replace(/\D/g, "").slice(0, 4))}
          />
          <Field
            label="Clave de elector"
            value={values.claveElector}
            onChange={(value) => set("claveElector", value.toUpperCase())}
            autoComplete="off"
          />
        </div>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-rose-600">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={saving}
          onClick={() => onSave(values)}
          className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar datos"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: "numeric" | "text";
  autoComplete?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-base text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 sm:text-sm"
      />
    </div>
  );
}
