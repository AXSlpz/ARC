"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ResidenteStatsBar } from "./ResidenteStats";
import { ResidenteSearch } from "./ResidenteSearch";
import { ResidentesList } from "./ResidentesList";
import { ResidenteDetail } from "./ResidenteDetail";
import { ResidenteForm } from "./ResidenteForm";
import { CondominiosView } from "./CondominiosView";
import { ProspectosView } from "@/components/crm/ProspectosView";

type ResidentesTab = "residentes" | "condominios" | "prospectos";

interface Condominio {
  id: number;
  name: string;
  prefijo: string;
  tipo: "Vivienda" | "Terrenos" | "Torres";
}

interface Residente {
  id: number;
  condominio_id: number;
  condominio_name: string;
  condominio_prefijo?: string;
  num_vivienda: number | null;
  num_coto: string | null;
  prototipo_id: number | null;
  prototipo_name?: string | null;
  nombre: string;
  celular: number | null;
  email: string | null;
  fecha_entrega: string | null;
  metros_cuadrados: number | null;
  cuota_int: number | null;
  cuota_ext: number | null;
  cuota_completa: number | null;
  cuota_int_pronpago: number | null;
  cuota_ext_pronpago: number | null;
  cuota_comp_pronpago: number | null;
  servicio_luz: number | null;
  nombre_contacto1: string | null;
  celular_contacto1: number | null;
  parentesco_contacto1: string | null;
  nombre_contacto2: string | null;
  celular_contacto2: number | null;
  parentesco_contacto2: string | null;
  nombre_contacto3: string | null;
  celular_contacto3: number | null;
  parentesco_contacto3: string | null;
  mes_pago: string | null;
  nombre_expropietario: string | null;
  celular_expropietario: number | null;
  fecha_entrega_primer: string | null;
  tag1_estatus: "Activo" | "Inactivo" | null;
  tag1_id: number | null;
  tag1_placa: string | null;
  tag1_modelo: string | null;
  tag1_color: string | null;
  tag2_estatus: "Activo" | "Inactivo" | null;
  tag2_id: number | null;
  tag2_placa: string | null;
  tag2_modelo: string | null;
  tag2_color: string | null;
  ocupacion?: "Ocupado" | "Vacante";
  active: number;
  created_at: number;
  updated_at: number;
}

interface ListResult {
  data: Residente[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface Stats {
  total: number;
  active: number;
  inactive: number;
  vacantes?: number;
  byCondominio: { condominio_name: string; count: number }[];
}

interface CreatePrefill {
  nombre?: string;
  celular?: number | null;
  email?: string | null;
  condominio_id?: number;
}

export function ResidentesView() {
  const [activeTab, setActiveTab] = useState<ResidentesTab>(() => {
    if (typeof window === "undefined") return "prospectos";
    try {
      const stored = sessionStorage.getItem("residentes-tab");
      if (
        stored === "condominios" ||
        stored === "prospectos" ||
        stored === "residentes"
      ) {
        return stored;
      }
    } catch {}
    return "prospectos";
  });
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [result, setResult] = useState<ListResult | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedResidente, setSelectedResidente] = useState<Residente | null>(null);
  const [search, setSearch] = useState("");
  const [condominioFilter, setCondominioFilter] = useState<number | undefined>();
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingResidente, setEditingResidente] = useState<Residente | null>(null);
  const [createPrefill, setCreatePrefill] = useState<CreatePrefill | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const hasLoadedList = useRef(false);

