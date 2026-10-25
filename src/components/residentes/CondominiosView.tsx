"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ResidenteSearch } from "./ResidenteSearch";
import { ListPagination } from "./ListPagination";
import { CondominioStatsBar } from "./CondominioStats";
import { TableScrollHint } from "./TableScrollHint";
import { CondominioDocumentsPanel } from "./CondominioDocumentsPanel";
import { CondominioServicesPanel } from "./CondominioServicesPanel";

const TIPOS = ["Vivienda", "Terrenos", "Torres"] as const;
type Tipo = (typeof TIPOS)[number];

const ESTATUS = ["Activo", "Entregado"] as const;
type Estatus = (typeof ESTATUS)[number];

interface PortalDevelopment {
  id: number;
  name: string;
  slug: string;
}

interface Condominio {
  id: number;
  name: string;
  prefijo: string;
  tipo: Tipo;
  estatus: Estatus;
  documentacion_indexada: boolean;
  tags: boolean;
  created_at: number;
  resident_count?: number;
  document_count?: number;
  schedule_count?: number;
  development_id?: number | null;
  development_name?: string | null;
}

const NEW_DEVELOPMENT = "__new__";

interface FormState {
  name: string;
  prefijo: string;
  tipo: Tipo;
  estatus: Estatus;
  documentacion_indexada: boolean;
  tags: boolean;
  developmentId: number | "" | typeof NEW_DEVELOPMENT;
  newDevelopmentName: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  prefijo: "",
  tipo: "Vivienda",
  estatus: "Activo",
  documentacion_indexada: false,
  tags: false,
  developmentId: "",
  newDevelopmentName: "",
};

const TIPO_COLORS: Record<Tipo, string> = {
  Vivienda: "bg-blue-100 text-blue-700",
  Terrenos: "bg-amber-100 text-amber-700",
  Torres: "bg-purple-100 text-purple-700",
};

const ESTATUS_COLORS: Record<Estatus, string> = {
  Activo: "bg-green-100 text-green-700",
  Entregado: "bg-blue-100 text-blue-700",
};

const TH =
  "sticky top-0 z-10 bg-violet-50/95 backdrop-blur-sm px-4 py-3 font-medium text-violet-800 shadow-[inset_0_-1px_0_0_rgb(237,233,254)]";

interface ListResult {
  data: Condominio[];
  total: number;
  page: number;
  totalPages: number;
  portalDevelopments?: PortalDevelopment[];
}

interface Stats {
  total: number;
  activos: number;
  entregados: number;
}

