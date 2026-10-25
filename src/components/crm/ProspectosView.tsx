"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, ErrorBanner } from "./CrmUi";
import { ProspectoDrawer } from "./ProspectoDrawer";
import { ProspectoFormModal } from "./ProspectoFormModal";
import {
  asStringArray,
  crmFetch,
  errorMessage,
  pathId,
  useCanWrite,
} from "./helpers";
import type { Prospecto, ProspectosPage } from "./types";
import { ResidenteSearch } from "@/components/residentes/ResidenteSearch";
import { ListPagination } from "@/components/residentes/ListPagination";
import { TableScrollHint } from "@/components/residentes/TableScrollHint";
import { detailBtnPress } from "@/components/residentes/DetailPopup";

const PAGE_SIZE = 20;

const TH =
  "sticky top-0 z-10 bg-violet-50/95 backdrop-blur-sm px-4 py-3 font-medium text-violet-800 shadow-[inset_0_-1px_0_0_rgb(237,233,254)]";

export function ProspectosView({ embedded = false }: { embedded?: boolean }) {
  const { canWrite } = useCanWrite();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Prospecto[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Prospecto | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const hasLoaded = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!hasLoaded.current) setLoading(true);
    else setIsSearching(true);
    setError("");
    const params = new URLSearchParams({
      search,
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    try {
      const data = await crmFetch<ProspectosPage & { prospectos?: Prospecto[] }>(
        `/api/admin/crm/prospectos?${params}`
      );
      const list = data.data ?? data.prospectos ?? [];
      setRows(list);
      setTotal(data.total ?? list.length);
      setTotalPages(Math.max(1, data.totalPages ?? 1));
      hasLoaded.current = true;
    } catch (err) {
      setRows([]);
      setError(errorMessage(err, "No se pudieron cargar los prospectos."));
    } finally {
      setLoading(false);
      setIsSearching(false);
    }
  }, [search, page]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  const shell = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-3 px-4 pb-3 pt-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-violet-900">Prospectos</h2>
            <p className="mt-1 text-sm text-gray-500">
              Contactos comerciales. El paso a Residente (cliente) se configurará más
              adelante, cuando acepten la cotización y el trato quede ganado.
            </p>
          </div>
          {canWrite ? (
            <button
              type="button"
              onClick={openCreate}
              className={detailBtnPress(
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm [@media(hover:hover)]:hover:from-violet-700 [@media(hover:hover)]:hover:to-purple-700"
              )}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Nuevo Prospecto
            </button>
          ) : null}
        </div>

        <ResidenteSearch
          value={search}
          onChange={setSearch}
          placeholder="Buscar por nombre, teléfono, correo o empresa…"
          isSearching={isSearching}
        />
      </div>

      <div className="px-4 sm:px-6">
        <ErrorBanner message={error} onRetry={load} />
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-6">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm">
            {loading ? (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-gray-400">
                Cargando...
              </div>
            ) : rows.length === 0 ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-gray-400">
                  <svg
                    className="mb-3 h-12 w-12 text-violet-200"
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
                  <p className="text-sm text-gray-500">No se encontraron prospectos</p>
                </div>
                <ListPagination
                  page={page}
                  totalPages={totalPages}
                  total={total}
                  itemLabel="prospecto"
                  onPageChange={setPage}
                />
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="relative min-h-0 flex-1">
                  <div ref={scrollRef} className="h-full overflow-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-violet-100">
                          <th className={`${TH} text-left`}>Nombre</th>
                          <th className={`${TH} text-left hidden sm:table-cell`}>Teléfono</th>
                          <th className={`${TH} text-left hidden md:table-cell`}>Correo</th>
                          <th className={`${TH} text-left hidden lg:table-cell`}>Empresa</th>
                          <th className={`${TH} text-left`}>Etiquetas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => {
                          const tags = asStringArray(row.tags);
                          const isSelected = openId === String(row.id);
                          return (
                            <tr
                              key={String(row.id)}
                              onClick={() => setOpenId(String(row.id))}
                              className={`cursor-pointer border-b border-gray-50 transition-colors ${
                                isSelected
                                  ? "bg-violet-100 ring-1 ring-inset ring-violet-300"
                                  : "[@media(hover:hover)]:hover:bg-violet-50/30"
                              }`}
                            >
                              <td className="px-4 py-3">
                                <span className="font-medium text-gray-900">{row.name}</span>
                                {row.email ? (
                                  <span className="mt-0.5 block max-w-[220px] truncate text-xs text-gray-400 md:hidden">
                                    {row.email}
                                  </span>
                                ) : null}
                                <span className="mt-0.5 block font-mono text-xs text-gray-400 sm:hidden">
                                  {row.phone}
                                </span>
                              </td>
                              <td className="hidden px-4 py-3 font-mono text-xs text-gray-600 sm:table-cell">
                                {row.phone}
                              </td>
                              <td className="hidden px-4 py-3 text-gray-600 md:table-cell">
                                {row.email || "—"}
                              </td>
                              <td className="hidden px-4 py-3 text-gray-600 lg:table-cell">
                                {row.company || "—"}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-1">
                                  {tags.length === 0 ? (
                                    <span className="text-xs text-gray-400">—</span>
                                  ) : (
                                    tags.map((tag) => (
                                      <Badge
                                        key={tag}
                                        className="bg-violet-100 text-violet-800"
                                      >
                                        {tag}
                                      </Badge>
                                    ))
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <TableScrollHint
                    scrollRef={scrollRef}
                    triggerKey={`${page}-${rows.length}-${rows[0]?.id ?? 0}-${search}`}
                  />
                </div>
                <ListPagination
                  page={page}
                  totalPages={totalPages}
                  total={total}
                  itemLabel="prospecto"
                  onPageChange={setPage}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f8f7fc]">
      {shell}

      <ProspectoFormModal
        open={formOpen}
        prospecto={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          void load();
        }}
      />

      {openId ? (
        <ProspectoDrawer
          prospectoId={openId}
          canWrite={canWrite}
          onClose={() => setOpenId(null)}
          onChanged={() => {
            void load();
          }}
          onDeleted={() => {
            setOpenId(null);
            void load();
          }}
          onEdit={(item) => {
            setOpenId(null);
            setEditing(item);
            setFormOpen(true);
          }}
        />
      ) : null}
    </div>
  );
}
