"use client";

import { useCallback, useEffect, useState } from "react";
import type { FinanceCategory, FinanceKind } from "@/lib/portal/types";
import { useToast } from "@/components/Toast";
import { fetchJson } from "./helpers";

interface CategoriesManagerProps {
  /** Notifica al padre que las categorías cambiaron (para recargar selects). */
  onChanged?: () => void;
}

const KIND_LABEL: Record<FinanceKind, string> = {
  income: "Ingresos",
  expense: "Egresos",
};

function CategoryColumn({
  kind,
  onChanged,
}: {
  kind: FinanceKind;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{ categories: FinanceCategory[] }>(
        `/api/admin/finance/categories?kind=${kind}`
      );
      setCategories(data.categories);
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Error al cargar categorías",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }, [kind, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await fetchJson("/api/admin/finance/categories", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), kind }),
      });
      setNewName("");
      toast("Categoría creada.", "success");
      await load();
      onChanged?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al crear", "error");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (cat: FinanceCategory) => {
    if (!window.confirm(`¿Eliminar la categoría "${cat.name}"?`)) return;
    try {
      const data = await fetchJson<{ deleted: boolean; deactivated: boolean }>(
        `/api/admin/finance/categories/${cat.id}`,
        { method: "DELETE" }
      );
      toast(
        data.deactivated
          ? "La categoría tenía registros: se desactivó."
          : "Categoría eliminada.",
        "success"
      );
      await load();
      onChanged?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al eliminar", "error");
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="text-sm font-semibold text-slate-800">{KIND_LABEL[kind]}</h4>
      <div className="mt-3 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
          placeholder="Nueva categoría"
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
        />
        <button
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
        >
          Agregar
        </button>
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-slate-500">Cargando...</p>
      ) : categories.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">Sin categorías.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {categories.map((cat) => (
            <li
              key={cat.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5"
            >
              <span className="text-sm text-slate-800">{cat.name}</span>
              <button
                onClick={() => handleDelete(cat)}
                className="text-xs text-red-600 hover:text-red-800"
              >
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CategoriesManager({ onChanged }: CategoriesManagerProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <CategoryColumn kind="income" onChanged={onChanged} />
      <CategoryColumn kind="expense" onChanged={onChanged} />
    </div>
  );
}
