"use client";

import { useState, useTransition } from "react";
import type { ServiceCatalogItem } from "@/lib/portal/services-catalog";
import { PortalModuleBack } from "@/components/portal/PortalModuleBack";
import type { PortalUser } from "@/lib/portal/types";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Props {
  user: PortalUser;
  initialServices: ServiceCatalogItem[];
  ticketTypeId: number | null;
  priceListId: number;
}

interface FormState {
  qty: string;
  descripcionNecesidad: string;
  preferenciaContacto: string;
  notasAdjuntos: string;
}

type DialogState =
  | { kind: "closed" }
  | { kind: "form"; service: ServiceCatalogItem }
  | { kind: "submitting"; service: ServiceCatalogItem }
  | { kind: "success"; folio: string; serviceName: string }
  | { kind: "error"; message: string; service: ServiceCatalogItem };

// ── Helpers de formato ────────────────────────────────────────────────────────

function formatPrice(item: ServiceCatalogItem): string {
  if (item.priceMode === "custom_quote" || item.unitPrice === null) {
    return "Cotización personalizada";
  }
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: item.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(item.unitPrice);
}

const CONTACT_OPTIONS = [
  "WhatsApp",
  "Correo electrónico",
  "Llamada telefónica",
];

// ── Componente principal ──────────────────────────────────────────────────────

