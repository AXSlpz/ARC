"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "./portalClient";

interface ClaimSummary {
  id: number;
  status: "pending" | "conflict" | "approved" | "rejected";
  developmentId: number;
  propertyIdentifier: string;
  createdAt: number;
}

interface Props {
  /** Claim pre-cargado en el servidor (SSR). Evita el flash de contenido. */
  initialClaim?: ClaimSummary | null;
}

/**
 * Banner persistente que se muestra a usuarios con claim pending o conflict.
 * SSR-aware: acepta initialClaim desde el layout para mostrar sin parpadeo.
 * Se refresca client-side para capturar cambios de estado en tiempo real.
 */
export function PendingClaimBanner({ initialClaim }: Props) {
  const [claim, setClaim] = useState<ClaimSummary | null>(initialClaim ?? null);

  useEffect(() => {
    // Refrescar el estado del claim (por si cambió desde el SSR).
    // fetchJson aporta timeout de 8 s; el AbortController cancela si el
    // componente se desmonta antes de que responda el servidor.
    const ac = new AbortController();
    fetchJson<{ user: unknown; claim: ClaimSummary | null }>("/api/portal/me", {
      signal: ac.signal,
    })
      .then((data) => {
        if (!ac.signal.aborted) setClaim(data.claim ?? null);
      })
      .catch(() => {}); // timeout / red / 401 → mantener initialClaim
    return () => ac.abort();
  }, []);

  if (!claim) return null;
  if (claim.status !== "pending" && claim.status !== "conflict") return null;

  const isConflict = claim.status === "conflict";

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm mb-4 ${
        isConflict
          ? "border-amber-300 bg-amber-50 text-amber-900"
          : "border-violet-300 bg-violet-50 text-violet-900"
      }`}
      role="alert"
    >
      {/* Icono SVG decorativo (aria-hidden) */}
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {isConflict ? (
          <svg className="h-4 w-4 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
        ) : (
          <svg className="h-4 w-4 text-violet-600" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M10 2a6 6 0 00-6 6v.5l-1.447 2.894A1 1 0 003.447 13H7a3 3 0 006 0h3.553a1 1 0 00.894-1.447L16 8.5V8a6 6 0 00-6-6zm0 13a1 1 0 01-1-1h2a1 1 0 01-1 1z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </span>
      <div>
        <p className="font-semibold">
          {isConflict
            ? "Solicitud en revisión por conflicto"
            : "Cuenta pendiente de verificación"}
        </p>
        <p className="mt-0.5 text-xs opacity-80">
          {isConflict
            ? "Existe otra solicitud activa para tu vivienda. Un administrador revisará el caso. Tus solicitudes estarán retenidas hasta la resolución."
            : "Un administrador revisará que eres el propietario de la vivienda indicada. Tus solicitudes se procesarán una vez aprobada la cuenta."}
        </p>
      </div>
    </div>
  );
}