  const fetchCondominios = useCallback(async () => {
    try {
      const res = await fetch("/api/condominios");
      if (res.ok) setCondominios(await res.json());
    } catch {}
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/residentes?stats=1");
      if (res.ok) setStats(await res.json());
    } catch {}
  }, []);

  const fetchList = useCallback(async () => {
    if (!hasLoadedList.current) setListLoading(true);
    else setIsSearching(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (condominioFilter) params.set("condominio_id", String(condominioFilter));
      params.set("active", showInactive ? "0" : "1");
      params.set("page", String(page));
      params.set("limit", "50");

      const res = await fetch(`/api/residentes?${params.toString()}`);
      if (res.ok) {
        setResult(await res.json());
        hasLoadedList.current = true;
      }
    } finally {
      setListLoading(false);
      setIsSearching(false);
    }
  }, [search, condominioFilter, showInactive, page]);

  const fetchDetail = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/residentes/${id}`);
      if (res.ok) setSelectedResidente(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchCondominios();
    fetchStats();
  }, [fetchCondominios, fetchStats]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    if (selectedId != null) fetchDetail(selectedId);
    else setSelectedResidente(null);
  }, [selectedId, fetchDetail]);

  useEffect(() => {
    try {
      sessionStorage.setItem("residentes-tab", activeTab);
    } catch {}
  }, [activeTab]);

  const refresh = () => {
    fetchList();
    fetchStats();
  };

  const handleSelect = (id: number) => {
    setSelectedId(id);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSave = async (data: any) => {
    const isEdit = editingResidente?.id != null;
    const url = isEdit
      ? `/api/residentes/${editingResidente!.id}`
      : "/api/residentes";
    const method = isEdit ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "Error al guardar");
    }

    const saved = await res.json();
    setFormOpen(false);
    setEditingResidente(null);
    setCreatePrefill(null);
    setSelectedId(saved.id);
    refresh();
  };

  const handleDeactivate = async () => {
    if (!selectedId) return;
    if (
      !window.confirm(
        "¿Marcar vivienda como Vacante (reventa)? Se pasará el propietario a ExPropietario y la vivienda quedará libre."
      )
    ) {
      return;
    }
    await fetch(`/api/residentes/${selectedId}`, { method: "DELETE" });
    setSelectedId(null);
    refresh();
  };

  const handleReactivate = async () => {
    if (!selectedId) return;
    await fetch(`/api/residentes/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reactivate: true }),
    });
    fetchDetail(selectedId);
    refresh();
  };

  const openCreate = () => {
    setEditingResidente(null);
    setCreatePrefill(null);
    setFormOpen(true);
  };

  const openCreateFrom = (residente: Residente) => {
    const fromOccupied =
      residente.ocupacion !== "Vacante" && residente.nombre !== "Vacante";
    setEditingResidente(null);
    setCreatePrefill({
      condominio_id: residente.condominio_id,
      ...(fromOccupied
        ? {
            nombre: residente.nombre,
            celular: residente.celular,
            email: residente.email,
          }
        : {}),
    });
    setFormOpen(true);
  };

  const openEdit = () => {
    if (selectedResidente) {
      setEditingResidente(selectedResidente);
      setFormOpen(true);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f8f7fc]">
      {/* Tab navigation */}
      <div className="shrink-0 px-4 sm:px-6 pt-4 pb-0">
        <div className="flex gap-1 border-b border-violet-200">
          <button
            type="button"
            onClick={() => setActiveTab("prospectos")}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === "prospectos"
                ? "bg-white text-violet-800 border border-violet-200 border-b-white -mb-px"
                : "text-gray-500 hover:text-violet-700 hover:bg-violet-50/50"
            }`}
          >
            Prospectos
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("residentes")}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === "residentes"
                ? "bg-white text-violet-800 border border-violet-200 border-b-white -mb-px"
                : "text-gray-500 hover:text-violet-700 hover:bg-violet-50/50"
            }`}
          >
            Res / Clien
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("condominios")}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === "condominios"
                ? "bg-white text-violet-800 border border-violet-200 border-b-white -mb-px"
                : "text-gray-500 hover:text-violet-700 hover:bg-violet-50/50"
            }`}
          >
            Condominio
          </button>
        </div>
      </div>

      {activeTab === "condominios" ? (
        <CondominiosView />
      ) : activeTab === "prospectos" ? (
        <ProspectosView embedded />
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
      {/* Top bar */}
      <div className="shrink-0 px-4 sm:px-6 pt-4 pb-3 space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 lg:flex-nowrap">
          <h2 className="text-xl font-bold text-violet-900 shrink-0">Clientes / Residentes</h2>

          <div className="order-3 w-full flex justify-center lg:order-none lg:flex-1 lg:w-auto lg:min-w-0">
            <ResidenteStatsBar stats={stats} compact />
          </div>

          <button
            onClick={openCreate}
            className="order-2 ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:from-violet-700 hover:to-purple-700 lg:order-none lg:ml-0"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nuevo Residente
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <ResidenteSearch
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            isSearching={isSearching}
          />

          <select
            value={condominioFilter ?? ""}
            onChange={(e) => {
              setCondominioFilter(e.target.value ? Number(e.target.value) : undefined);
              setPage(1);
            }}
            className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-violet-400 focus:outline-none"
          >
            <option value="">Todos los condominios</option>
            {condominios.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <label className="inline-flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => {
                setShowInactive(e.target.checked);
                setPage(1);
              }}
              className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
            />
            Ver dados de baja
          </label>
        </div>
      </div>

      {/* Content area */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-6">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm">
            <ResidentesList
              residentes={result?.data ?? []}
              selectedId={selectedId}
              onSelect={handleSelect}
              page={result?.page ?? page}
              totalPages={result?.totalPages ?? 1}
              total={result?.total ?? 0}
              loading={listLoading}
              onPageChange={setPage}
              searchActive={Boolean(search.trim())}
              searchQuery={search.trim()}
            />
          </div>
        </div>
      </div>

      {selectedId != null && selectedResidente ? (
        <ResidenteDetail
          residente={selectedResidente}
          onEdit={openEdit}
          onDeactivate={handleDeactivate}
          onReactivate={handleReactivate}
          onAddProperty={() => openCreateFrom(selectedResidente)}
          onClose={() => setSelectedId(null)}
        />
      ) : null}

      {/* Form modal */}
      {formOpen && (
        <ResidenteForm
          initial={editingResidente}
          prefill={createPrefill}
          condominios={condominios}
          onSave={handleSave}
          onCancel={() => {
            setFormOpen(false);
            setEditingResidente(null);
            setCreatePrefill(null);
          }}
          onCondominioCreated={(c) =>
            setCondominios((prev) =>
              [...prev, c].sort((a, b) => a.name.localeCompare(b.name))
            )
          }
          onCondominioUpdated={(c) =>
            setCondominios((prev) =>
              prev
                .map((item) => (item.id === c.id ? c : item))
                .sort((a, b) => a.name.localeCompare(b.name))
            )
          }
          onCondominioDeleted={(id) => {
            setCondominios((prev) => prev.filter((c) => c.id !== id));
            if (condominioFilter === id) setCondominioFilter(undefined);
          }}
        />
      )}
        </div>
      )}
    </div>
  );
}
