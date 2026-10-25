"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  ticketRequestTitle,
  type Ticket,
  type TicketStatus,
  type TicketType,
} from "@/lib/portal/types";
import { useToast } from "@/components/Toast";
import { fetchJson, formatDateTime, STATUS_BADGE_CLASS } from "./helpers";
import { NotificationTemplatesManager } from "./NotificationTemplatesManager";
import { SendNoticeModal } from "./SendNoticeModal";
import { TicketDetailDrawer } from "./TicketDetailDrawer";
import { ResidenteSearch } from "@/components/residentes/ResidenteSearch";
import { detailBtnPress } from "@/components/residentes/DetailPopup";
import {
  tabBtnClass,
  tableHeadClass,
} from "@/components/crm/CrmUi";

type TicketsTab = "solicitudes" | "archivo" | "plantillas";

interface TypeOption {
  id: number;
  name: string;
}

/** Agrupación de estatus para la vista de solicitudes. */
const STATUS_GROUPS: Array<{
  key: string;
  label: string;
  statuses: TicketStatus[];
}> = [
  { key: "nuevas", label: "Nuevas", statuses: ["nuevo"] },
  {
    key: "activas",
    label: "Activas",
    statuses: ["en_revision", "held"],
  },
  {
    key: "concluidas",
    label: "Concluidas",
    statuses: ["autorizado", "cancelado", "rechazado"],
  },
];

function NoticeTypeTag() {
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-300 text-white shadow-[0_1px_2px_rgba(15,23,42,0.12)]"
      aria-label="Notificación administrativa"
    >
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12.2 3.2 3.4 12a1.4 1.4 0 0 0 0 2l6.6 6.6a1.4 1.4 0 0 0 2 0l8.8-8.8V3.2h-8.6Z" />
        <circle cx="16.2" cy="7.6" r="1.35" fill="#f59e0b" />
      </svg>
    </span>
  );
}

/** Misma plantilla en Nuevos / Activos / Cerrados para que los encabezados coincidan. */
const COL = {
  folio: "w-[13%]",
  cliente: "w-[22%]",
  tipo: "w-[23%]",
  estatus: "w-[14%]",
  creado: "w-[14%]",
  actualizado: "w-[14%]",
  acciones: "w-[16%]",
} as const;

