"use client";

import { useEffect, useState } from "react";

const TIPOS = ["Vivienda", "Terrenos", "Torres"] as const;
type Tipo = (typeof TIPOS)[number];

const ESTATUS = ["Activo", "Entregado"] as const;
type Estatus = (typeof ESTATUS)[number];

interface Condominio {
  id: number;
  name: string;
  prefijo: string;
  tipo: Tipo;
  estatus?: Estatus;
}

type Mode = "select" | "create" | "edit";

interface CondominioSelectorProps {
  condominios: Condominio[];
  value: number | null;
  onChange: (id: number | null) => void;
  onCreated?: (condominio: Condominio) => void;
  onUpdated?: (condominio: Condominio) => void;
  onDeleted?: (id: number) => void;
}

export function CondominioSelector({
  condominios,
  value,
  onChange,
  onCreated,
  onUpdated,
  onDeleted,
}: CondominioSelectorProps) {
  const [mode, setMode] = useState<Mode>("select");
  const [formName, setFormName] = useState("");
  const [formPrefijo, setFormPrefijo] = useState("");
  const [formTipo, setFormTipo] = useState<Tipo>("Vivienda");
  const [formEstatus, setFormEstatus] = useState<Estatus>("Activo");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selected = condominios.find((c) => c.id === value) ?? null;

  useEffect(() => {
    if (mode === "select") {
      setFormName("");
      setFormPrefijo("");
      setFormTipo("Vivienda");
      setFormEstatus("Activo");
      setError("");
    }
  }, [mode]);

  const startEdit = () => {
    if (!selected) return;
    setFormName(selected.name);
    setFormPrefijo(selected.prefijo ?? "");
    setFormTipo(selected.tipo ?? "Vivienda");
    setFormEstatus(selected.estatus ?? "Activo");
    setMode("edit");
    setError("");
  };

  const handleCreate = async () => {
    if (!formName.trim() || !formPrefijo.trim()) {
      setError("Nombre y prefijo son obligatorios");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/condominios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          prefijo: formPrefijo.trim(),
          tipo: formTipo,
          estatus: formEstatus,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onChange(data.id);
        onCreated?.(data);
        setMode("select");
      } else {
        setError(data.error ?? "Error al crear");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!selected) return;
    if (!formName.trim() || !formPrefijo.trim()) {
      setError("Nombre y prefijo son obligatorios");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/condominios/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          prefijo: formPrefijo.trim(),
          tipo: formTipo,
          estatus: formEstatus,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onUpdated?.(data);
        setMode("select");
      } else {
        setError(data.error ?? "Error al actualizar");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (
      !window.confirm(
        `¿Eliminar "${selected.name}"? Solo es posible si no tiene residentes asignados.`
      )
    ) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/condominios/${selected.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        onDeleted?.(selected.id);
        onChange(null);
        setMode("select");
      } else {
        setError(data.error ?? "Error al eliminar");
      }
    } finally {
      setSaving(false);
    }
  };

  if (mode === "create" || mode === "edit") {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Condominio / Fraccionamiento <span className="text-red-500">*</span>
        </label>
        <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
          <p className="text-xs font-medium text-violet-700">
            {mode === "create" ? "Nuevo condominio" : `Editar: ${selected?.name}`}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-1">
                Nombre
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ej. LIMA"
                className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-violet-400 focus:outline-none"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-1">
                Prefijo
              </label>
              <input
                type="text"
                value={formPrefijo}
                onChange={(e) => setFormPrefijo(e.target.value)}
                placeholder="Ej. 17"
                className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-violet-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-1">
                Tipo
              </label>
              <select
                value={formTipo}
                onChange={(e) => setFormTipo(e.target.value as Tipo)}
                className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-violet-400 focus:outline-none"
              >
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-1">
                Estatus
              </label>
              <select
                value={formEstatus}
                onChange={(e) => setFormEstatus(e.target.value as Estatus)}
                className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-violet-400 focus:outline-none"
              >
                {ESTATUS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={mode === "create" ? handleCreate : handleUpdate}
              disabled={saving || !formName.trim() || !formPrefijo.trim()}
              className="rounded-lg bg-violet-600 px-3 py-2 text-sm text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {saving ? "..." : mode === "create" ? "Crear" : "Guardar"}
            </button>
            {mode === "edit" && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Eliminar
              </button>
            )}
            <button
              type="button"
              onClick={() => setMode("select")}
              disabled={saving}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Condominio / Fraccionamiento <span className="text-red-500">*</span>
      </label>
      <div className="flex gap-2">
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          className="flex-1 rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-violet-400 focus:outline-none"
        >
          <option value="">Selecciona...</option>
          {condominios.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.prefijo ? ` (${c.prefijo})` : " (sin prefijo)"}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={startEdit}
          disabled={!selected}
          title={selected ? "Editar condominio" : "Selecciona un condominio para editar"}
          className="rounded-lg border border-violet-300 px-3 py-2 text-sm text-violet-700 hover:bg-violet-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Editar
        </button>
        <button
          type="button"
          onClick={() => {
            setFormName("");
            setFormPrefijo("");
            setFormTipo("Vivienda");
            setFormEstatus("Activo");
            setMode("create");
            setError("");
          }}
          className="rounded-lg border border-violet-300 px-3 py-2 text-sm text-violet-700 hover:bg-violet-50"
          title="Agregar condominio"
        >
          + Nuevo
        </button>
      </div>
      {selected && !selected.prefijo && (
        <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
          Este condominio no tiene prefijo. Usa <strong>Editar</strong> para agregarlo.
        </p>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
