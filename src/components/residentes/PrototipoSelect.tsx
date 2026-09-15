"use client";

import { useCallback, useEffect, useState } from "react";

interface Prototipo {
  id: number;
  condominio_id: number;
  name: string;
  active: boolean;
}

interface PrototipoSelectProps {
  condominioId: number | null;
  value: number | null;
  onChange: (prototipoId: number | null) => void;
}

export function PrototipoSelect({
  condominioId,
  value,
  onChange,
}: PrototipoSelectProps) {
  const [options, setOptions] = useState<Prototipo[]>([]);
  const [loading, setLoading] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!condominioId) {
      setOptions([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/condominios/${condominioId}/prototipos?all=1`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al cargar prototipos");
      const list = (json.data as Prototipo[]).filter((p) => p.active);
      setOptions(list);
      if (value != null && !list.some((p) => p.id === value)) {
        onChange(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [condominioId, onChange, value]);

  useEffect(() => {
    void load();
  }, [condominioId]); // eslint-disable-line react-hooks/exhaustive-deps -- reload on condo change only

  const openNew = () => {
    setEditingId(null);
    setDraftName("");
    setManageOpen(true);
    setError("");
  };

  const openEdit = (p: Prototipo) => {
    setEditingId(p.id);
    setDraftName(p.name);
    setManageOpen(true);
    setError("");
  };

  const handleSave = async () => {
    if (!condominioId) return;
    if (!draftName.trim()) {
      setError("Escribe un nombre");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const url =
        editingId != null
          ? `/api/prototipos/${editingId}`
          : `/api/condominios/${condominioId}/prototipos`;
      const method = editingId != null ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draftName.trim(), active: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al guardar");
      const saved = json.data as Prototipo;
      setManageOpen(false);
      setEditingId(null);
      setDraftName("");
      await load();
      if (editingId == null) onChange(saved.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: Prototipo) => {
    if (!window.confirm(`¿Eliminar el prototipo "${p.name}"?`)) return;
    setError("");
    try {
      const res = await fetch(`/api/prototipos/${p.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al eliminar");
      if (value === p.id) onChange(null);
      if (editingId === p.id) {
        setManageOpen(false);
        setEditingId(null);
        setDraftName("");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
    }
  };

  return (
    <div className="col-span-2 md:col-span-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="block text-xs font-medium text-gray-600">
          Prototipo
        </label>
        <button
          type="button"
          disabled={!condominioId}
          onClick={() => {
            setManageOpen((o) => !o);
            setError("");
            if (!manageOpen) {
              setEditingId(null);
              setDraftName("");
            }
          }}
          className="text-[11px] font-medium text-violet-700 hover:text-violet-900 disabled:text-gray-300"
        >
          {manageOpen ? "Cerrar opciones" : "Editar opciones"}
        </button>
      </div>

      <select
        value={value ?? ""}
        disabled={!condominioId || loading}
        onChange={(e) =>
          onChange(e.target.value ? Number(e.target.value) : null)
        }
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-violet-400 focus:outline-none disabled:bg-gray-50"
      >
        <option value="">
          {!condominioId
            ? "Selecciona un condominio primero"
            : loading
              ? "Cargando…"
              : "Selecciona prototipo…"}
        </option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      {manageOpen && condominioId && (
        <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/60 p-3 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder={
                editingId != null ? "Renombrar prototipo" : "Nuevo prototipo"
              }
              className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-violet-400 focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {editingId != null ? "Guardar" : "Agregar"}
              </button>
              {editingId != null && (
                <button
                  type="button"
                  onClick={openNew}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Nuevo
                </button>
              )}
            </div>
          </div>

          {options.length === 0 ? (
            <p className="text-xs text-gray-500">
              Aún no hay prototipos. Agrega el primero arriba.
            </p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {options.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 text-sm"
                >
                  <span className="truncate text-gray-800">{p.name}</span>
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="rounded px-2 py-0.5 text-[11px] text-violet-700 hover:bg-violet-100"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(p)}
                      className="rounded px-2 py-0.5 text-[11px] text-rose-600 hover:bg-rose-50"
                    >
                      Eliminar
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      <p className="mt-1 text-[10px] text-gray-400">
        Opciones por condominio. Puedes agregar o editarlas aquí mismo.
      </p>
    </div>
  );
}
