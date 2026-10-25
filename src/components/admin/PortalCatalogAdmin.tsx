"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Development {
  id: number;
  name: string;
  slug: string;
  condominios: Array<{ id: number; name: string; prefijo: string }>;
}

interface Condominio {
  id: number;
  name: string;
  prefijo: string;
}

interface CsvPreview {
  totalRows: number;
  valid: Array<{ developmentId: number; condominioId: number; numVivienda: number }>;
  errors: Array<{ row: number; message: string }>;
}

interface CsvImportResult {
  totalRows: number;
  inserted: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400 disabled:bg-slate-50";

export function PortalCatalogAdmin() {
  // ── Estado de catálogo ──────────────────────────────────────────────────────
  const [devs, setDevs] = useState<Development[]>([]);
  const [allCondos, setAllCondos] = useState<Condominio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  // ── Formulario de vinculación ────────────────────────────────────────────────
  const [linkDevId, setLinkDevId] = useState<number | "">("");
  const [linkCondoId, setLinkCondoId] = useState<number | "">("");
  const [linking, setLinking] = useState(false);

  // ── CSV Import ───────────────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);
  const [csvResult, setCsvResult] = useState<CsvImportResult | null>(null);
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvError, setCsvError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [catRes, condosRes] = await Promise.all([
        fetch("/api/admin/portal-catalog"),
        fetch("/api/condominios"),
      ]);
      if (!catRes.ok) throw new Error("Error al cargar catálogo");
      const catData = await catRes.json();
      setDevs(catData.developments ?? []);

      if (condosRes.ok) {
        const condosData = await condosRes.json();
        // La API de condominios devuelve array directo o {condominios:[]}
        const list = Array.isArray(condosData)
          ? condosData
          : (condosData.condominios ?? []);
        setAllCondos(list);
      }
    } catch {
      setError("No se pudo cargar el catálogo.");
    } finally {
      setLoading(false);
    }
  }, []); // sin deps externas: solo usa setters estables

  useEffect(() => { void loadData(); }, [loadData]);

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkDevId || !linkCondoId) return;
    setLinking(true);
    setMsg("");
    setError("");
    try {
      const res = await fetch("/api/admin/portal-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ developmentId: linkDevId, condominioId: linkCondoId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al vincular");
      setMsg("Condominio vinculado correctamente.");
      setLinkCondoId("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al vincular");
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async (devId: number, condoId: number) => {
    if (!confirm("¿Desvincular este condominio del desarrollo?")) return;
    setMsg("");
    setError("");
    try {
      const res = await fetch("/api/admin/portal-catalog", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ developmentId: devId, condominioId: condoId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al desvincular");
      setMsg("Condominio desvinculado.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al desvincular");
    }
  };

  // ── CSV handlers ─────────────────────────────────────────────────────────────

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvPreview(null);
    setCsvResult(null);
    setCsvError("");
    setCsvLoading(true);

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/portal-catalog/import?preview=1", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al previsualizar");
      setCsvPreview(data);
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : "Error al leer el archivo");
    } finally {
      setCsvLoading(false);
    }
  };

  const handleImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setCsvLoading(true);
    setCsvError("");
    setCsvResult(null);

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/portal-catalog/import", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al importar");
      setCsvResult(data);
      setCsvPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      await loadData();
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : "Error al importar");
    } finally {
      setCsvLoading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/portal-catalog/template");
      if (!res.ok) throw new Error("No se pudo descargar la plantilla.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "machote_viviendas.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo descargar la plantilla.");
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Error / msg global ─────────────────────────────────────────── */}
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {msg}
        </div>
      )}

      {/* ── Sección 1: Mapeo Desarrollo → Condominios ───────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-slate-900 mb-3">
          Desarrollos y condominios vinculados
        </h3>

        {loading ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : (
          <div className="space-y-3">
            {devs.map((dev) => (
              <div
                key={dev.id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {dev.name}
                    </p>
                    <p className="text-xs text-slate-400">{dev.slug}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {dev.condominios.length} condo{dev.condominios.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {dev.condominios.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Sin condominios vinculados.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {dev.condominios.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
                      >
                        <span className="text-slate-700">
                          {c.name} {c.prefijo ? `(${c.prefijo})` : ""}
                        </span>
                        <button
                          onClick={() => handleUnlink(dev.id, c.id)}
                          className="text-slate-400 hover:text-rose-500 transition-colors"
                          title="Desvincular"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Formulario para vincular */}
        <form
          onSubmit={handleLink}
          className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4"
        >
          <div className="flex-1 min-w-40">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Desarrollo
            </label>
            <select
              value={linkDevId}
              onChange={(e) => setLinkDevId(e.target.value ? Number(e.target.value) : "")}
              className={inputClass}
            >
              <option value="">Selecciona…</option>
              {devs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-40">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Condominio
            </label>
            <select
              value={linkCondoId}
              onChange={(e) => setLinkCondoId(e.target.value ? Number(e.target.value) : "")}
              className={inputClass}
            >
              <option value="">Selecciona…</option>
              {allCondos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.prefijo ? `(${c.prefijo})` : ""}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={!linkDevId || !linkCondoId || linking}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {linking ? "Vinculando…" : "Vincular"}
          </button>
        </form>
      </section>

      {/* ── Sección 2: Importación CSV de viviendas ─────────────────────── */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Importar viviendas (CSV)
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Crea viviendas de forma masiva. No incluye datos personales de propietarios.
            </p>
          </div>
          <button
            onClick={handleDownloadTemplate}
            className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
          >
            ↓ Plantilla CSV
          </button>
        </div>

        {/* File input */}
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Archivo CSV
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            disabled={csvLoading}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-violet-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-violet-700 hover:file:bg-violet-100 disabled:opacity-50"
          />
          <p className="mt-1 text-xs text-slate-400">
            Solo .csv · máx. 5 MB · Columnas: development_id, condominio_id, num_vivienda
          </p>
        </div>

        {csvError && (
          <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            {csvError}
          </div>
        )}

        {csvLoading && (
          <p className="text-xs text-slate-500">Procesando…</p>
        )}

        {/* Preview */}
        {csvPreview && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
            <p className="font-semibold text-amber-900 mb-2">
              Vista previa — {csvPreview.totalRows} filas
            </p>
            <div className="flex gap-4 mb-2">
              <span className="text-emerald-700">✓ {csvPreview.valid.length} válidas</span>
              <span className="text-rose-700">✗ {csvPreview.errors.length} con error</span>
            </div>
            {csvPreview.errors.length > 0 && (
              <ul className="mb-2 text-xs text-rose-600 space-y-0.5">
                {csvPreview.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>
                    Fila {e.row}: {e.message}
                  </li>
                ))}
                {csvPreview.errors.length > 5 && (
                  <li>…y {csvPreview.errors.length - 5} errores más.</li>
                )}
              </ul>
            )}
            {csvPreview.valid.length > 0 && (
              <button
                onClick={handleImport}
                disabled={csvLoading}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                {csvLoading ? "Importando…" : `Importar ${csvPreview.valid.length} viviendas válidas`}
              </button>
            )}
          </div>
        )}

        {/* Resultado de importación */}
        {csvResult && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
            <p className="font-semibold text-emerald-900 mb-1">Importación completada</p>
            <div className="flex gap-4 text-xs">
              <span>Total: {csvResult.totalRows}</span>
              <span className="text-emerald-700">Insertadas: {csvResult.inserted}</span>
              <span className="text-slate-600">Saltadas: {csvResult.skipped}</span>
              {csvResult.errors.length > 0 && (
                <span className="text-rose-600">Errores: {csvResult.errors.length}</span>
              )}
            </div>
            {csvResult.errors.length > 0 && (
              <ul className="mt-2 text-xs text-rose-600 space-y-0.5">
                {csvResult.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>
                    Fila {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
