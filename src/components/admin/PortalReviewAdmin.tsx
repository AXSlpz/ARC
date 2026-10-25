"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface Development {
  id: number;
  name: string;
}

interface CatalogItem {
  id: number;
  name: string;
  slug: string;
}

interface ConfigRow {
  developmentId: number;
  modificationCatalogId: number;
  active: boolean;
}

interface CommitteeRow {
  developmentId: number;
  committeeName: string;
  committeeRole: string;
}

export function PortalReviewAdmin() {
  const [developments, setDevelopments] = useState<Development[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [committee, setCommittee] = useState<CommitteeRow[]>([]);
  const [developmentId, setDevelopmentId] = useState<number | "">("");
  const [committeeName, setCommitteeName] = useState("");
  const [committeeRole, setCommitteeRole] = useState("Comité de Arquitectura");
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/portal-review-config");
    if (!res.ok) throw new Error("No se pudo cargar la configuración.");
    const data = (await res.json()) as {
      developments: Development[];
      catalog: CatalogItem[];
      configs: ConfigRow[];
      committee: CommitteeRow[];
    };
    setDevelopments(data.developments ?? []);
    setCatalog(data.catalog ?? []);
    setConfigs(data.configs ?? []);
    setCommittee(data.committee ?? []);
    setDevelopmentId((current) => current || data.developments?.[0]?.id || "");
  }, []);

  useEffect(() => {
    load().catch(() => setError("No se pudo cargar la configuración."));
  }, [load]);

  useEffect(() => {
    const row = committee.find((item) => item.developmentId === developmentId);
    setCommitteeName(row?.committeeName ?? "");
    setCommitteeRole(row?.committeeRole ?? "Comité de Arquitectura");
  }, [committee, developmentId]);

  const activeIds = useMemo(() => {
    const ids = new Set<number>();
    for (const row of configs) {
      if (row.developmentId === developmentId && row.active) ids.add(row.modificationCatalogId);
    }
    return ids;
  }, [configs, developmentId]);

  async function toggle(modificationCatalogId: number, active: boolean) {
    if (!developmentId) return;
    setSavingId(modificationCatalogId);
    setError("");
    try {
      const res = await fetch("/api/admin/portal-review-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "modification",
          developmentId,
          modificationCatalogId,
          active,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "No se pudo guardar.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSavingId(null);
    }
  }

  async function saveCommittee() {
    if (!developmentId) return;
    setError("");
    const res = await fetch("/api/admin/portal-review-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "committee",
        developmentId,
        committeeName,
        committeeRole,
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "No se pudo guardar la firma.");
      return;
    }
    await load();
  }

  return (
    <div className="space-y-4">
      <label className="block text-xs font-medium text-slate-600" htmlFor="review-dev">
        Desarrollo
      </label>
      <select
        id="review-dev"
        value={developmentId}
        onChange={(e) => setDevelopmentId(e.target.value ? Number(e.target.value) : "")}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
      >
        {developments.map((dev) => (
          <option key={dev.id} value={dev.id}>{dev.name}</option>
        ))}
      </select>

      <div className="grid gap-2 sm:grid-cols-2">
        {catalog.map((item) => (
          <label key={item.id} className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={activeIds.has(item.id)}
              disabled={savingId === item.id || !developmentId}
              onChange={(e) => void toggle(item.id, e.target.checked)}
            />
            {item.name}
          </label>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={committeeName}
          onChange={(e) => setCommitteeName(e.target.value)}
          placeholder="Nombre de quien firma"
          aria-label="Nombre de quien firma por el comité"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <input
          value={committeeRole}
          onChange={(e) => setCommitteeRole(e.target.value)}
          placeholder="Cargo"
          aria-label="Cargo del comité"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="button"
        onClick={() => void saveCommittee()}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
      >
        Guardar firma del comité
      </button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
