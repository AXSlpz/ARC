"use client";

import { useState, useEffect, useMemo } from "react";
import { CondominioSelector } from "./CondominioSelector";
import { FechaInput } from "./FechaInput";
import { PrototipoSelect } from "./PrototipoSelect";

interface Condominio {
  id: number;
  name: string;
  prefijo: string;
  tipo: "Vivienda" | "Terrenos" | "Torres";
}

interface ResidenteData {
  id?: number;
  condominio_id: number | null;
  num_vivienda: number | null;
  num_coto: string | null;
  prototipo_id: number | null;
  nombre: string;
  celular: number | null;
  email: string | null;
  metros_cuadrados: number | null;
  nombre_contacto1: string | null;
  celular_contacto1: number | null;
  parentesco_contacto1: string | null;
  nombre_contacto2: string | null;
  celular_contacto2: number | null;
  parentesco_contacto2: string | null;
  nombre_contacto3: string | null;
  celular_contacto3: number | null;
  parentesco_contacto3: string | null;
  nombre_expropietario: string | null;
  celular_expropietario: number | null;
  fecha_entrega_primer: string | null;
}

const EMPTY: ResidenteData = {
  condominio_id: null,
  num_vivienda: null,
  num_coto: null,
  prototipo_id: null,
  nombre: "",
  celular: null,
  email: null,
  metros_cuadrados: null,
  nombre_contacto1: null,
  celular_contacto1: null,
  parentesco_contacto1: null,
  nombre_contacto2: null,
  celular_contacto2: null,
  parentesco_contacto2: null,
  nombre_contacto3: null,
  celular_contacto3: null,
  parentesco_contacto3: null,
  nombre_expropietario: null,
  celular_expropietario: null,
  fecha_entrega_primer: null,
};

interface ResidenteFormProps {
  initial?: ResidenteData | null;
  prefill?: {
    nombre?: string;
    celular?: number | null;
    email?: string | null;
    condominio_id?: number;
  } | null;
  condominios: Condominio[];
  onSave: (data: ResidenteData) => Promise<void>;
  onCancel: () => void;
  onCondominioCreated?: (c: Condominio) => void;
  onCondominioUpdated?: (c: Condominio) => void;
  onCondominioDeleted?: (id: number) => void;
}

