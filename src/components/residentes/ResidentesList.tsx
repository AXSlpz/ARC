"use client";

import { useEffect, useRef, useState } from "react";
import { ListPagination } from "./ListPagination";
import { TableScrollHint } from "./TableScrollHint";

const FMT = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

interface Residente {
  id: number;
  condominio_name: string;
  num_vivienda: number | null;
  num_coto: string | number | null;
  nombre: string;
  celular: number | null;
  email: string | null;
  cuota_completa: number | null;
  ocupacion?: "Ocupado" | "Vacante";
  pendiente_asignacion?: number;
  active: number;
}

interface ResidentesListProps {
  residentes: Residente[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  page: number;
  totalPages: number;
  total: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  /** Cuando hay búsqueda activa, las filas (coincidencias) parpadean en morado. */
  searchActive?: boolean;
  searchQuery?: string;
}

const TH =
  "sticky top-0 z-10 bg-violet-50/95 backdrop-blur-sm px-4 py-3 font-medium text-violet-800 shadow-[inset_0_-1px_0_0_rgb(237,233,254)]";

function isVacante(r: { ocupacion?: string; nombre: string }): boolean {
  return r.ocupacion === "Vacante" || r.nombre === "Vacante";
}

export function ResidentesList({
  residentes,
  selectedId,
  onSelect,
  page,
  totalPages,
  total,
  loading = false,
  onPageChange,
  searchActive = false,
  searchQuery = "",
}: ResidentesListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [blinkKey, setBlinkKey] = useState(0);

  useEffect(() => {
    if (searchActive && residentes.length > 0) {
      setBlinkKey((k) => k + 1);
    }
  }, [searchActive, searchQuery, residentes]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-gray-400">
        Cargando...
      </div>
    );
  }

  if (residentes.length === 0) {
    return (
      <div className="flex flex-1 flex-col min-h-0">
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-gray-400">
          <svg
            className="h-12 w-12 mb-3 text-violet-200"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <p className="text-sm text-gray-500">No se encontraron residentes</p>
        </div>
        <ListPagination
          page={page}
          totalPages={totalPages}
          total={total}
          itemLabel="residente"
          onPageChange={onPageChange}
        />
      </div>
    );
  }

  const scrollTriggerKey = `${page}-${residentes.length}-${residentes[0]?.id ?? 0}-${searchQuery}`;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="relative flex-1 min-h-0">
        <div ref={scrollRef} className="h-full overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-violet-100">
                <th className={`${TH} text-left`}>Nombre</th>
                <th className={`${TH} text-left hidden sm:table-cell`}>Condominio</th>
                <th className={`${TH} text-left`}>Vivienda</th>
                <th className={`${TH} text-left hidden md:table-cell`}>Celular</th>
                <th className={`${TH} text-left hidden lg:table-cell`}>Cuota</th>
                <th className={`${TH} text-left`}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {residentes.map((r) => {
                const isSelected = selectedId === r.id;
                const isMatch = searchActive;
                return (
                  <tr
                    key={`${r.id}-${blinkKey}`}
                    onClick={() => onSelect(r.id)}
                    className={`border-b border-gray-50 cursor-pointer transition-colors ${
                      isMatch && !isSelected
                        ? "animate-blink-violet-match bg-search-match"
                        : isSelected
                          ? "bg-violet-100 ring-1 ring-inset ring-violet-300"
                          : "hover:bg-violet-50/30"
                    } ${isMatch && isSelected ? "animate-blink-violet-match" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">{r.nombre}</span>
                      {r.email && (
                        <span className="block text-xs text-gray-400 mt-0.5 truncate max-w-[220px]">
                          {r.email}
                        </span>
                      )}
                      <span className="sm:hidden block text-xs text-gray-400 mt-0.5">
                        {r.condominio_name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 hidden sm:table-cell truncate max-w-[160px]">
                      {r.condominio_name}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {r.num_vivienda != null ? `#${r.num_vivienda}` : "—"}
                      {r.num_coto != null && (
                        <span className="text-gray-400"> · {r.num_coto}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs hidden md:table-cell">
                      {r.celular ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">
                      {r.cuota_completa != null ? FMT.format(r.cuota_completa) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {r.pendiente_asignacion ? (
                          <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 ring-1 ring-yellow-300">
                            Pendiente
                          </span>
                        ) : isVacante(r) && r.active ? (
                          <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">
                            Vacante
                          </span>
                        ) : (
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              r.active
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {r.active ? "Activo" : "Baja"}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <TableScrollHint scrollRef={scrollRef} triggerKey={scrollTriggerKey} />
      </div>
      <ListPagination
        page={page}
        totalPages={totalPages}
        total={total}
        itemLabel="residente"
        onPageChange={onPageChange}
      />
    </div>
  );
}