export function CondominiosView() {
  const [result, setResult] = useState<ListResult | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const hasLoadedList = useRef(false);
  const condoScrollRef = useRef<HTMLDivElement>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Condominio | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [docsCondo, setDocsCondo] = useState<Condominio | null>(null);
  const [servicesCondo, setServicesCondo] = useState<Condominio | null>(null);
  const [portalDevelopments, setPortalDevelopments] = useState<PortalDevelopment[]>([]);

  const fetchList = useCallback(async () => {
    if (!hasLoadedList.current) setLoading(true);
    else setIsSearching(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      params.set("page", String(page));
      params.set("limit", "50");
      const res = await fetch(`/api/condominios?${params.toString()}`);
      if (res.ok) {
        const payload = (await res.json()) as ListResult;
        setResult(payload);
        if (payload.portalDevelopments) {
          setPortalDevelopments(payload.portalDevelopments);
        }
        hasLoadedList.current = true;
      }
    } finally {
      setLoading(false);
      setIsSearching(false);
    }
  }, [search, page]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/condominios?stats=1");
      if (res.ok) setStats(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError("");
    setModalOpen(true);
  };

  const openEdit = (c: Condominio) => {
    setEditing(c);
    setForm({
      name: c.name,
      prefijo: c.prefijo,
      tipo: c.tipo,
      estatus: c.estatus ?? "Activo",
      documentacion_indexada: c.documentacion_indexada,
      tags: c.tags,
      developmentId: c.development_id ?? "",
      newDevelopmentName: "",
    });
    setError("");
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.prefijo.trim()) {
      setError("Nombre y prefijo son obligatorios");
      return;
    }
    if (form.developmentId === NEW_DEVELOPMENT && !form.newDevelopmentName.trim()) {
      setError("Escribe el nombre del desarrollo nuevo");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const isEdit = editing != null;
      const url = isEdit ? `/api/condominios/${editing.id}` : "/api/condominios";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          prefijo: form.prefijo,
          tipo: form.tipo,
          estatus: form.estatus,
          documentacion_indexada: form.documentacion_indexada,
          tags: form.tags,
          developmentId:
            form.developmentId === "" || form.developmentId === NEW_DEVELOPMENT
              ? null
              : form.developmentId,
          newDevelopmentName:
            form.developmentId === NEW_DEVELOPMENT
              ? form.newDevelopmentName.trim()
              : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setModalOpen(false);
        fetchList();
        fetchStats();
      } else {
        setError(data.error ?? "Error al guardar");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c: Condominio) => {
    if (
      !window.confirm(
        `¿Eliminar "${c.name}"? Solo es posible si no tiene residentes asignados.`
      )
    ) {
      return;
    }
    const res = await fetch(`/api/condominios/${c.id}`, { method: "DELETE" });
    const data = await res.json();
    if (res.ok) {
      fetchList();
      fetchStats();
    } else {
      alert(data.error ?? "Error al eliminar");
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[#f8f7fc]">
      <div className="shrink-0 px-4 sm:px-6 pt-4 pb-3 space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 lg:flex-nowrap">
          <div className="shrink-0">
            <h2 className="text-xl font-bold text-violet-900">Condominios</h2>
          </div>

          <div className="order-3 w-full flex justify-center lg:order-none lg:flex-1 lg:w-auto lg:min-w-0">
            <CondominioStatsBar stats={stats} compact />
          </div>

          <button
            onClick={openCreate}
            className="order-2 ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:from-violet-700 hover:to-purple-700 lg:order-none lg:ml-0"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nuevo Condominio
          </button>
        </div>

        <ResidenteSearch
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          isSearching={isSearching}
          placeholder="Buscar condominio, residente, contacto de emergencia..."
        />
      </div>

      <div className="flex flex-1 flex-col min-h-0 px-4 sm:px-6 pb-4">
        <div className="flex flex-col flex-1 min-h-0 bg-white rounded-2xl border border-violet-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-gray-400">
              Cargando...
            </div>
          ) : !result || result.data.length === 0 ? (
            <div className="flex flex-1 flex-col">
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                <p className="text-sm text-gray-500">No hay condominios registrados</p>
                {!search && (
                  <button
                    onClick={openCreate}
                    className="mt-3 text-sm text-violet-600 hover:text-violet-800 font-medium"
                  >
                    + Agregar el primero
                  </button>
                )}
              </div>
              {result && (
                <ListPagination
                  page={result.page}
                  totalPages={result.totalPages}
                  total={result.total}
                  itemLabel="condominio"
                  onPageChange={setPage}
                />
              )}
            </div>
          ) : (
            <>
              {(() => {
                const searchActive = Boolean(search.trim());
                const idsKey = result.data.map((x) => x.id).join(",");
                const matchAnimKey = searchActive
                  ? `${search.trim()}-${result.page}-${idsKey}`
                  : "idle";
                return (
              <div className="relative flex-1 min-h-0">
                <div ref={condoScrollRef} className="h-full overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-violet-100">
                        <th className={`${TH} text-center`}>Nombre</th>
                        <th className={`${TH} text-center hidden sm:table-cell`}>Desarrollo</th>
                        <th className={`${TH} text-center hidden sm:table-cell`}>Prefijo</th>
                        <th className={`${TH} text-center hidden md:table-cell`}>Residentes</th>
                        <th className={`${TH} text-center`}>Tipo</th>
                        <th className={`${TH} text-center`}>Estatus</th>
                        <th className={`${TH} text-center hidden lg:table-cell`}>Servicios</th>
                        <th className={`${TH} text-center`}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.data.map((c) => (
                          <tr
                            key={`${c.id}-${matchAnimKey}`}
                            className={`border-b border-gray-50 transition-colors ${
                              searchActive
                                ? "animate-blink-violet-match bg-search-match"
                                : "hover:bg-violet-50/30"
                            }`}
                          >
                            <td className="px-4 py-3">
                              <span className="font-medium text-gray-900">{c.name}</span>
                              <span className="sm:hidden block text-xs text-gray-400 mt-0.5">
                                {c.development_name || "Sin desarrollo"} · Prefijo: {c.prefijo || "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">
                              {c.development_name || (
                                <span className="text-amber-600">Sin asignar</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">
                              {c.prefijo || "—"}
                            </td>
                            <td className="px-4 py-3 text-center text-gray-600 hidden md:table-cell">
                              {c.resident_count ?? 0}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${TIPO_COLORS[c.tipo] ?? "bg-gray-100 text-gray-600"}`}
                              >
                                {c.tipo}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTATUS_COLORS[c.estatus ?? "Activo"]}`}
                              >
                                {c.estatus ?? "Activo"}
                              </span>
                            </td>
                            <td className="px-4 py-3 hidden lg:table-cell">
                              <div className="flex flex-wrap gap-1">
                                {c.documentacion_indexada && (
                                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700">
                                    Documentación
                                  </span>
                                )}
                                {c.tags && (
                                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                                    Tags
                                  </span>
                                )}
                                {(c.schedule_count ?? 0) > 0 && (
                                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                                    Servicios {c.schedule_count}
                                  </span>
                                )}
                                {!c.documentacion_indexada &&
                                  !c.tags &&
                                  (c.schedule_count ?? 0) === 0 && (
                                  <span className="text-xs text-gray-400">—</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => setServicesCondo(c)}
                                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 transition-colors"
                                >
                                  Servicios
                                </button>
                                <button
                                  onClick={() => setDocsCondo(c)}
                                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-colors"
                                >
                                  Documentos
                                </button>
                                <button
                                  onClick={() => openEdit(c)}
                                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => handleDelete(c)}
                                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                                >
                                  Eliminar
                                </button>
                              </div>
                            </td>
                          </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TableScrollHint
                  scrollRef={condoScrollRef}
                  triggerKey={`${result.page}-${idsKey}-${search}`}
                />
              </div>
                );
              })()}
              <ListPagination
                page={result.page}
                totalPages={result.totalPages}
                total={result.total}
                itemLabel="condominio"
                onPageChange={setPage}
              />
            </>
          )}
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="px-6 pt-5 pb-3 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">
                {editing ? `Editar: ${editing.name}` : "Nuevo Condominio"}
              </h3>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ej. LIMA, PARIS, TORRE A"
                  className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-violet-400 focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Prefijo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.prefijo}
                  onChange={(e) => setForm((f) => ({ ...f, prefijo: e.target.value }))}
                  placeholder="Ej. 17, A, T1"
                  className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-violet-400 focus:outline-none"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Se usa para generar el número de coto (ej. 17-42)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Desarrollo
                </label>
                <select
                  value={form.developmentId}
                  onChange={(e) => {
                    const value = e.target.value;
                    setForm((f) => ({
                      ...f,
                      developmentId:
                        value === NEW_DEVELOPMENT
                          ? NEW_DEVELOPMENT
                          : value
                            ? Number(value)
                            : "",
                      newDevelopmentName:
                        value === NEW_DEVELOPMENT ? f.newDevelopmentName : "",
                    }));
                  }}
                  className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-violet-400 focus:outline-none"
                >
                  <option value="">Sin asignar (no aparece en el portal)</option>
                  {portalDevelopments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                  <option value={NEW_DEVELOPMENT}>＋ Agregar nuevo…</option>
                </select>
                {form.developmentId === NEW_DEVELOPMENT && (
                  <input
                    type="text"
                    value={form.newDevelopmentName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, newDevelopmentName: e.target.value }))
                    }
                    placeholder="Nombre del desarrollo, ej. Lomas del Sur"
                    maxLength={80}
                    className="mt-2 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-violet-400 focus:outline-none"
                    autoFocus
                  />
                )}
                <p className="mt-1 text-xs text-gray-400">
                  El condominio solo aparece en el portal si tiene un desarrollo asignado.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.tipo}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, tipo: e.target.value as Tipo }))
                  }
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Estatus <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.estatus}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, estatus: e.target.value as Estatus }))
                  }
                  className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-violet-400 focus:outline-none"
                >
                  {ESTATUS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setModalOpen(false)}
                disabled={saving}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim() || !form.prefijo.trim()}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {saving ? "Guardando..." : editing ? "Guardar cambios" : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}

      {docsCondo && (
        <CondominioDocumentsPanel
          condominioId={docsCondo.id}
          condominioName={docsCondo.name}
          onClose={() => setDocsCondo(null)}
          onDocumentsChanged={() => {
            void fetchList();
          }}
        />
      )}

      {servicesCondo && (
        <CondominioServicesPanel
          condominioId={servicesCondo.id}
          condominioName={servicesCondo.name}
          onClose={() => setServicesCondo(null)}
          onChanged={() => {
            void fetchList();
          }}
        />
      )}
    </div>
  );
}
