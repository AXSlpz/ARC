"use client";

import { useId, useRef, type ReactNode } from "react";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_FILES,
  ATTACHMENT_TYPES_LABEL,
  formatBytes,
} from "./portalClient";

/**
 * Selector de archivos controlado y reutilizable (alta de ticket y comentarios).
 * El padre conserva la lista de `File`; aquí se muestran reglas, la lista
 * seleccionada y validaciones locales (tamaño y cantidad) antes de enviar.
 */
export function AttachmentPicker({
  files,
  onChange,
  disabled,
  beforeHint = null,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  /** Se pinta entre el selector y el texto de tipos y tamaño. */
  beforeHint?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputId = useId();

  const localError = (() => {
    if (files.length > ATTACHMENT_MAX_FILES) {
      return `Máximo ${ATTACHMENT_MAX_FILES} archivos por envío.`;
    }
    const tooBig = files.find((f) => f.size > ATTACHMENT_MAX_BYTES);
    if (tooBig) {
      return `"${tooBig.name}" supera el máximo de 10 MB.`;
    }
    return "";
  })();

  const handleSelect = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    // Evita duplicados por nombre+tamaño y respeta el máximo permitido.
    const merged = [...files];
    for (const file of incoming) {
      const dup = merged.some(
        (f) => f.name === file.name && f.size === file.size,
      );
      if (!dup) merged.push(file);
    }
    onChange(merged.slice(0, ATTACHMENT_MAX_FILES));
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeAt = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          disabled={disabled}
          onChange={(e) => handleSelect(e.target.files)}
          className="sr-only"
        />
        <label
          htmlFor={inputId}
          className={`shrink-0 cursor-pointer rounded-lg bg-slate-100 px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 ${disabled ? "pointer-events-none opacity-50" : ""}`}
        >
          Anexa Archivo
        </label>
        {beforeHint}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        {ATTACHMENT_TYPES_LABEL}. Máx. 10 MB por archivo, hasta{" "}
        {ATTACHMENT_MAX_FILES} archivos.
      </p>

      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${index}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-slate-700">
                  {file.name}
                </span>
                <span className="text-xs text-slate-400">
                  {formatBytes(file.size)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => removeAt(index)}
                disabled={disabled}
                className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      {localError && <p className="mt-2 text-sm text-rose-600">{localError}</p>}
    </div>
  );
}
