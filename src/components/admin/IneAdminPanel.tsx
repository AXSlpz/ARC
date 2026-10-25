"use client";

import { useEffect, useState } from "react";
import { IneFieldsList } from "@/components/portal/IneCapture";
import type { IneFields } from "@/lib/portal/ine-fields";

interface IneAdminView {
  linked: boolean;
  portalUserId: number | null;
  fields: IneFields | null;
  hasFile: boolean;
  hasBack: boolean;
}

export function IneAdminPanel({
  portalUserId,
  residenteId,
}: {
  portalUserId?: number;
  residenteId?: number;
}) {
  const [data, setData] = useState<IneAdminView | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (portalUserId) params.set("portalUserId", String(portalUserId));
    if (residenteId) params.set("residenteId", String(residenteId));
    let active = true;
    fetch(`/api/admin/identity?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("No se pudo cargar la INE.");
        return (await res.json()) as IneAdminView;
      })
      .then((view) => {
        if (active) setData(view);
      })
      .catch(() => {
        if (active) setError("No se pudo cargar la INE.");
      });
    return () => {
      active = false;
    };
  }, [portalUserId, residenteId]);

  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (!data) return <p className="text-sm text-slate-500">Cargando INE…</p>;
  if (!data.linked) {
    return <p className="text-sm text-slate-500">Este residente no tiene cuenta del portal.</p>;
  }
  if (!data.fields) {
    return <p className="text-sm text-slate-500">Sin INE registrada.</p>;
  }

  const fileUrl = (side: "front" | "back") =>
    `/api/admin/identity/file?portalUserId=${data.portalUserId}&side=${side}`;

  return (
    <div className="space-y-3">
      <IneFieldsList fields={data.fields} />
      {data.fields.expired && (
        <p className="text-sm text-rose-600">Esta credencial está vencida.</p>
      )}
      <div className="flex flex-wrap gap-3 text-sm">
        {data.hasFile && (
          <a
            href={fileUrl("front")}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-emerald-700 underline"
          >
            Ver frente
          </a>
        )}
        {data.hasBack && (
          <a
            href={fileUrl("back")}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-emerald-700 underline"
          >
            Ver reverso
          </a>
        )}
      </div>
    </div>
  );
}
