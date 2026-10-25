"use client";

import { useMemo, useState } from "react";
import { SendNoticeModal } from "@/components/tickets/SendNoticeModal";
import { IneAdminPanel } from "@/components/admin/IneAdminPanel";
import {
  DetailField,
  DetailPopup,
  DetailSection,
  detailBtnPress,
} from "./DetailPopup";

interface Residente {
  id: number;
  condominio_name: string;
  condominio_prefijo?: string;
  num_vivienda: number | null;
  num_coto: string | number | null;
  prototipo_id?: number | null;
  prototipo_name?: string | null;
  nombre: string;
  celular: number | null;
  email: string | null;
  metros_cuadrados: number | null;
  nombre_contacto1: string | null;
  celular_contacto1: number | null;
  parentesco_contacto1: string | null;
  nombre_contacto2?: string | null;
  celular_contacto2?: number | null;
  parentesco_contacto2?: string | null;
  nombre_contacto3?: string | null;
  celular_contacto3?: number | null;
  parentesco_contacto3?: string | null;
  nombre_expropietario: string | null;
  celular_expropietario: number | null;
  fecha_entrega_primer: string | null;
  ocupacion?: "Ocupado" | "Vacante";
  pendiente_asignacion?: number;
  active: number;
}

interface ResidenteDetailProps {
  residente: Residente;
  onEdit: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  onAddProperty?: () => void;
  onClose: () => void;
}

function isVacante(r: { ocupacion?: string; nombre: string }): boolean {
  return r.ocupacion === "Vacante" || r.nombre === "Vacante";
}

function hasContact(
  nombre: string | null | undefined,
  celular: number | null | undefined,
  parentesco: string | null | undefined
): boolean {
  return !!(nombre || celular || parentesco);
}

function subtitleFor(r: Residente): string {
  const unassigned =
    !r.condominio_name ||
    r.condominio_name.trim().toLowerCase() === "pendiente de asignacion";
  if (r.pendiente_asignacion && unassigned) return "Pendiente De Asignacion";
  const parts = [r.condominio_name];
  if (r.num_vivienda != null) parts.push(`Viv. ${r.num_vivienda}`);
  if (r.num_coto != null && String(r.num_coto).trim() !== "") {
    parts.push(`Coto ${r.num_coto}`);
  }
  return parts.filter(Boolean).join(" · ");
}

export function ResidenteDetail({
  residente: r,
  onEdit,
  onDeactivate,
  onReactivate,
  onAddProperty,
  onClose,
}: ResidenteDetailProps) {
  const vacante = isVacante(r);
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const preselectedResidente = useMemo(
    () => ({
      id: r.id,
      nombre: r.nombre,
      celular: r.celular,
      email: r.email,
      condominio_name: r.condominio_name,
      num_vivienda: r.num_vivienda,
      num_coto: r.num_coto,
    }),
    [r.id, r.nombre, r.celular, r.email, r.condominio_name, r.num_vivienda, r.num_coto]
  );

  return (
    <>
      <DetailPopup
        title={r.nombre}
        subtitle={subtitleFor(r)}
        onClose={onClose}
        headerExtra={
          <>
            {vacante && r.active ? (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-100">
                Vacante
              </span>
            ) : null}
            {!r.active ? (
              <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-200">
                Baja
              </span>
            ) : null}
          </>
        }
        footer={
          <>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onEdit}
                className={detailBtnPress(
                  "rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
                )}
              >
                {vacante && r.active ? "Asignar nuevo propietario" : "Editar"}
              </button>
              {onAddProperty ? (
                <button
                  type="button"
                  onClick={onAddProperty}
                  className={detailBtnPress(
                    "rounded-lg border border-violet-200 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50"
                  )}
                >
                  Agregar otra propiedad
                </button>
              ) : null}
              {r.active && !vacante ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowNoticeModal(true)}
                    className={detailBtnPress(
                      "rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-amber-50"
                    )}
                  >
                    Notificación
                  </button>
                  <button
                    type="button"
                    onClick={onDeactivate}
                    className={detailBtnPress(
                      "rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                    )}
                  >
                    Marcar Vacante
                  </button>
                </>
              ) : !r.active ? (
                <button
                  type="button"
                  onClick={onReactivate}
                  className={detailBtnPress(
                    "rounded-lg border border-green-200 px-4 py-2 text-sm font-medium text-green-600 hover:bg-green-50"
                  )}
                >
                  Reactivar
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className={detailBtnPress(
                "rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              )}
            >
              Cerrar
            </button>
          </>
        }
      >
        {r.pendiente_asignacion ? (
          <div className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            <p className="font-semibold">Pendiente de asignación</p>
            <p className="mt-0.5">
              Este cliente se registró desde el portal. Asígnale un
              condominio/vivienda y completa su información; al guardar con un
              condominio real se quitará esta marca.
            </p>
          </div>
        ) : null}

        <DetailSection title="Datos Generales">
          <DetailField label="Nombre" value={r.nombre} />
          <DetailField label="Celular" value={r.celular} />
          <DetailField label="Email" value={r.email} />
          <DetailField
            label="Condominio"
            value={r.pendiente_asignacion ? "Sin asignar" : r.condominio_name}
          />
        </DetailSection>

        <DetailSection title="INE">
          <div className="col-span-2">
            <IneAdminPanel residenteId={r.id} />
          </div>
        </DetailSection>

        <DetailSection title="Vivienda" columns={3}>
          <DetailField label="Num° Vivienda" value={r.num_vivienda} />
          <DetailField label="Num° Coto" value={r.num_coto} />
          <DetailField label="Prototipo" value={r.prototipo_name} />
          <DetailField
            label="m²"
            value={r.metros_cuadrados != null ? `${r.metros_cuadrados} m²` : null}
          />
        </DetailSection>

        {hasContact(r.nombre_contacto1, r.celular_contacto1, r.parentesco_contacto1) ? (
          <DetailSection title="Contacto 1" columns={3}>
            <DetailField label="Nombre" value={r.nombre_contacto1} />
            <DetailField label="Celular" value={r.celular_contacto1} />
            <DetailField label="Parentesco" value={r.parentesco_contacto1} />
          </DetailSection>
        ) : null}

        {hasContact(r.nombre_contacto2, r.celular_contacto2, r.parentesco_contacto2) ? (
          <DetailSection title="Contacto 2" columns={3}>
            <DetailField label="Nombre" value={r.nombre_contacto2} />
            <DetailField label="Celular" value={r.celular_contacto2} />
            <DetailField label="Parentesco" value={r.parentesco_contacto2} />
          </DetailSection>
        ) : null}

        {hasContact(r.nombre_contacto3, r.celular_contacto3, r.parentesco_contacto3) ? (
          <DetailSection title="Contacto 3" columns={3}>
            <DetailField label="Nombre" value={r.nombre_contacto3} />
            <DetailField label="Celular" value={r.celular_contacto3} />
            <DetailField label="Parentesco" value={r.parentesco_contacto3} />
          </DetailSection>
        ) : null}

        {r.nombre_expropietario || r.celular_expropietario || r.fecha_entrega_primer ? (
          <DetailSection title="Ex-Propietario" columns={3}>
            <DetailField label="Nombre" value={r.nombre_expropietario} />
            <DetailField label="Celular" value={r.celular_expropietario} />
            <DetailField label="Fecha Entrega 1er" value={r.fecha_entrega_primer} />
          </DetailSection>
        ) : null}
      </DetailPopup>

      <SendNoticeModal
        open={showNoticeModal}
        onClose={() => setShowNoticeModal(false)}
        preselectedResidente={preselectedResidente}
      />
    </>
  );
}
