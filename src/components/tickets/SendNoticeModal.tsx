"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NotificationTemplate } from "@/lib/portal/types";
import { useToast } from "@/components/Toast";
import { fetchJson } from "./helpers";
import {
  DetailPopup,
} from "@/components/residentes/DetailPopup";
import { fieldClass, primaryBtn, secondaryBtn } from "@/components/crm/CrmUi";

export interface NoticeResidentPick {
  id: number;
  nombre: string;
  celular?: number | string | null;
  email?: string | null;
  condominio_name?: string;
  num_vivienda?: number | null;
  num_coto?: string | number | null;
}

interface SendNoticeModalProps {
  open: boolean;
  onClose: () => void;
  /** Si viene, salta el paso de elegir residente */
  preselectedResidente?: NoticeResidentPick | null;
  requireResidentPick?: boolean;
  onSent?: (ticket: { id: number; folio: string }) => void;
}

interface ResidentSearchRow {
  id: number;
  nombre: string;
  celular: number | string | null;
  email: string | null;
  condominio_name: string;
  num_vivienda: number | null;
  num_coto: string | number | null;
  ocupacion?: "Ocupado" | "Vacante";
}

function viviendaLabel(r: NoticeResidentPick): string {
  if (r.num_coto != null && String(r.num_coto).trim() !== "") {
    return String(r.num_coto);
  }
  if (r.num_vivienda != null) return String(r.num_vivienda);
  return "—";
}

function hasContact(r: NoticeResidentPick): boolean {
  const phone = r.celular != null && String(r.celular).trim() !== "";
  const email = Boolean(r.email?.trim());
  return phone || email;
}

function previewBody(
  body: string,
  resident: NoticeResidentPick | null,
  extraNote: string
): string {
  const vars: Record<string, string> = {
    nombre: resident?.nombre ?? "{{nombre}}",
    folio: "{{folio}}",
    vivienda: resident ? viviendaLabel(resident) : "{{vivienda}}",
    condominio: resident?.condominio_name ?? "{{condominio}}",
    motivo: extraNote.trim() || "{{motivo}}",
  };
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] ?? "" : match
  );
}

