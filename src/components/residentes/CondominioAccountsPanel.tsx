"use client";

import { useCallback, useEffect, useState } from "react";

interface LastSync {
  condominioId: number;
  condominioName: string;
  communityId: string;
  properties: number;
  matched: number;
  unmatched: number;
  errors: string[];
  fetchedAt: number;
}

interface PanelData {
  condominio: {
    id: number;
    name: string;
    estados_cuenta: boolean;
    cf_community_id: string | null;
  };
  configured: boolean;
  lastSync: LastSync | null;
}

interface CondominioAccountsPanelProps {
  condominioId: number;
  condominioName: string;
  onClose: () => void;
  onChanged?: () => void;
}

function formatTs(unix: number): string {
  return new Date(unix * 1000).toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function CondominioAccountsPanel({
  condominioId,
  condominioName,
  onClose,
  onChanged,
}: CondominioAccountsPanelProps) {
  const [data, setData] = useState<PanelData | null>(null);
  const [communityId, setCommunityId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/condominios/${condominioId}/comunidad-feliz`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al cargar");
      const payload = json.data as PanelData;
      setData(payload);
      setCommunityId(payload.condominio.cf_community_id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [condominioId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/condominios/${condominioId}/comunidad-feliz`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cf_community_id: communityId.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al guardar");
      setData(json.data as PanelData);
      setMessage("Community ID guardado.");
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/condominios/${condominioId}/comunidad-feliz/sync`,
        { method: "POST" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al sincronizar");
      await load();
      const summary = json.data?.summary as LastSync | undefined;
      if (summary) {
        setMessage(
          `Sincronizado: ${summary.matched} emparejados, ${summary.unmatched} sin match, ${summary.properties} propiedades.`
        );
      } else {
        setMessage("Sincronización completada.");
      }
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al sincronizar");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Cobranza</h2>
            <p className="text-sm text-gray-500">{condominioName}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
          >
            Cerrar
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="text-sm text-gray-500">Cargando…</p>
          ) : (
            <>
              {!data?.configured && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Falta configurar{" "}
                  <code className="text-xs">COMUNIDAD_FELIZ_BASE_URL</code> (y
                  credenciales) en el entorno. El panel guarda el community_id
                  localmente; la sync se habilita cuando exista la URL.
                </div>
              )}

              {!data?.condominio.estados_cuenta && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
                  Activa el checkbox &quot;Estados de cuenta&quot; en el
                  condominio para habilitar esta integración.
                </div>
              )}

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">
                  Community ID (ComunidadFeliz)
                </span>
                <input
                  value={communityId}
                  onChange={(e) => setCommunityId(e.target.value)}
                  placeholder="Ej. 12345"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
                <span className="mt-1 block text-xs text-gray-400">
                  Identificador de la comunidad en ComunidadFeliz para este
                  condominio.
                </span>
              </label>

              {data?.lastSync && (
                <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3 text-sm text-gray-700">
                  <p className="font-medium text-gray-900">Última sincronización</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {formatTs(data.lastSync.fetchedAt)}
                  </p>
                  <ul className="mt-2 space-y-0.5 text-xs">
                    <li>Propiedades: {data.lastSync.properties}</li>
                    <li>Emparejados: {data.lastSync.matched}</li>
                    <li>Sin match: {data.lastSync.unmatched}</li>
                  </ul>
                  {data.lastSync.errors.length > 0 && (
                    <p className="mt-2 text-xs text-red-600">
                      {data.lastSync.errors.join(" · ")}
                    </p>
                  )}
                </div>
              )}

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}
              {message && (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {message}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cerrar
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving || loading}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
          <button
            onClick={() => void handleSync()}
            disabled={syncing || loading || !data?.configured}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {syncing ? "Sincronizando…" : "Sincronizar ahora"}
          </button>
        </div>
      </div>
    </div>
  );
}
