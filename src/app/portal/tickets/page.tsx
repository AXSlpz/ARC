"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PortalUser, Ticket } from "@/lib/portal/types";
import { fetchJson, formatDate } from "@/components/portal/portalClient";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { usePortalSocket } from "@/hooks/usePortalSocket";

export default function TicketsListPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [myUserId, setMyUserId] = useState<number | null>(null);

  const loadTickets = useCallback(async () => {
    const data = await fetchJson<{ tickets: Ticket[] }>("/api/portal/tickets");
    setTickets(data.tickets);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await fetchJson<{ user: PortalUser | null }>(
          "/api/portal/me",
        );
        if (!me.user) {
          router.replace("/portal");
          return;
        }
        if (active) setMyUserId(me.user.id);
        await loadTickets();
      } catch (err) {
        if (active)
          setError(
            err instanceof Error
              ? err.message
              : "No se pudieron cargar tus solicitudes",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router, loadTickets]);

  // Tiempo real + polling: admin o respuestas propias vía WhatsApp.
  const refetchingRef = useRef(false);
  const softRefresh = useCallback(() => {
    if (refetchingRef.current) return;
    refetchingRef.current = true;
    loadTickets().finally(() => {
      refetchingRef.current = false;
    });
  }, [loadTickets]);

  usePortalSocket(myUserId != null, (event, data) => {
    if (event !== "ticket") return;
    if (myUserId == null || Number(data?.portalUserId) !== myUserId) return;
    softRefresh();
  });

  useEffect(() => {
    if (myUserId == null) return;
    const interval = setInterval(softRefresh, 15_000);
    const onVis = () => {
      if (document.visibilityState === "visible") softRefresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [myUserId, softRefresh]);

  return (
    <div>
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

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Cargando solicitudes…
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {!loading && !error && tickets.length === 0 && (
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

      {!loading && !error && tickets.length > 0 && (
        <ul className="space-y-3">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Link
                href={`/portal/tickets/${ticket.id}`}
                className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {ticket.ticketTypeName ?? "Solicitud"}
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