function NumberInput({
  label,
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
  integer,
  readOnly,
}: {
  label: string;
  value: number | null;
  onChange?: (v: number | null) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  integer?: boolean;
  readOnly?: boolean;
}) {
  const inputClass = `w-full rounded-lg border py-2 text-sm text-gray-900 focus:outline-none ${
    readOnly
      ? "border-violet-100 bg-violet-50 text-violet-800 cursor-default"
      : "border-gray-200 bg-white focus:border-violet-400"
  }`;

  return (
    <div>
      {label && (
        <label className="block text-xs font-medium text-gray-600 mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
            {prefix}
          </span>
        )}
        <input
          type={integer ? "number" : "text"}
          inputMode={integer ? "numeric" : "decimal"}
          step={integer ? "1" : "0.01"}
          value={value ?? ""}
          readOnly={readOnly}
          onChange={(e) => {
            if (readOnly || !onChange) return;
            const raw = e.target.value;
            if (raw === "") {
              onChange(null);
            } else {
              onChange(integer ? parseInt(raw, 10) : parseFloat(raw));
            }
          }}
          placeholder={placeholder}
          className={`${inputClass} ${prefix ? "pl-7 pr-3" : "px-3"} ${suffix ? "pr-10" : ""}`}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function contactCountFromData(data: ResidenteData): number {
  if (data.nombre_contacto3 || data.celular_contacto3 || data.parentesco_contacto3) return 3;
  if (data.nombre_contacto2 || data.celular_contacto2 || data.parentesco_contacto2) return 2;
  return 1;
}

export function ResidenteForm({
  initial,
  prefill,
  condominios,
  onSave,
  onCancel,
  onCondominioCreated,
  onCondominioUpdated,
  onCondominioDeleted,
}: ResidenteFormProps) {
  const [data, setData] = useState<ResidenteData>(() => {
    if (initial?.id) return { ...EMPTY, ...initial };
    if (prefill) {
      return {
        ...EMPTY,
        ...(prefill.condominio_id != null
          ? { condominio_id: prefill.condominio_id }
          : {}),
        ...(prefill.nombre != null ? { nombre: prefill.nombre } : {}),
        ...(prefill.celular !== undefined ? { celular: prefill.celular } : {}),
        ...(prefill.email !== undefined ? { email: prefill.email } : {}),
      };
    }
    return EMPTY;
  });
  const [contactCount, setContactCount] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isEditing = !!initial?.id;

  useEffect(() => {
    if (initial?.id) {
      const next = { ...EMPTY, ...initial };
      setData(next);
      setContactCount(contactCountFromData(next));
      return;
    }
    if (prefill) {
      const next = {
        ...EMPTY,
        ...(prefill.condominio_id != null
          ? { condominio_id: prefill.condominio_id }
          : {}),
        ...(prefill.nombre != null ? { nombre: prefill.nombre } : {}),
        ...(prefill.celular !== undefined ? { celular: prefill.celular } : {}),
        ...(prefill.email !== undefined ? { email: prefill.email } : {}),
      };
      setData(next);
      setContactCount(contactCountFromData(next));
      return;
    }
    setData(EMPTY);
    setContactCount(1);
  }, [initial, prefill]);

  const set = <K extends keyof ResidenteData>(key: K, val: ResidenteData[K]) =>
    setData((prev) => {
      if (key === "condominio_id" && prev.condominio_id !== val) {
        return { ...prev, condominio_id: val as number | null, prototipo_id: null };
      }
      return { ...prev, [key]: val };
    });

  const selectedCondo = useMemo(
    () => condominios.find((c) => c.id === data.condominio_id) ?? null,
    [condominios, data.condominio_id]
  );

  const numCoto = useMemo(() => {
    if (!selectedCondo?.prefijo || data.num_vivienda == null) return null;
    return `${selectedCondo.prefijo}-${data.num_vivienda}`;
  }, [selectedCondo, data.num_vivienda]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data.condominio_id) {
      setError("Selecciona un condominio");
      return;
    }
    if (!data.nombre.trim()) {
      setError("El nombre es obligatorio");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSave({
        ...data,
        num_coto: numCoto,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const removeContact = (n: 2 | 3) => {
    if (n === 3) {
      setData((prev) => ({
        ...prev,
        nombre_contacto3: null,
        celular_contacto3: null,
        parentesco_contacto3: null,
      }));
      setContactCount(2);
    } else {
      setData((prev) => ({
        ...prev,
        nombre_contacto2: prev.nombre_contacto3,
        celular_contacto2: prev.celular_contacto3,
        parentesco_contacto2: prev.parentesco_contacto3,
        nombre_contacto3: null,
        celular_contacto3: null,
        parentesco_contacto3: null,
      }));
      setContactCount((c) => Math.max(1, c - 1));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto pt-8 pb-8">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl mx-4"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl border-b border-violet-100 bg-gradient-to-r from-violet-600 to-purple-600 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">
            {isEditing ? "Editar Residente" : "Nuevo Residente"}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="text-white/80 hover:text-white"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          <fieldset>
            <legend className="text-base font-semibold text-violet-700 border-b border-violet-200 pb-1.5 mb-3 w-full block">
              Datos Generales
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <CondominioSelector
                  condominios={condominios}
                  value={data.condominio_id}
                  onChange={(id) => set("condominio_id", id)}
                  onCreated={onCondominioCreated}
                  onUpdated={onCondominioUpdated}
                  onDeleted={onCondominioDeleted}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Nombre <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={data.nombre}
                  onChange={(e) => set("nombre", e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-violet-400 focus:outline-none"
                  required
                />
              </div>
              <NumberInput
                label="Celular"
                value={data.celular}
                onChange={(v) => set("celular", v)}
                integer
                placeholder="3312345678"
              />
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={data.email ?? ""}
                  onChange={(e) => set("email", e.target.value || null)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-violet-400 focus:outline-none"
                />
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-base font-semibold text-violet-700 border-b border-violet-200 pb-1.5 mb-3 w-full block">
              Vivienda
            </legend>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <NumberInput
                label="Num° Vivienda"
                value={data.num_vivienda}
                onChange={(v) => set("num_vivienda", v)}
                integer
              />
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Num° Coto
                </label>
                <input
                  type="text"
                  value={numCoto ?? ""}
                  readOnly
                  placeholder="Prefijo-Vivienda"
                  className="w-full rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 text-sm text-violet-800 cursor-default"
                />
                <p className="mt-1 text-[10px] text-gray-400">
                  Automático: prefijo + vivienda
                </p>
              </div>
              <PrototipoSelect
                condominioId={data.condominio_id}
                value={data.prototipo_id}
                onChange={(id) => set("prototipo_id", id)}
              />
              <NumberInput
                label="m²"
                value={data.metros_cuadrados}
                onChange={(v) => set("metros_cuadrados", v)}
                suffix="m²"
              />
            </div>
          </fieldset>

          <fieldset>
            <div className="mb-3 flex w-full items-center justify-between border-b border-violet-200 pb-1.5">
              <legend className="text-base font-semibold text-violet-700">
                Contactos
              </legend>
              {contactCount < 3 && (
                <button
                  type="button"
                  onClick={() => setContactCount((c) => Math.min(3, c + 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-violet-300 px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Agregar contacto
                </button>
              )}
            </div>

            {Array.from({ length: contactCount }, (_, i) => i + 1).map((n) => {
              const nombreKey = `nombre_contacto${n}` as keyof ResidenteData;
              const celularKey = `celular_contacto${n}` as keyof ResidenteData;
              const parentescoKey = `parentesco_contacto${n}` as keyof ResidenteData;
              return (
                <div key={n} className="mb-4 last:mb-0">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-violet-500">
                      Contacto {n}
                    </p>
                    {n > 1 && (
                      <button
                        type="button"
                        onClick={() => removeContact(n as 2 | 3)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Nombre
                      </label>
                      <input
                        type="text"
                        value={(data[nombreKey] as string | null) ?? ""}
                        onChange={(e) => set(nombreKey, (e.target.value || null) as never)}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-violet-400 focus:outline-none"
                      />
                    </div>
                    <NumberInput
                      label="Celular"
                      value={data[celularKey] as number | null}
                      onChange={(v) => set(celularKey, v as never)}
                      integer
                    />
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Parentesco
                      </label>
                      <input
                        type="text"
                        value={(data[parentescoKey] as string | null) ?? ""}
                        onChange={(e) => set(parentescoKey, (e.target.value || null) as never)}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-violet-400 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </fieldset>

          <fieldset>
            <legend className="text-base font-semibold text-violet-700 border-b border-violet-200 pb-1.5 mb-3 w-full block">
              Ex-Propietario
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Nombre ExPropietario
                </label>
                <input
                  type="text"
                  value={data.nombre_expropietario ?? ""}
                  onChange={(e) => set("nombre_expropietario", e.target.value || null)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-violet-400 focus:outline-none"
                />
              </div>
              <NumberInput
                label="Celular ExPropietario"
                value={data.celular_expropietario}
                onChange={(v) => set("celular_expropietario", v)}
                integer
              />
              <FechaInput
                label="Fecha Entrega 1er"
                value={data.fecha_entrega_primer}
                onChange={(v) => set("fecha_entrega_primer", v)}
              />
            </div>
          </fieldset>
        </div>

        {error && (
          <div className="mx-6 mb-2 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-violet-100 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 px-6 py-2 text-sm font-medium text-white hover:from-violet-700 hover:to-purple-700 disabled:opacity-50"
          >
            {saving
              ? "Guardando..."
              : isEditing
                ? "Guardar Cambios"
                : "Dar de Alta"}
          </button>
        </div>
      </form>
    </div>
  );
}