export function SendNoticeModal({
  open,
  onClose,
  preselectedResidente = null,
  requireResidentPick = false,
  onSent,
}: SendNoticeModalProps) {
  const { toast } = useToast();
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);

  const needsPick = requireResidentPick && !preselectedResidente;

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [results, setResults] = useState<ResidentSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [picked, setPicked] = useState<NoticeResidentPick | null>(
    preselectedResidente ?? null
  );

  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [templatesError, setTemplatesError] = useState("");
  const [templateId, setTemplateId] = useState<number | "">("");
  const [extraNote, setExtraNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const resident = picked ?? preselectedResidente ?? null;
  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId]
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;

    setSearch("");
    setDebouncedSearch("");
    setResults([]);
    setSearchError("");
    setPicked(preselectedResidente ?? null);
    setTemplateId("");
    setExtraNote("");
    setError("");
    setTemplatesError("");
  }, [open, preselectedResidente]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchJson<{ templates: NotificationTemplate[] }>(
      "/api/admin/notification-templates"
    )
      .then((data) => {
        if (cancelled) return;
        const active = data.templates.filter((t) => t.active);
        setTemplates(active);
        if (active.length === 1) setTemplateId(active[0].id);
      })
      .catch((err) => {
        if (cancelled) return;
        setTemplates([]);
        setTemplatesError(
          err instanceof Error
            ? err.message
            : "No se pudieron cargar las plantillas"
        );
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !needsPick || !debouncedSearch) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    setSearchError("");
    fetchJson<{ data: ResidentSearchRow[] }>(
      `/api/residentes?search=${encodeURIComponent(debouncedSearch)}&limit=15`
    )
      .then((data) => {
        if (cancelled) return;
        setResults(
          (data.data ?? []).filter(
            (r) => r.ocupacion !== "Vacante" && r.nombre !== "Vacante"
          )
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setResults([]);
        setSearchError(
          err instanceof Error ? err.message : "No se pudo buscar residentes"
        );
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, needsPick, debouncedSearch]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => {
      const panel = panelRef.current;
      const active = document.activeElement;
      if (panel && active instanceof Node && panel.contains(active)) return;
      if (needsPick && !resident) searchRef.current?.focus();
      else panel?.querySelector<HTMLElement>("select, textarea, button")?.focus();
    }, 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open, needsPick, resident]);

  const handleSend = useCallback(async () => {
    if (!resident) {
      setError("Selecciona un residente.");
      return;
    }
    if (!templateId) {
      setError("Selecciona una plantilla.");
      return;
    }
    if (!hasContact(resident)) {
      setError("El residente no tiene celular ni correo para notificar.");
      return;
    }

    setSending(true);
    setError("");
    try {
      const data = await fetchJson<{ ticket: { id: number; folio: string } }>(
        "/api/admin/notices",
        {
          method: "POST",
          body: JSON.stringify({
            residenteId: resident.id,
            templateId,
            extraNote: extraNote.trim() || undefined,
          }),
        }
      );
      toast(`Notificación enviada. Folio ${data.ticket.folio}.`, "success");
      onSent?.(data.ticket);
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudo enviar la notificación";
      setError(message);
      toast(message, "error");
    } finally {
      setSending(false);
    }
  }, [resident, templateId, extraNote, toast, onSent, onClose]);

  if (!open) return null;

  const showSearch = needsPick && !picked;
  const preview = selectedTemplate
    ? previewBody(selectedTemplate.body, resident, extraNote)
    : "";

  return (
    <DetailPopup
      title="Enviar notificación"
      subtitle="Se crea un ticket y se avisa por correo y WhatsApp si hay datos."
      onClose={onClose}
      size="md"
      layer="form"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryBtn}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={
              sending ||
              !resident ||
              !templateId ||
              !hasContact(resident)
            }
            className={primaryBtn}
          >
            {sending ? "Enviando…" : "Enviar"}
          </button>
        </>
      }
    >
      <div ref={panelRef} className="space-y-4">
          {showSearch ? (
            <div>
              <label
                htmlFor="notice-resident-search"
                className="mb-1 block text-xs font-medium text-gray-600"
              >
                Buscar residente
              </label>
              <input
                id="notice-resident-search"
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nombre, correo, celular o vivienda…"
                className={fieldClass}
                autoComplete="off"
              />
              {searching && (
                <p className="mt-2 text-xs text-gray-500">Buscando…</p>
              )}
              {searchError && (
                <p className="mt-2 text-sm text-red-600">{searchError}</p>
              )}
              {!searching && debouncedSearch && results.length === 0 && !searchError && (
                <p className="mt-2 text-sm text-gray-500">
                  No hay residentes activos que coincidan.
                </p>
              )}
              {results.length > 0 && (
                <ul className="mt-2 max-h-56 divide-y divide-violet-50 overflow-y-auto rounded-lg border border-violet-100">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setPicked(r);
                          setError("");
                        }}
                        className="flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left hover:bg-violet-50"
                      >
                        <span className="font-medium text-gray-900">
                          {r.nombre}
                        </span>
                        <span className="text-xs text-gray-500">
                          {r.condominio_name}
                          {r.num_vivienda != null && ` · Viv. ${r.num_vivienda}`}
                          {r.num_coto != null && ` · Coto ${r.num_coto}`}
                        </span>
                        <span className="text-xs text-gray-400">
                          {[r.celular, r.email].filter(Boolean).join(" · ") ||
                            "Sin celular ni correo"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : resident ? (
            <div className="rounded-xl border border-violet-100 bg-violet-50/40 px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{resident.nombre}</p>
                  <p className="text-xs text-gray-500">
                    {resident.condominio_name ?? "—"}
                    {resident.num_vivienda != null &&
                      ` · Viv. ${resident.num_vivienda}`}
                    {resident.num_coto != null && ` · Coto ${resident.num_coto}`}
                  </p>
                  <p className="text-xs text-gray-400">
                    {[resident.celular, resident.email]
                      .filter((v) => v != null && String(v).trim() !== "")
                      .join(" · ") || "Sin celular ni correo"}
                  </p>
                </div>
                {needsPick && (
                  <button
                    type="button"
                    onClick={() => {
                      setPicked(null);
                      setSearch("");
                      setResults([]);
                    }}
                    className="shrink-0 text-xs font-medium text-violet-700 hover:underline"
                  >
                    Cambiar
                  </button>
                )}
              </div>
              {!hasContact(resident) && (
                <p className="mt-2 text-xs text-red-600">
                  Este residente no tiene celular ni correo. Agrega un dato de
                  contacto antes de notificar.
                </p>
              )}
            </div>
          ) : null}

          {resident && (
            <>
              <div>
                <label
                  htmlFor="notice-template"
                  className="mb-1 block text-xs font-medium text-gray-600"
                >
                  Plantilla
                </label>
                {templatesError ? (
                  <p className="text-sm text-red-600">{templatesError}</p>
                ) : templates.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No hay plantillas activas. Crea una en la pestaña
                    «Plantillas de notificación».
                  </p>
                ) : (
                  <select
                    id="notice-template"
                    value={templateId}
                    onChange={(e) =>
                      setTemplateId(
                        e.target.value ? Number(e.target.value) : ""
                      )
                    }
                    className={fieldClass}
                  >
                    <option value="">Selecciona una plantilla…</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {selectedTemplate && (
                <div>
                  <p className="mb-1 text-sm font-medium text-gray-700">
                    Vista previa
                  </p>
                  <div className="whitespace-pre-wrap rounded-lg border border-violet-100 bg-violet-50/40 px-3 py-2 text-sm text-gray-700">
                    {preview}
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="notice-extra"
                  className="mb-1 block text-xs font-medium text-gray-600"
                >
                  Nota adicional{" "}
                  <span className="font-normal text-gray-400">
                    (opcional, reemplaza {"{{motivo}}"})
                  </span>
                </label>
                <textarea
                  id="notice-extra"
                  value={extraNote}
                  onChange={(e) => setExtraNote(e.target.value)}
                  rows={3}
                  className={fieldClass}
                  placeholder="Ej. corte de agua el martes de 9 a 13 h"
                />
              </div>
            </>
          )}

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
    </DetailPopup>
  );
}