export function ServiciosCatalogClient({
  initialServices,
  ticketTypeId,
  priceListId,
}: Props) {
  const [services] = useState<ServiceCatalogItem[]>(initialServices);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const [form, setForm] = useState<FormState>({
    qty: "1",
    descripcionNecesidad: "",
    preferenciaContacto: "",
    notasAdjuntos: "",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Filtrado local (client-side search)
  const needle = search.toLowerCase().trim();
  const filtered = needle
    ? services.filter(
        (s) =>
          s.name.toLowerCase().includes(needle) ||
          (s.description ?? "").toLowerCase().includes(needle) ||
          s.sku.toLowerCase().includes(needle)
      )
    : services;

  // ── Handlers ───────────────────────────────────────────────────────────────

  function openForm(service: ServiceCatalogItem) {
    setForm({
      qty: "1",
      descripcionNecesidad: "",
      preferenciaContacto: "",
      notasAdjuntos: "",
    });
    setFormError(null);
    setDialog({ kind: "form", service });
  }

  function closeDialog() {
    setDialog({ kind: "closed" });
    setFormError(null);
  }

  function handleSubmit(service: ServiceCatalogItem) {
    if (!ticketTypeId) {
      setFormError("Tipo de solicitud no disponible. Contacta al administrador.");
      return;
    }

    const desc = form.descripcionNecesidad.trim();
    if (!desc) {
      setFormError("La descripción de la necesidad es obligatoria.");
      return;
    }
    if (!form.preferenciaContacto) {
      setFormError("Selecciona una preferencia de contacto.");
      return;
    }

    setFormError(null);
    setDialog({ kind: "submitting", service });

    startTransition(async () => {
      try {
        const res = await fetch("/api/portal/servicios/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticketTypeId,
            productId: service.productId,
            qty: form.qty ? Number(form.qty) || null : null,
            descripcionNecesidad: desc,
            preferenciaContacto: form.preferenciaContacto,
            notasAdjuntos: form.notasAdjuntos.trim() || null,
            priceListId, // El servidor lo ignora para el precio, pero ayuda al routing
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setDialog({
            kind: "error",
            message: (data as { error?: string }).error ?? "Error al enviar solicitud.",
            service,
          });
          return;
        }

        const folio = (data as { ticket?: { folio?: string } }).ticket?.folio ?? "";
        setDialog({ kind: "success", folio, serviceName: service.name });
      } catch {
        setDialog({
          kind: "error",
          message: "Error de conexión. Intenta de nuevo.",
          service,
        });
      }
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <PortalModuleBack />
        <h1 className="mt-4 text-xl font-bold text-slate-900">Servicios ARC</h1>
        <p className="mt-1 text-sm text-slate-500">
          Explora y solicita servicios disponibles para tu vivienda.
        </p>
      </div>

      {/* Búsqueda */}
      <div className="relative">
        <label htmlFor="servicios-search" className="sr-only">
          Buscar servicios
        </label>
        <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
          <svg
            className="h-4 w-4 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z"
            />
          </svg>
        </div>
        <input
          id="servicios-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o descripción…"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          aria-label="Buscar servicios"
        />
      </div>

      {/* Estado vacío */}
      {filtered.length === 0 && (
        <div
          role="status"
          className="flex flex-col items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 py-12 text-center"
        >
          <svg
            className="h-10 w-10 text-slate-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
          <p className="text-sm text-slate-500">
            {search
              ? "No se encontraron servicios con ese criterio."
              : "No hay servicios disponibles en este momento."}
          </p>
        </div>
      )}

      {/* Catálogo */}
      <ul
        role="list"
        className="grid gap-4 sm:grid-cols-2"
        aria-label="Catálogo de servicios ARC"
      >
        {filtered.map((service) => (
          <li key={service.productId}>
            <article className="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-sm">
              {/* Info */}
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-semibold text-slate-900">
                    {service.name}
                  </h2>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      service.priceMode === "priced"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                    aria-label={
                      service.priceMode === "priced"
                        ? `Precio: ${formatPrice(service)}`
                        : "Cotización personalizada"
                    }
                  >
                    {formatPrice(service)}
                  </span>
                </div>

                {service.description && (
                  <p className="text-sm text-slate-600">{service.description}</p>
                )}

                <p className="text-xs text-slate-400">
                  Unidad: {service.unit} · SKU: {service.sku}
                </p>
              </div>

              {/* CTA */}
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => openForm(service)}
                  className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  aria-label={`Solicitar servicio: ${service.name}`}
                >
                  Solicitar
                </button>
              </div>
            </article>
          </li>
        ))}
      </ul>

      {/* ── Modal / Dialog ──────────────────────────────────────────────────── */}
      {dialog.kind !== "closed" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={
            dialog.kind === "success"
              ? "Solicitud enviada"
              : `Solicitar ${'service' in dialog ? dialog.service.name : ''}`
          }
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={dialog.kind === "success" ? closeDialog : undefined}
            aria-hidden="true"
          />

          {/* Panel */}
          <div className="relative z-10 mx-4 w-full max-w-lg rounded-2xl bg-white shadow-xl sm:mx-auto">
            {/* ── Éxito ── */}
            {dialog.kind === "success" && (
              <div className="flex flex-col items-center gap-4 p-8 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                  <svg
                    className="h-8 w-8 text-emerald-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    ¡Solicitud enviada!
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {dialog.serviceName}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 px-6 py-3 text-center">
                  <p className="text-xs text-slate-500">Folio</p>
                  <p className="mt-0.5 text-2xl font-bold tracking-widest text-slate-900">
                    {dialog.folio}
                  </p>
                </div>
                <p className="text-sm text-slate-500">
                  Te contactaremos según tu preferencia. Puedes seguir el estado
                  en <strong>Mis solicitudes</strong>.
                </p>
                <button
                  type="button"
                  onClick={closeDialog}
                  className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Entendido
                </button>
              </div>
            )}

            {/* ── Error ── */}
            {dialog.kind === "error" && (
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                    <svg
                      className="h-5 w-5 text-red-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-slate-900">
                    Error al enviar solicitud
                  </h3>
                </div>
                <p className="text-sm text-slate-600">{dialog.message}</p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={closeDialog}
                    className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDialog({ kind: "form", service: dialog.service })
                    }
                    className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Reintentar
                  </button>
                </div>
              </div>
            )}

            {/* ── Formulario / Submitting ── */}
            {(dialog.kind === "form" || dialog.kind === "submitting") && (
              <div className="p-6 space-y-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-slate-900">
                      {dialog.service.name}
                    </h3>
                    <p className="mt-0.5 text-sm font-medium text-blue-700">
                      {formatPrice(dialog.service)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeDialog}
                    disabled={dialog.kind === "submitting"}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 disabled:opacity-50"
                    aria-label="Cerrar"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                {dialog.service.description && (
                  <p className="text-sm text-slate-600">
                    {dialog.service.description}
                  </p>
                )}

                {/* Cantidad */}
                <div>
                  <label
                    htmlFor="svc-qty"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Cantidad{" "}
                    <span className="font-normal text-slate-400">(opcional)</span>
                  </label>
                  <input
                    id="svc-qty"
                    type="number"
                    min="1"
                    step="1"
                    value={form.qty}
                    onChange={(e) => setForm({ ...form, qty: e.target.value })}
                    disabled={dialog.kind === "submitting"}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50"
                    placeholder="1"
                  />
                </div>

                {/* Descripción */}
                <div>
                  <label
                    htmlFor="svc-desc"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    ¿Para qué lo necesitas?{" "}
                    <span className="text-red-500" aria-hidden="true">*</span>
                  </label>
                  <textarea
                    id="svc-desc"
                    rows={3}
                    value={form.descripcionNecesidad}
                    onChange={(e) =>
                      setForm({ ...form, descripcionNecesidad: e.target.value })
                    }
                    disabled={dialog.kind === "submitting"}
                    placeholder="Describe brevemente tu necesidad…"
                    aria-required="true"
                    className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50"
                    maxLength={2000}
                  />
                </div>

                {/* Preferencia de contacto */}
                <div>
                  <fieldset>
                    <legend className="mb-1.5 text-sm font-medium text-slate-700">
                      ¿Cómo prefieres que te contactemos?{" "}
                      <span className="text-red-500" aria-hidden="true">*</span>
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {CONTACT_OPTIONS.map((opt) => (
                        <label
                          key={opt}
                          className={`cursor-pointer rounded-xl border px-3 py-2 text-sm transition-colors ${
                            form.preferenciaContacto === opt
                              ? "border-blue-500 bg-blue-50 text-blue-700"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                          } ${dialog.kind === "submitting" ? "pointer-events-none opacity-50" : ""}`}
                        >
                          <input
                            type="radio"
                            name="svc-contacto"
                            value={opt}
                            checked={form.preferenciaContacto === opt}
                            onChange={() =>
                              setForm({ ...form, preferenciaContacto: opt })
                            }
                            disabled={dialog.kind === "submitting"}
                            className="sr-only"
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>

                {/* Notas adicionales */}
                <div>
                  <label
                    htmlFor="svc-notas"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Notas adicionales{" "}
                    <span className="font-normal text-slate-400">(opcional)</span>
                  </label>
                  <textarea
                    id="svc-notas"
                    rows={2}
                    value={form.notasAdjuntos}
                    onChange={(e) =>
                      setForm({ ...form, notasAdjuntos: e.target.value })
                    }
                    disabled={dialog.kind === "submitting"}
                    placeholder="Información adicional o descripción de archivos…"
                    className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50"
                    maxLength={1000}
                  />
                </div>

                {/* Error de validación */}
                {formError && (
                  <p
                    role="alert"
                    className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700"
                  >
                    {formError}
                  </p>
                )}

                {/* Acciones */}
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={closeDialog}
                    disabled={dialog.kind === "submitting" || isPending}
                    className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSubmit(dialog.service)}
                    disabled={dialog.kind === "submitting" || isPending}
                    className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                    aria-busy={dialog.kind === "submitting"}
                  >
                    {dialog.kind === "submitting" ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg
                          className="h-4 w-4 animate-spin"
                          viewBox="0 0 24 24"
                          fill="none"
                          aria-hidden="true"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                          />
                        </svg>
                        Enviando…
                      </span>
                    ) : (
                      "Confirmar solicitud"
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
