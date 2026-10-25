"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ticketRequestTitle, type Ticket } from "@/lib/portal/types";
import { fetchJson, formatDate } from "@/components/portal/portalClient";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { PortalModuleBack } from "@/components/portal/PortalModuleBack";
import { usePortalSocket } from "@/hooks/usePortalSocket";

export function TicketsListClient({
  userId,
  initialTickets,
  initialError = "",
}: {
  userId: number;
  initialTickets: Ticket[];
  initialError?: string;
}) {
  const [tickets, setTickets] = useState<Ticket[]>(initialTickets);
  const [error, setError] = useState(initialError);

  useEffect(() => {
    setTickets(initialTickets);
    setError(initialError);
  }, [initialTickets, initialError]);

  const loadTickets = useCallback(async () => {
    const data = await fetchJson<{ tickets: Ticket[] }>("/api/portal/tickets");
    setTickets(data.tickets);
    setError("");
  }, []);

  const refetchingRef = useRef(false);
  const softRefresh = useCallback(() => {
    if (refetchingRef.current) return;
    refetchingRef.current = true;
    loadTickets()
      .catch((err) => {
        setError(
          err instanceof Error
            ? err.message
            : "No se pudieron actualizar tus solicitudes",
        );
      })
      .finally(() => {
        refetchingRef.current = false;
      });
  }, [loadTickets]);

  usePortalSocket(true, (event, data) => {
    if (event !== "ticket") return;
    if (Number(data?.portalUserId) !== userId) return;
    softRefresh();
  });

  useEffect(() => {
    const interval = setInterval(softRefresh, 15_000);
    const onVis = () => {
      if (document.visibilityState === "visible") softRefresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [softRefresh]);

  return (
    <div>
      <div className="mb-4">
        <PortalModuleBack />
      </div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
          Mis solicitudes
        </h1>
        <Link
          href="/portal/tickets/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="hidden sm:inline">Nueva solicitud</span>
          <span className="sm:hidden">Nueva</span>
        </Link>
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {tickets.length === 0 && !error && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-base font-medium text-slate-700">
            Aún no tienes solicitudes
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Crea tu primera solicitud para comenzar el seguimiento.
          </p>
          <Link
            href="/portal/tickets/new"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            Crear solicitud
          </Link>
        </div>
      )}

      {tickets.length > 0 && (
        <ul className="space-y-3">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Link
                href={`/portal/tickets/${ticket.id}`}
                prefetch
                className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {ticketRequestTitle(ticket)}
                      </p>
                      {ticket.origin === "admin_notice" && (
                        <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                          Notificación de administración
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-slate-500">
                      {ticket.folio}
                    </p>
                  </div>
                  <StatusBadge status={ticket.status} />
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  Creada el {formatDate(ticket.createdAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
