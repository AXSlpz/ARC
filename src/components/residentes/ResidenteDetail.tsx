"use client";

import { useMemo, useState } from "react";
import { SendNoticeModal } from "@/components/tickets/SendNoticeModal";

const FMT = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

function fmtMoney(val: number | null): string {
  if (val == null) return "—";
  return FMT.format(val);
}

interface Residente {
  id: number;
  condominio_name: string;
  condominio_prefijo?: string;
  num_vivienda: number | null;
  num_coto: string | number | null;
  cf_property_id?: string | null;
  prototipo_id?: number | null;
  prototipo_name?: string | null;
  nombre: string;
  celular: number | null;
  email: string | null;
  fecha_entrega: string | null;
  metros_cuadrados: number | null;
  cuota_int: number | null;
  cuota_ext: number | null;
  cuota_completa: number | null;
  cuota_int_pronpago: number | null;
  cuota_ext_pronpago: number | null;
  cuota_comp_pronpago: number | null;
  servicio_luz: number | null;
  nombre_contacto1: string | null;
  celular_contacto1: number | null;
  parentesco_contacto1: string | null;
  nombre_contacto2?: string | null;
  celular_contacto2?: number | null;
  parentesco_contacto2?: string | null;
  nombre_contacto3?: string | null;
  celular_contacto3?: number | null;
  parentesco_contacto3?: string | null;
  mes_pago: string | null;
  nombre_expropietario: string | null;
  celular_expropietario: number | null;
  fecha_entrega_primer: string | null;
  tag1_estatus?: "Activo" | "Inactivo" | null;
  tag1_id?: number | null;
  tag1_placa?: string | null;
  tag1_modelo?: string | null;
  tag1_color?: string | null;
  tag2_estatus?: "Activo" | "Inactivo" | null;
  tag2_id?: number | null;
  tag2_placa?: string | null;
  tag2_modelo?: string | null;
  tag2_color?: string | null;
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

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-violet-400 font-medium">{label}</p>
      <p className="text-sm text-gray-900 mt-0.5">
        {value != null && value !== "" ? String(value) : "—"}
      </p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="mb-3 w-full border-b border-violet-200 pb-1.5 text-sm font-semibold tracking-wider text-violet-600 uppercase">
        {title}
      </h4>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">{children}</div>
    </div>
  );
}

function hasContact(
  nombre: string | null | undefined,
  celular: number | null | undefined,
  parentesco: string | null | undefined
): boolean {
  return !!(nombre || celular || parentesco);
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
    [
      r.id,
      r.nombre,
      r.celular,
      r.email,
      r.condominio_name,
      r.num_vivienda,
      r.num_coto,
    ]
  );

  return (
    <div className="flex flex-col h-full bg-white border-l border-violet-100">
      <div className="flex items-center justify-between bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-4 shrink-0">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-white truncate">
            {r.nombre}
          </h3>
          <p className="text-violet-200 text-sm truncate">
            {r.condominio_name}
            {r.num_vivienda != null && ` · Viv. ${r.num_vivienda}`}
            {r.num_coto != null && ` · Coto ${r.num_coto}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {vacante && r.active ? (
            <span className="rounded-full bg-amber-500/20 text-amber-100 text-xs px-2 py-0.5 font-medium">
              Vacante
            </span>
          ) : null}
          {!r.active ? (
            <span className="rounded-full bg-red-500/20 text-red-200 text-xs px-2 py-0.5 font-medium">
              Baja
            </span>
          ) : null}
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1"
            aria-label="Cerrar detalle"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
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
        <Section title="Datos Generales">
          <Field label="Nombre" value={r.nombre} />
          <Field label="Celular" value={r.celular} />
          <Field label="Email" value={r.email} />
          <Field
            label="Condominio"
            value={r.pendiente_asignacion ? "Sin asignar" : r.condominio_name}
          />
        </Section>

        <Section title="Vivienda">
          <Field label="Num° Vivienda" value={r.num_vivienda} />
          <Field label="Num° Coto" value={r.num_coto} />
          <Field label="Prototipo" value={r.prototipo_name} />
          <Field label="CF Property ID" value={r.cf_property_id} />
          <Field
            label="m²"
            value={r.metros_cuadrados != null ? `${r.metros_cuadrados} m²` : null}
          />
        </Section>

        <Section title="Contacto 1">
          <Field label="Nombre" value={r.nombre_contacto1} />
          <Field label="Celular" value={r.celular_contacto1} />
          <Field label="Parentesco" value={r.parentesco_contacto1} />
        </Section>

        {hasContact(r.nombre_contacto2, r.celular_contacto2, r.parentesco_contacto2) && (
          <Section title="Contacto 2">
            <Field label="Nombre" value={r.nombre_contacto2} />
            <Field label="Celular" value={r.celular_contacto2} />
            <Field label="Parentesco" value={r.parentesco_contacto2} />
          </Section>
        )}

        {hasContact(r.nombre_contacto3, r.celular_contacto3, r.parentesco_contacto3) && (
          <Section title="Contacto 3">
            <Field label="Nombre" value={r.nombre_contacto3} />
            <Field label="Celular" value={r.celular_contacto3} />
            <Field label="Parentesco" value={r.parentesco_contacto3} />
          </Section>
        )}

        <Section title="Ex-Propietario">
          <Field label="Nombre" value={r.nombre_expropietario} />
          <Field label="Celular" value={r.celular_expropietario} />
          <Field label="Fecha Entrega 1er" value={r.fecha_entrega_primer} />
        </Section>
      </div>

      <div className="border-t border-violet-100 px-5 py-3 flex flex-wrap items-center gap-2 shrink-0">
        <button
          onClick={onEdit}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
        >
          {vacante && r.active ? "Asignar nuevo propietario" : "Editar"}
        </button>
        {onAddProperty && (
          <button
            type="button"
            onClick={onAddProperty}
            className="rounded-lg border border-violet-200 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50"
          >
            Agregar otra propiedad
          </button>
        )}
        {r.active && !vacante ? (
          <>
            <button
              type="button"
              onClick={() => setShowNoticeModal(true)}
              className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-amber-50"
            >
              Notificación
            </button>
            <button
              onClick={onDeactivate}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Marcar Vacante
            </button>
          </>
        ) : !r.active ? (
          <button
            onClick={onReactivate}
            className="rounded-lg border border-green-200 px-4 py-2 text-sm font-medium text-green-600 hover:bg-green-50"
          >
            Reactivar
          </button>
        ) : null}
      </div>

      <SendNoticeModal
        open={showNoticeModal}
        onClose={() => setShowNoticeModal(false)}
        preselectedResidente={preselectedResidente}
      />
    </div>
  );
}
