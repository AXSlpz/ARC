"use client";

import { useState } from "react";
import { usePortalSocket } from "@/hooks/usePortalSocket";
import { TICKET_STATUS_LABELS, type TicketStatus } from "@/lib/portal/types";

const TOAST_MS = 5_000;

interface ToastItem {
  id: number;
  folio: string;
  label: string;
}

function statusLabel(value: unknown): string {
  if (typeof value === "string" && value in TICKET_STATUS_LABELS) {
    return TICKET_STATUS_LABELS[value as TicketStatus];
  }
  return "actualizado";
}

/** Aviso breve cuando el comité cambia el estatus de una solicitud de este cliente. */
export function PortalStatusToast({ userId }: { userId: number }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  usePortalSocket(true, (event, data) => {
    if (event !== "ticket") return;
    if (Number(data?.portalUserId) !== userId) return;
    if (data?.actor !== "admin" || data?.kind !== "status") return;

    const id = Date.now() + Math.floor(Math.random() * 1000);
    const item: ToastItem = {
      id,
      folio: String(data.folio ?? "Tu solicitud"),
      label: statusLabel(data.toStatus),
    };
    setItems((prev) => [...prev.slice(-3), item]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((entry) => entry.id !== id));
    }, TOAST_MS);
  });

  if (items.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed right-4 top-20 z-[80] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      aria-live="polite"
    >
      {items.map((item) => (
        <div
          key={item.id}
          role="status"
          className="pointer-events-auto rounded-xl border border-violet-200 bg-white px-4 py-3 shadow-lg ring-1 ring-black/5"
        >
          <p className="text-sm font-semibold text-slate-900">Estatus actualizado</p>
          <p className="mt-0.5 text-sm text-slate-600">
            {item.folio} ahora está en {item.label}.
          </p>
        </div>
      ))}
    </div>
  );
}