function TicketTable({
  items,
  archived,
  onOpen,
  onRestore,
  onHardDelete,
  headOffsetClass = "top-0",
}: {
  items: Ticket[];
  archived: boolean;
  onOpen: (id: number) => void;
  onRestore?: (id: number) => void;
  onHardDelete?: (ticket: Ticket) => void;
  headOffsetClass?: string;
}) {
  const headClass = tableHeadClass.replace("top-0", headOffsetClass);
  return (
    <div>
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="border-b border-violet-100">
            <th className={`${headClass} ${COL.folio} text-center`}>Folio</th>
            <th className={`${headClass} ${COL.cliente} text-center`}>Cliente</th>
            <th className={`${headClass} ${COL.tipo} text-center hidden sm:table-cell`}>Tipo</th>
            <th className={`${headClass} ${COL.estatus} text-center`}>Estatus</th>
            <th className={`${headClass} ${COL.creado} text-center hidden md:table-cell`}>Creado</th>
            <th className={`${headClass} ${COL.actualizado} text-center hidden lg:table-cell`}>Actualizado</th>
            {archived && <th className={`${headClass} ${COL.acciones} text-center`}>Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr
              key={t.id}
              onClick={() => onOpen(t.id)}
              className="cursor-pointer border-b border-gray-50 [@media(hover:hover)]:hover:bg-violet-50/30"
            >
              <td className={`${COL.folio} whitespace-nowrap px-4 py-3 text-left`}>
                <span className="inline-flex items-center gap-1.5">
                  <span className="font-mono text-sm font-medium tabular-nums text-gray-900">
                    {t.folio}
                  </span>
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
                    {t.origin === "admin_notice" ? <NoticeTypeTag /> : null}
                  </span>
                </span>
              </td>
              <td className={`${COL.cliente} px-4 py-3 text-left`}>
                <div className="break-words font-medium text-gray-800">
                  {t.clientName ?? "—"}
                </div>
                <div className="break-all text-xs text-gray-500">{t.clientEmail ?? ""}</div>
              </td>
              <td className={`${COL.tipo} hidden px-4 py-3 text-left text-gray-700 break-words sm:table-cell`}>
                {ticketRequestTitle(t)}
              </td>
              <td className={`${COL.estatus} px-4 py-3 text-left`}>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[t.status]}`}
                >
                  {TICKET_STATUS_LABELS[t.status]}
                </span>
              </td>
              <td className={`${COL.creado} hidden whitespace-nowrap px-4 py-3 text-left text-gray-500 md:table-cell`}>{formatDateTime(t.createdAt)}</td>
              <td className={`${COL.actualizado} hidden whitespace-nowrap px-4 py-3 text-left text-gray-500 lg:table-cell`}>{formatDateTime(t.updatedAt)}</td>
              {archived && (
                <td className={`${COL.acciones} px-4 py-3 text-left`}>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRestore?.(t.id);
                      }}
                      className={detailBtnPress(
                        "rounded-lg border border-violet-200 px-3 py-1 text-xs font-medium text-violet-800 [@media(hover:hover)]:hover:bg-violet-50"
                      )}
                    >
                      Restaurar
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onHardDelete?.(t);
                      }}
                      className={detailBtnPress(
                        "rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-700 [@media(hover:hover)]:hover:bg-red-50"
                      )}
                    >
                      Eliminar definitivo
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TicketsAdminView({
  isAdmin,
  refreshSignal,
  focusTicketId,
  onFocusHandled,
}: {
  isAdmin: boolean;
  refreshSignal?: number;
  focusTicketId?: number | null;
  onFocusHandled?: () => void;
}) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TicketsTab>("solicitudes");

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "">("");
  const [typeFilter, setTypeFilter] = useState<number | "">("");
  const [developmentFilter, setDevelopmentFilter] = useState<number | "">("");
  const [modificationFilter, setModificationFilter] = useState<number | "">("");
  const [viviendaFilter, setViviendaFilter] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [filterDevs, setFilterDevs] = useState<Array<{ id: number; name: string }>>([]);
  const [filterMods, setFilterMods] = useState<Array<{ id: number; name: string }>>([]);

  const [adminTypes, setAdminTypes] = useState<TicketType[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({
    concluidas: true,
  });
  const closeTicket = useCallback(() => setSelectedTicketId(null), []);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((current) => ({ ...current, [key]: !current[key] }));
  };

  const archived = activeTab === "archivo";

  const loadTickets = useCallback(async (mode: "full" | "silent" = "full") => {
    if (mode !== "silent") {
      setLoading(true);
      setError("");
    }
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("ticketTypeId", String(typeFilter));
      if (search.trim()) params.set("search", search.trim());
      if (archived) params.set("archived", "1");
      if (developmentFilter) params.set("developmentId", String(developmentFilter));
      if (modificationFilter) params.set("modificationCatalogId", String(modificationFilter));
      if (viviendaFilter.trim()) params.set("vivienda", viviendaFilter.trim());
      if (overdueOnly) params.set("vencidos", "1");
      const qs = params.toString();
      const data = await fetchJson<{ tickets: Ticket[] }>(
        `/api/admin/tickets${qs ? `?${qs}` : ""}`
      );
      setTickets(data.tickets);
    } catch (err) {
      if (mode !== "silent") {
        setError(err instanceof Error ? err.message : "Error al cargar solicitudes");
      }
    } finally {
      if (mode !== "silent") setLoading(false);
    }
  }, [statusFilter, typeFilter, search, archived, developmentFilter, modificationFilter, viviendaFilter, overdueOnly]);

  const handleRestore = useCallback(
    async (id: number) => {
      try {
        await fetchJson(`/api/admin/tickets/${id}/restore`, { method: "POST" });
        loadTickets();
      } catch {
        /* noop */
      }
    },
    [loadTickets]
  );

  const handleHardDelete = useCallback(
    async (ticket: Ticket) => {
      const ok = window.confirm(
        `Vas a eliminar definitivamente el ticket ${ticket.folio}.\n\nEsta acción es permanente e irreversible. Se borrarán sus comentarios, documentos, adjuntos y registros asociados.\n\n¿Continuar?`
      );
      if (!ok) return;

      try {
        await fetchJson(`/api/admin/tickets/${ticket.id}/hard-delete`, {
          method: "DELETE",
        });
        toast("Ticket eliminado definitivamente.", "success");
        loadTickets();
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "No se pudo eliminar definitivamente el ticket.";
        toast(message, "error");
      }
    },
    [loadTickets, toast]
  );

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // Tiempo real (vía el padre): cuando cambia `refreshSignal` refrescamos la
  // lista. El drawer abierto se refresca solo porque le pasamos `refreshSignal`.
  // Ignoramos el primer render para no duplicar la carga inicial.
  const firstRefreshRef = useRef(true);
  useEffect(() => {
    if (firstRefreshRef.current) {
      firstRefreshRef.current = false;
      return;
    }
    void loadTickets("silent");
    // Solo debe reaccionar a `refreshSignal`, no a cambios de filtros.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  // Tiempo real (vía el padre): cuando `focusTicketId` es un número, abrimos el
  // detalle de ese ticket, volvemos a la pestaña "Solicitudes" y avisamos al
  // padre para que lo limpie.
  useEffect(() => {
    if (focusTicketId == null) return;
    setActiveTab("solicitudes");
    setSelectedTicketId(focusTicketId);
    onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTicketId]);

  // Los tipos para el filtro: si es admin se cargan del endpoint; si no,
  // se derivan de las solicitudes ya cargadas.
  useEffect(() => {
    if (!isAdmin) return;
    fetchJson<{ types: TicketType[] }>("/api/admin/ticket-types")
      .then((data) => setAdminTypes(data.types))
      .catch(() => setAdminTypes([]));
    fetchJson<{
      developments: Array<{ id: number; name: string }>;
      catalog: Array<{ id: number; name: string }>;
    }>("/api/admin/portal-review-config")
      .then((data) => {
        setFilterDevs(data.developments ?? []);
        setFilterMods(data.catalog ?? []);
      })
      .catch(() => {
        setFilterDevs([]);
        setFilterMods([]);
      });
  }, [isAdmin]);

  const typeOptions: TypeOption[] = useMemo(() => {
    if (isAdmin && adminTypes.length > 0) {
      return adminTypes.map((t) => ({ id: t.id, name: t.name }));
    }
    const map = new Map<number, string>();
    for (const t of tickets) {
      if (!map.has(t.ticketTypeId)) {
        map.set(t.ticketTypeId, t.ticketTypeName ?? `Tipo ${t.ticketTypeId}`);
      }
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [isAdmin, adminTypes, tickets]);

  const groups = useMemo(() => {
    return STATUS_GROUPS.map((g) => ({
      ...g,
      items: tickets
        .filter((t) => g.statuses.includes(t.status))
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt),
    }));
  }, [tickets]);

  return (
    <div className="flex h-full flex-col bg-[#f8f7fc]">
      <div className="shrink-0 px-4 pt-2 sm:px-6">
        <div className="flex items-end justify-between gap-3 border-b border-violet-200">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setActiveTab("solicitudes")}
              className={tabBtnClass(activeTab === "solicitudes")}
            >
              Solicitudes
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab("archivo")}
                className={tabBtnClass(activeTab === "archivo")}
              >
                Archivo
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab("plantillas")}
                className={tabBtnClass(activeTab === "plantillas")}
              >
                Plantillas de notificación
              </button>
            )}
          </div>
          {activeTab === "solicitudes" && (
            <button
              type="button"
              onClick={() => setNoticeOpen(true)}
              className={detailBtnPress(
                "mb-1.5 shrink-0 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm [@media(hover:hover)]:hover:from-violet-700 [@media(hover:hover)]:hover:to-purple-700"
              )}
            >
              Notificación
            </button>
          )}
        </div>
      </div>

      {activeTab === "plantillas" && isAdmin ? (
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <NotificationTemplatesManager />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 px-4 pb-2 pt-2 sm:px-6">
            <div className="flex flex-wrap items-center gap-2">
              <ResidenteSearch
                value={search}
                onChange={setSearch}
                placeholder="Buscar por folio, cliente o correo…"
                isSearching={loading && Boolean(search)}
              />
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as TicketStatus | "")
                }
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-base text-gray-700 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400 sm:text-sm"
              >
                <option value="">Todos los estatus</option>
                {TICKET_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {TICKET_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <select
                value={typeFilter}
                onChange={(e) =>
                  setTypeFilter(e.target.value ? Number(e.target.value) : "")
                }
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-base text-gray-700 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400 sm:text-sm"
              >
                <option value="">Todos los tipos</option>
                {typeOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="ticket-dev-filter">Desarrollo</label>
              <select
                id="ticket-dev-filter"
                value={developmentFilter}
                onChange={(e) =>
                  setDevelopmentFilter(e.target.value ? Number(e.target.value) : "")
                }
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
              >
                <option value="">Todos los desarrollos</option>
                {filterDevs.map((dev) => (
                  <option key={dev.id} value={dev.id}>{dev.name}</option>
                ))}
              </select>
              <label className="sr-only" htmlFor="ticket-mod-filter">Modificación</label>
              <select
                id="ticket-mod-filter"
                value={modificationFilter}
                onChange={(e) =>
                  setModificationFilter(e.target.value ? Number(e.target.value) : "")
                }
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
              >
                <option value="">Todas las modificaciones</option>
                {filterMods.map((mod) => (
                  <option key={mod.id} value={mod.id}>{mod.name}</option>
                ))}
              </select>
              <label className="sr-only" htmlFor="ticket-vivienda-filter">Vivienda</label>
              <input
                id="ticket-vivienda-filter"
                value={viviendaFilter}
                onChange={(e) => setViviendaFilter(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                placeholder="Vivienda"
                className="w-28 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
              />
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={overdueOnly}
                  onChange={(e) => setOverdueOnly(e.target.checked)}
                />
                Vencidos
              </label>
            </div>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-4 sm:px-6">
            {loading ? (
              <div className="flex items-center justify-center rounded-2xl border border-violet-100 bg-white p-10 text-sm text-gray-400 shadow-sm">
                Cargando solicitudes...
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-red-200 bg-white px-4 py-6 text-center text-sm text-red-700 shadow-sm">
                {error}
                <button
                  onClick={() => void loadTickets()}
                  className="ml-2 font-medium underline hover:no-underline"
                >
                  Reintentar
                </button>
              </div>
            ) : tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-violet-100 bg-white p-10 text-center text-gray-400 shadow-sm">
                <p className="text-sm text-gray-500">
                  {archived
                    ? "No hay solicitudes en el archivo."
                    : "No hay solicitudes con estos filtros."}
                </p>
              </div>
            ) : archived ? (
              <div className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm">
                <TicketTable
                  items={tickets}
                  archived
                  onOpen={setSelectedTicketId}
                  onRestore={handleRestore}
                  onHardDelete={handleHardDelete}
                />
              </div>
            ) : (
              groups.map((g) => {
                const collapsed = collapsedGroups[g.key] === true;
                return (
                  <section key={g.key}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(g.key)}
                      aria-expanded={!collapsed}
                      className="sticky top-0 z-20 flex w-full items-center gap-2 bg-[#f8f7fc] py-2 text-left"
                    >
                      <svg
                        className={`h-4 w-4 text-violet-700 transition-transform ${collapsed ? "-rotate-90" : ""}`}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden
                      >
                        <path
                          fillRule="evenodd"
                          d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <h3 className="text-sm font-semibold text-violet-800">
                        {g.label}
                      </h3>
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                        {g.items.length}
                      </span>
                    </button>
                    {!collapsed && (
                      g.items.length === 0 ? (
                        <p className="rounded-2xl border border-violet-100 bg-white px-4 py-6 text-sm text-gray-400 shadow-sm">
                          Sin solicitudes
                        </p>
                      ) : (
                        <div className="rounded-2xl border border-violet-100 bg-white shadow-sm">
                          <TicketTable
                            items={g.items}
                            archived={false}
                            headOffsetClass="top-10"
                            onOpen={setSelectedTicketId}
                          />
                        </div>
                      )
                    )}
                  </section>
                );
              })
            )}
          </div>
        </div>
      )}

      {selectedTicketId != null && (
        <TicketDetailDrawer
          ticketId={selectedTicketId}
          refreshSignal={refreshSignal}
          isAdmin={isAdmin}
          onClose={closeTicket}
          onChanged={loadTickets}
        />
      )}

      <SendNoticeModal
        open={noticeOpen}
        onClose={() => setNoticeOpen(false)}
        requireResidentPick
        onSent={(ticket) => {
          loadTickets();
          setSelectedTicketId(ticket.id);
        }}
      />
    </div>
  );
}
