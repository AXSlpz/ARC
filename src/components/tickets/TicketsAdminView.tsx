"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  type Ticket,
  type TicketStatus,
  type TicketType,
} from "@/lib/portal/types";
import { useToast } from "@/components/Toast";
import { fetchJson, formatDateTime, STATUS_BADGE_CLASS } from "./helpers";
import { NotificationTemplatesManager } from "./NotificationTemplatesManager";
import { SendNoticeModal } from "./SendNoticeModal";
import { TicketDetailDrawer } from "./TicketDetailDrawer";
import { TicketTypesManager } from "./TicketTypesManager";

type TicketsTab = "solicitudes" | "archivo" | "tipos" | "plantillas";

interface TypeOption {
  id: number;
  name: string;
}

/** Agrupación de estatus para la vista de solicitudes (#2). */
const STATUS_GROUPS: Array<{
  key: string;
  label: string;
  statuses: TicketStatus[];
}> = [
  { key: "nuevos", label: "Nuevos", statuses: ["nuevo"] },
  {
    key: "activos",
    label: "Activos",
    statuses: ["en_revision", "autorizado", "en_proceso"],
  },
  {
    key: "cerrados",
    label: "Cerrados y cancelados",
    statuses: ["completado", "cerrado", "rechazado", "cancelado"],
  },
];

function TicketTable({
  items,
  archived,
  onOpen,
  onRestore,
  onHardDelete,
}: {
  items: Ticket[];
  archived: boolean;
  onOpen: (id: number) => void;
  onRestore?: (id: number) => void;
  onHardDelete?: (ticket: Ticket) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">Folio</th>
            <th className="px-4 py-3 font-medium">Cliente</th>
            <th className="px-4 py-3 font-medium">Tipo</th>
            <th className="px-4 py-3 font-medium">Estatus</th>
            <th className="px-4 py-3 font-medium">Creado</th>
            <th className="px-4 py-3 font-medium">Actualizado</th>
            {archived && <th className="px-4 py-3 font-medium">Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr
              key={t.id}
              onClick={() => onOpen(t.id)}
              className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
            >
              <td className="px-4 py-3 font-mono font-medium text-slate-900">
                <div className="flex flex-wrap items-center gap-2">
                  {t.folio}
                  {t.origin === "admin_notice" && (
                    <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                      Notificación
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="font-medium text-slate-800">
                  {t.clientName ?? "—"}
                </div>
                <div className="text-xs text-slate-500">{t.clientEmail ?? ""}</div>
              </td>
              <td className="px-4 py-3 text-slate-700">{t.ticketTypeName ?? "—"}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[t.status]}`}
                >
                  {TICKET_STATUS_LABELS[t.status]}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-500">{formatDateTime(t.createdAt)}</td>
              <td className="px-4 py-3 text-slate-500">{formatDateTime(t.updatedAt)}</td>
              {archived && (
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRestore?.(t.id);
                      }}
                      className="rounded-lg border border-emerald-300 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                    >
                      Restaurar
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onHardDelete?.(t);
                      }}
                      className="rounded-lg border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
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
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "">("");
  const [typeFilter, setTypeFilter] = useState<number | "">("");

  const [adminTypes, setAdminTypes] = useState<TicketType[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const archived = activeTab === "archivo";

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("ticketTypeId", String(typeFilter));
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (archived) params.set("archived", "1");
      const qs = params.toString();
      const data = await fetchJson<{ tickets: Ticket[] }>(
        `/api/admin/tickets${qs ? `?${qs}` : ""}`
      );
      setTickets(data.tickets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar solicitudes");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, debouncedSearch, archived]);

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
    loadTickets();
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
      items: tickets.filter((t) => g.statuses.includes(t.status)),
    }));
  }, [tickets]);

  return (
    <div className="flex h-full flex-col bg-[var(--color-surface)]">
      {/* Tabs */}
      <div className="shrink-0 px-4 pt-4 sm:px-6">
        <div className="flex gap-1 border-b border-slate-200">
          <button
            onClick={() => setActiveTab("solicitudes")}
            className={`rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "solicitudes"
                ? "-mb-px border border-slate-200 border-b-white bg-white text-slate-900"
                : "text-slate-500 hover:bg-slate-100/60 hover:text-slate-700"
            }`}
          >
            Solicitudes
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveTab("archivo")}
              className={`rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === "archivo"
                  ? "-mb-px border border-slate-200 border-b-white bg-white text-slate-900"
                  : "text-slate-500 hover:bg-slate-100/60 hover:text-slate-700"
              }`}
            >
              Archivo
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setActiveTab("tipos")}
              className={`rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === "tipos"
                  ? "-mb-px border border-slate-200 border-b-white bg-white text-slate-900"
                  : "text-slate-500 hover:bg-slate-100/60 hover:text-slate-700"
              }`}
            >
              Tipos de ticket
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setActiveTab("plantillas")}
              className={`rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === "plantillas"
                  ? "-mb-px border border-slate-200 border-b-white bg-white text-slate-900"
                  : "text-slate-500 hover:bg-slate-100/60 hover:text-slate-700"
              }`}
            >
              Plantillas de notificación
            </button>
          )}
        </div>
      </div>

      {activeTab === "tipos" && isAdmin ? (
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <TicketTypesManager />
        </div>
      ) : activeTab === "plantillas" && isAdmin ? (
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <NotificationTemplatesManager />
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Filtros */}
          <div className="shrink-0 space-y-3 px-4 pt-4 pb-3 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-slate-900">
                {archived ? "Archivo" : "Solicitudes"}
              </h2>
              {!archived && (
                <button
                  type="button"
                  onClick={() => setNoticeOpen(true)}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Notificación
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por folio, cliente o correo..."
                className="min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none"
              />
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as TicketStatus | "")
                }
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-emerald-400 focus:outline-none"
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
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-emerald-400 focus:outline-none"
              >
                <option value="">Todos los tipos</option>
                {typeOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Lista */}
          <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-4 sm:px-6">
            {loading ? (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
                Cargando solicitudes...
              </div>
            ) : error ? (
              <div className="rounded-xl border border-red-200 bg-white px-4 py-6 text-center text-sm text-red-700">
                {error}
                <button
                  onClick={loadTickets}
                  className="ml-2 font-medium underline hover:no-underline"
                >
                  Reintentar
                </button>
              </div>
            ) : tickets.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">
                {archived
                  ? "No hay solicitudes en el archivo."
                  : "No hay solicitudes con estos filtros."}
              </div>
            ) : archived ? (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <TicketTable
                  items={tickets}
                  archived
                  onOpen={setSelectedTicketId}
                  onRestore={handleRestore}
                  onHardDelete={handleHardDelete}
                />
              </div>
            ) : (
              groups
                .filter((g) => g.items.length > 0)
                .map((g) => (
                  <div key={g.key}>
                    <div className="mb-2 flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-700">
                        {g.label}
                      </h3>
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {g.items.length}
                      </span>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <TicketTable
                        items={g.items}
                        archived={false}
                        onOpen={setSelectedTicketId}
                      />
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      )}

      {selectedTicketId != null && (
        <TicketDetailDrawer
          ticketId={selectedTicketId}
          refreshSignal={refreshSignal}
          isAdmin={isAdmin}
          onClose={() => setSelectedTicketId(null)}
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
