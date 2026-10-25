"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IneAdminPanel } from "@/components/admin/IneAdminPanel";

interface AdminClaim {
  id: number;
  status: "pending" | "conflict" | "approved" | "rejected";
  developmentId: number;
  developmentName: string | null;
  propertyIdentifier: string;
  condominioId: number | null;
  numVivienda: number | null;
  holdReason: string | null;
  reviewedBy: string | null;
  reviewedAt: number | null;
  createdAt: number;
  portalUserId: number;
  userName: string;
  userEmail: string;
  userPhone: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  conflict: "Conflicto",
  approved: "Aprobado",
  rejected: "Rechazado",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  conflict: "bg-rose-100 text-rose-800 border-rose-200",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejected: "bg-slate-100 text-slate-700 border-slate-200",
};

function formatDate(unix: number) {
  return new Date(unix * 1000).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PortalClaimsAdmin() {
  const [claims, setClaims] = useState<AdminClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"pending,conflict" | "approved" | "rejected">(
    "pending,conflict"
  );

  // Review modal
  const [selected, setSelected] = useState<AdminClaim | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  // Refs para accesibilidad del modal
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/portal-claims?status=${filter}`);
      if (!res.ok) throw new Error("Error al cargar reclamos");
      const data = await res.json();
      setClaims(data.claims ?? []);
    } catch {
      setError("No se pudieron cargar los reclamos.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  /** Cierra el modal y restaura el foco al botón que lo abrió. */
  const handleClose = useCallback(() => {
    setSelected(null);
    setRejectReason("");
    setActionError("");
    const el = triggerRef.current;
    triggerRef.current = null;
    // Diferir un frame para que React desmonte el modal antes de restaurar foco.
    requestAnimationFrame(() => el?.focus());
  }, []);

  // Focus trap + Escape + scroll lock cuando el modal está abierto.
  useEffect(() => {
    if (!selected) return;
    const root = modalRef.current;
    if (!root) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const getFocusable = (): HTMLElement[] =>
      Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );

    // Foco inicial al primer elemento interactivo.
    requestAnimationFrame(() => getFocusable()[0]?.focus());

    const onKey = (e: KeyboardEvent) => {
      if (!root.contains(e.target as Node)) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        handleClose();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = getFocusable();
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [selected, handleClose]);

  const handleApprove = async (claimId: number) => {
    setActionLoading(true);
    setActionError("");
    try {
      const res = await fetch(`/api/admin/portal-claims/${claimId}/approve`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al aprobar");
      handleClose();
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error al aprobar");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (claimId: number) => {
    if (!rejectReason.trim()) {
      setActionError("La razón de rechazo es obligatoria.");
      return;
    }
    setActionLoading(true);
    setActionError("");
    try {
      const res = await fetch(`/api/admin/portal-claims/${claimId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al rechazar");
      handleClose();
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error al rechazar");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Verificación de cuentas</h2>
        <div className="ml-auto flex gap-2" role="group" aria-label="Filtrar por estado">
          {(["pending,conflict", "approved", "rejected"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f
                  ? "border-violet-300 bg-violet-50 text-violet-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {f === "pending,conflict"
                ? "Pendientes / Conflicto"
                : f === "approved"
                  ? "Aprobados"
                  : "Rechazados"}
            </button>
          ))}
          <button
            onClick={load}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            ↻ Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : claims.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
          No hay reclamos en este estado.
        </div>
      ) : (
        <div className="space-y-3">
          {claims.map((claim) => (
            <div
              key={claim.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start gap-3">
                {/* Status badge */}
                <span
                  className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[claim.status] ?? ""}`}
                >
                  {STATUS_LABELS[claim.status] ?? claim.status}
                </span>

                {/* Datos principales */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {claim.userName}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{claim.userEmail}</p>
                  {claim.userPhone && (
                    <p className="text-xs text-slate-500">{claim.userPhone}</p>
                  )}
                </div>

                {/* Vivienda */}
                <div className="text-right text-xs text-slate-600">
                  <p className="font-medium">{claim.developmentName ?? `Dev #${claim.developmentId}`}</p>
                  {claim.numVivienda ? (
                    <p>
                      {claim.condominioId ? `Condo #${claim.condominioId} · ` : ""}
                      Vivienda {claim.numVivienda}
                    </p>
                  ) : (
                    <p className="font-mono">{claim.propertyIdentifier}</p>
                  )}
                  <p className="text-slate-400 mt-0.5">{formatDate(claim.createdAt)}</p>
                </div>
              </div>

              {/* Razón de rechazo si la hay */}
              {claim.holdReason && claim.status === "rejected" && (
                <p className="mt-2 text-xs text-slate-500 border-t border-slate-100 pt-2">
                  <span className="font-medium">Razón:</span> {claim.holdReason}
                </p>
              )}

              {/* Acciones */}
              {(claim.status === "pending" || claim.status === "conflict") && (
                <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                  <button
                    onClick={(e) => {
                      triggerRef.current = e.currentTarget;
                      setSelected(claim);
                      setRejectReason("");
                      setActionError("");
                    }}
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    aria-label={`Revisar solicitud de ${claim.userName}`}
                  >
                    Revisar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal de revisión — accesible: focus trap, Escape, aria-modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="claims-modal-title"
            tabIndex={-1}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl outline-none"
          >
            <h3 id="claims-modal-title" className="text-base font-semibold text-slate-900 mb-1">
              Revisar solicitud de cuenta
            </h3>

            {/* Datos del solicitante */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm space-y-1 mb-4">
              <div className="flex justify-between">
                <span className="text-slate-500">Nombre</span>
                <span className="font-medium">{selected.userName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Correo</span>
                <span className="font-medium text-xs">{selected.userEmail}</span>
              </div>
              {selected.userPhone && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Teléfono</span>
                  <span className="font-medium">{selected.userPhone}</span>
                </div>
              )}
              <hr className="border-slate-200" />
              <div className="flex justify-between">
                <span className="text-slate-500">Desarrollo</span>
                <span className="font-medium">{selected.developmentName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Vivienda</span>
                <span className="font-medium">
                  {selected.numVivienda
                    ? `#${selected.numVivienda}`
                    : selected.propertyIdentifier}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Estado</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-medium border ${STATUS_COLORS[selected.status]}`}
                >
                  {STATUS_LABELS[selected.status]}
                </span>
              </div>
              <hr className="border-slate-200" />
              <div className="pt-1">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">INE</p>
                <IneAdminPanel portalUserId={selected.portalUserId} />
              </div>
            </div>

            {/* Razón de rechazo */}
            <div className="mb-4">
              <label
                htmlFor="reject-reason"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Razón de rechazo{" "}
                <span className="text-slate-400">(obligatoria para rechazar)</span>
              </label>
              <textarea
                id="reject-reason"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
                placeholder="Describe el motivo del rechazo…"
              />
            </div>

            {actionError && (
              <p className="mb-3 text-sm text-rose-600">{actionError}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleClose}
                disabled={actionLoading}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleReject(selected.id)}
                disabled={actionLoading || !rejectReason.trim()}
                className="flex-1 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 transition-colors disabled:opacity-50"
              >
                {actionLoading ? "…" : "Rechazar"}
              </button>
              <button
                onClick={() => handleApprove(selected.id)}
                disabled={actionLoading}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {actionLoading ? "…" : "Aprobar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
