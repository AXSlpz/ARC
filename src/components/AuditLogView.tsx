"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getActionLabel,
  getAuditDetailRows,
} from "@/lib/audit-helpers";

interface AuditEntry {
  id: number;
  userId: number | null;
  username: string;
  action: string;
  entityType: string | null;
  entityId: number | null;
  details: Record<string, unknown> | null;
  summary: string;
  createdAt: number;
}

function AuditDetailContent({
  entry,
  onClose,
}: {
  entry: AuditEntry;
  onClose: () => void;
}) {
  const detailRows = getAuditDetailRows(entry.details);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Detalle del evento
          </p>
          <h3
            id="audit-detail-title"
            className="text-base font-semibold text-gray-900 mt-1"
          >
            {getActionLabel(entry.action)}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 text-lg leading-none"
          aria-label="Cerrar detalle"
        >
          ×
        </button>
      </div>

      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-4 py-1.5 border-b border-gray-200">
          <dt className="text-gray-500">Usuario</dt>
          <dd className="font-medium text-gray-900 text-right">
            {entry.username === "sistema"
              ? "Sistema (conexión automática)"
              : entry.username}
          </dd>
        </div>
        <div className="flex justify-between gap-4 py-1.5 border-b border-gray-200">
          <dt className="text-gray-500">Fecha y hora</dt>
          <dd className="text-gray-900 text-right">
            {new Date(entry.createdAt * 1000).toLocaleString("es-MX", {
              dateStyle: "full",
              timeStyle: "medium",
            })}
          </dd>
        </div>
        {entry.entityType && (
          <div className="flex justify-between gap-4 py-1.5 border-b border-gray-200">
            <dt className="text-gray-500">Entidad</dt>
            <dd className="text-gray-900 text-right">
              {entry.entityType}
              {entry.entityId != null ? ` #${entry.entityId}` : ""}
            </dd>
          </div>
        )}
      </dl>

      {detailRows.length > 0 ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-2">
            Información adicional
          </p>
          <dl className="space-y-2 rounded-lg bg-white border border-gray-100 p-3 text-sm">
            {detailRows.map((row) => (
              <div key={row.key} className="grid grid-cols-1 gap-0.5">
                <dt className="text-gray-500 text-xs">{row.label}</dt>
                <dd className="text-gray-900 break-words">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          Este evento no tiene detalles adicionales guardados (registro anterior
          a la mejora de auditoría).
        </p>
      )}
    </div>
  );
}

export function AuditLogView() {
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const [loading, setLoading] = useState(true);

  const closeDetail = useCallback(() => setSelected(null), []);

  useEffect(() => {
    setLoading(true);
    fetch("/api/admin/audit")
      .then((r) => r.json())
      .then((data) => {
        setAudit(data);
        setSelected(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDetail();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, closeDetail]);

  if (loading) {
    return <p className="text-sm text-gray-500">Cargando auditoría...</p>;
  }

  if (audit.length === 0) {
    return (
      <p className="text-sm text-gray-500">No hay eventos registrados aún.</p>
    );
  }

  return (
    <>
      <div className="flex flex-col lg:flex-row gap-4 min-h-[420px]">
        <div className="flex-1 min-w-0 overflow-auto rounded-xl border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500 sticky top-0">
              <tr>
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">Usuario</th>
                <th className="px-3 py-2 font-medium">Evento</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((entry) => {
                const isSelected = selected?.id === entry.id;
                return (
                  <tr
                    key={entry.id}
                    onClick={() => setSelected(entry)}
                    className={`border-t cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-emerald-50 hover:bg-emerald-50"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">
                      {new Date(entry.createdAt * 1000).toLocaleString("es-MX", {
                        dateStyle: "short",
                        timeStyle: "medium",
                      })}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-gray-800">
                      {entry.username}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">
                      {entry.summary}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="hidden lg:flex lg:w-96 shrink-0 flex-col rounded-xl border border-gray-200 bg-gray-50 p-4">
          {selected ? (
            <AuditDetailContent entry={selected} onClose={closeDetail} />
          ) : (
            <p className="text-sm text-gray-500 text-center px-4 m-auto">
              Haz clic en un evento de la lista para ver quién lo hizo, cuándo y
              todos los detalles.
            </p>
          )}
        </div>
      </div>

      {selected ? (
        <div
          className="lg:hidden fixed inset-0 z-[70] flex items-end justify-center sm:items-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="audit-detail-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            onClick={closeDetail}
            aria-label="Cerrar detalle"
          />
          <div className="relative w-full max-w-lg max-h-[min(85dvh,640px)] overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-2xl">
            <AuditDetailContent entry={selected} onClose={closeDetail} />
          </div>
        </div>
      ) : null}
    </>
  );
}
