"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { PortalUser } from "@/lib/portal/types";
import { fetchJson } from "@/components/portal/portalClient";
import { WizardStepper, type WizardStep } from "./WizardStepper";
import { SignatureCanvas, type SignatureResult } from "./SignatureCanvas";
import type {
  WizardField,
  DocumentRequirement,
} from "@/lib/portal/modification-form-schema";
import { IneCapture } from "@/components/portal/IneCapture";
import { PortalModuleBack } from "@/components/portal/PortalModuleBack";

// ── Tipos locales ─────────────────────────────────────────────────────────────

interface ModificationOption {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  fields: WizardField[];
  requiredDocs: DocumentRequirement[];
}

interface CatalogResponse {
  modifications: ModificationOption[];
  development: { id: number; name: string; slug: string } | null;
  claimStatus: string | null;
  canSubmit: boolean;
  claim?: { id: number; propertyIdentifier: string };
}

interface SubmitResponse {
  ticket: {
    id: number;
    folio: string;
    status: string;
    held: boolean;
    modificationSlug: string;
    modificationName: string;
    expedienteCompleto: boolean;
    expedienteMissing: string[];
  };
}

/** Estado de subida de un documento individual */
interface DocUploadState {
  docKey: string;
  label: string;
  status: "pending" | "uploading" | "ok" | "error";
  error?: string;
}

/** Resultado de subida categorizada */
interface CategorizedUploadResponse {
  attachment: { id: number; originalName: string; category: string | null };
  expediente: { complete: boolean; missing: string[]; uploaded: string[] };
}

/**
 * Contrato de payload para POST /api/portal/modificaciones/submit.
 * El cliente NUNCA envía signedContent / signerName / signatureDataUrl en raíz;
 * esos campos los genera el backend a partir de auth + SignatureInputSchema (Zod).
 */
interface SubmitPayload {
  modificationCatalogId: number;
  formData: Record<string, string>;
  draftId?: number;
  signature:
    | { method: "drawn"; dataUrl: string }
    | { method: "typed"; typedName: string };
  ineMatchToken: string;
}

/** Draft obtenido del servidor (GET /api/portal/modificaciones/drafts) */
interface DraftRecord {
  id: number;
  modificationCatalogId: number | null;
  step: number;
  data: Record<string, unknown>;
  updatedAt: number;
}

/** Estado del prompt de restauración de borrador */
interface DraftPrompt {
  draft: DraftRecord;
  mod: ModificationOption;
}

/** Construye el objeto `signature` según el contrato del backend */
function buildSignaturePayload(
  result: SignatureResult,
  fallbackName: string
): SubmitPayload["signature"] {
  if (result.canvasDataUrl) {
    return { method: "drawn", dataUrl: result.canvasDataUrl };
  }
  return { method: "typed", typedName: result.typedName.trim() || fallbackName };
}

// ── Constantes ────────────────────────────────────────────────────────────────

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 disabled:opacity-60";

const selectClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 disabled:opacity-60";

const labelClass = "block text-sm font-medium text-slate-700 mb-1.5";

const primaryBtn =
  "rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50";

const secondaryBtn =
  "rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50";

/** Tamaño máximo de archivo: 10 MB */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Clave sessionStorage — solo guarda el ID numérico del ticket (no sensible) */
const SESSION_KEY_PENDING = "arc_mod_pending_ticket";

// ── Steps del wizard ──────────────────────────────────────────────────────────

const STEPS: WizardStep[] = [
  { id: "vivienda", label: "Tu vivienda", shortLabel: "Vivienda" },
  { id: "modificacion", label: "Tipo de modificación", shortLabel: "Tipo" },
  { id: "datos", label: "Datos técnicos", shortLabel: "Datos" },
  { id: "documentos", label: "Documentos", shortLabel: "Docs" },
  { id: "ine", label: "Identificación", shortLabel: "INE" },
  { id: "revision", label: "Revisar y firmar", shortLabel: "Firmar" },
  { id: "folio", label: "Solicitud enviada", shortLabel: "Listo" },
];

// ── Texto de consentimiento ───────────────────────────────────────────────────

function buildConsentText(
  userName: string,
  modificationName: string,
  propertyId: string,
  date: string
): string {
  return `Yo, ${userName}, en calidad de residente de la vivienda con identificador ${propertyId}, declaro bajo protesta de decir verdad que la información proporcionada en la solicitud de modificación "${modificationName}" es verídica y correcta. Acepto los términos del reglamento del fraccionamiento y me comprometo a realizar las obras dentro de los parámetros autorizados por ARC Desarrollo. Fecha: ${date}.`;
}

// ── Componente principal ──────────────────────────────────────────────────────

interface Props {
  user: PortalUser;
  /** Catálogo ya resuelto en el servidor, para no esperar otra petición antes de la vivienda. */
  initialCatalog?: CatalogResponse;
}

export function ModificationWizard({ user, initialCatalog }: Props) {
  // Estado del wizard
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(!initialCatalog);
  const [submitting, setSubmitting] = useState(false);
  /** Protege el botón "Continuar" de doble-clic */
  const [navigating, setNavigating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Catálogo
  const [catalog, setCatalog] = useState<CatalogResponse | null>(initialCatalog ?? null);

  // Selección de modificación
  const [selectedMod, setSelectedMod] = useState<ModificationOption | null>(null);

  // Datos del formulario
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Documentos
  const [docFiles, setDocFiles] = useState<Record<string, File[]>>({});
  const [docErrors, setDocErrors] = useState<Record<string, string>>({});

  // INE
  const [ineMatchToken, setIneMatchToken] = useState<string | null>(null);
  const [ineUploadError, setIneUploadError] = useState<string | null>(null);

  // Firma
  const [signatureResult, setSignatureResult] = useState<SignatureResult | null>(null);
  const [consentText, setConsentText] = useState("");

  // Draft ID (para auto-guardado)
  const [draftId, setDraftId] = useState<number | null>(null);
  /** Mutex: evita doble POST al borrador si el usuario navega antes del primer ACK */
  const draftCreating = useRef(false);

  /** Prompt de restauración de borrador (null = sin borrador o ya respondido) */
  const [draftPrompt, setDraftPrompt] = useState<DraftPrompt | null>(null);

  /** ID de ticket con upload interrumpido (solo el ID, no sensible) */
  const [pendingTicketId, setPendingTicketId] = useState<string | null>(null);

  // Folio + estado de subida de docs
  const [submittedTicket, setSubmittedTicket] = useState<SubmitResponse["ticket"] | null>(null);
  const [docUploadStates, setDocUploadStates] = useState<DocUploadState[]>([]);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [expedienteCompleto, setExpedienteCompleto] = useState(false);

  // La vivienda ya viene en initialCatalog. El catálogo remoto y el borrador
  // no bloquean esa primera pantalla.
  useEffect(() => {
    let active = true;
    const ac = new AbortController();
    void (async () => {
      try {
        const draftsPromise = fetchJson<{ drafts: DraftRecord[] }>(
          "/api/portal/modificaciones/drafts",
          { signal: ac.signal }
        ).catch((err: Error) => {
          if (err.name === "AbortError") throw err;
          return null;
        });

        let catalogData = initialCatalog ?? null;
        if (!catalogData) {
          catalogData = await fetchJson<CatalogResponse>(
            "/api/portal/modificaciones/catalog",
            { signal: ac.signal }
          );
          if (!active) return;
          setCatalog(catalogData);
        }

        const draftsResult = await draftsPromise;
        if (!active || !draftsResult || !catalogData) return;
        const recent = draftsResult.drafts[0];
        if (recent?.modificationCatalogId) {
          const mod = catalogData.modifications.find(
            (m) => m.id === recent.modificationCatalogId
          );
          if (mod) setDraftPrompt({ draft: recent, mod });
        }
      } catch (err) {
        if (!active) return;
        const error = err as Error;
        if (error.name === "AbortError") return;
        if (!initialCatalog) {
          setError(
            error.message || "No se pudieron cargar las modificaciones disponibles."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      ac.abort();
    };
  }, [initialCatalog]);

  // ── Recuperación: ticket con upload interrumpido por refresh ───────────────
  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY_PENDING);
    if (saved) setPendingTicketId(saved);
  }, []);

  // ── Bloquear cierre/refresh mientras se suben docs ─────────────────────────
  useEffect(() => {
    if (!uploadingDocs) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [uploadingDocs]);

  // ── Auto-guardar draft en servidor ─────────────────────────────────────────
  const saveDraft = useCallback(
    async (currentStep: number, data: Record<string, string>) => {
      if (!selectedMod) return;
      try {
        if (draftId) {
          await fetchJson(`/api/portal/modificaciones/drafts/${draftId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              step: currentStep,
              modificationCatalogId: selectedMod.id,
              data,
            }),
          });
        } else if (!draftCreating.current) {
          // Serializar: evitar doble POST si el usuario navega rápido antes del primer ACK
          draftCreating.current = true;
          try {
            const res = await fetchJson<{ draft: { id: number } }>(
              "/api/portal/modificaciones/drafts",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  step: currentStep,
                  modificationCatalogId: selectedMod.id,
                  data,
                }),
              }
            );
            setDraftId(res.draft.id);
          } finally {
            draftCreating.current = false;
          }
        }
      } catch {
        // Draft es best-effort — no bloquear flujo principal
      }
    },
    [draftId, selectedMod]
  );

  /** Scroll suave al inicio respetando prefers-reduced-motion */
  const scrollTop = useCallback(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  }, []);

  // ── Restaurar / descartar borrador ─────────────────────────────────────────

  /** Restaura borrador: aplica selectedMod, formData y step (máx step 2 = datos) */
  function resumeDraft() {
    if (!draftPrompt) return;
    const { draft, mod } = draftPrompt;
    setSelectedMod(mod);
    const restoredData: Record<string, string> = {};
    for (const [k, v] of Object.entries(draft.data)) {
      if (v !== null && v !== undefined) restoredData[k] = String(v);
    }
    setFormData(restoredData);
    // Docs, INE y firma no se pueden restaurar → máximo al paso de datos técnicos
    setStep(Math.max(1, Math.min(draft.step, 2)));
    setDraftId(draft.id);
    setDraftPrompt(null);
    scrollTop();
  }

  /** Descarta el prompt al instante. El borrado en servidor no bloquea Continuar. */
  function dismissDraft(deleteOnServer: boolean) {
    const current = draftPrompt;
    setDraftPrompt(null);
    if (!deleteOnServer || !current) return;
    void fetchJson(`/api/portal/modificaciones/drafts/${current.draft.id}`, {
      method: "DELETE",
    }).catch(() => {
      // Best-effort — el wizard continúa aunque falle el DELETE
    });
  }

  // ── Validación por step ─────────────────────────────────────────────────────

  function validateVivienda(): boolean {
    if (!catalog) return false;
    if (!catalog.canSubmit && !catalog.claimStatus) {
      setError(
        "Primero debes registrar tu vivienda. Ve a tu perfil y solicita la verificación."
      );
      return false;
    }
    setError(null);
    return true;
  }

  function validateModificacion(): boolean {
    if (!selectedMod) {
      setError("Selecciona el tipo de modificación.");
      return false;
    }
    setError(null);
    return true;
  }

  function validateDatos(): boolean {
    if (!selectedMod) return false;
    const errors: Record<string, string> = {};
    for (const field of selectedMod.fields) {
      if (field.required) {
        const val = formData[field.key]?.trim();
        if (!val) {
          errors[field.key] = `${field.label} es obligatorio.`;
        }
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function validateDocumentos(): boolean {
    if (!selectedMod) return false;
    const errors: Record<string, string> = {};
    for (const doc of selectedMod.requiredDocs) {
      if (doc.required && (!docFiles[doc.key] || docFiles[doc.key]!.length === 0)) {
        errors[doc.key] = `${doc.label} es obligatorio.`;
      }
    }
    setDocErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function validateIne(): boolean {
    if (!ineMatchToken) {
      setIneUploadError("Lee el frente y el reverso de tu INE. Debe coincidir con la de tu perfil.");
      return false;
    }
    setIneUploadError(null);
    return true;
  }

  function validateRevision(): boolean {
    if (!signatureResult?.hasSignature) {
      setError("Debes firmar para enviar la solicitud.");
      return false;
    }
    setError(null);
    return true;
  }

  // ── Navegación entre pasos ──────────────────────────────────────────────────

  const validators: Array<() => boolean> = [
    validateVivienda,
    validateModificacion,
    validateDatos,
    validateDocumentos,
    validateIne,
    validateRevision,
    () => true,
  ];

  const handleNext = async () => {
    if (navigating) return;
    const valid = validators[step]?.();
    if (!valid) return;

    if (step === 0 && draftPrompt) dismissDraft(true);
    setNavigating(true);
    try {
      if (step === 1 && selectedMod) {
        // Garantizar que el ID de vivienda esté disponible antes de generar consentimiento
        const propertyId = catalog?.claim?.propertyIdentifier;
        if (!propertyId) {
          setError(
            "No se encontró el identificador de tu vivienda. Contacta a administración."
          );
          return;
        }
        const date = new Date().toLocaleDateString("es-MX", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        setConsentText(buildConsentText(user.name, selectedMod.name, propertyId, date));
      }

      if (step >= 1) {
        // Autosalvado en pasos con datos (fire-and-forget, serializado)
        void saveDraft(step + 1, formData);
      }

      setStep((s) => Math.min(s + 1, STEPS.length - 1));
      setError(null);
      scrollTop();
    } finally {
      setNavigating(false);
    }
  };

  const handleBack = () => {
    setStep((s) => Math.max(s - 1, 0));
    setError(null);
    scrollTop();
  };

  // ── Subir documentos con progreso (soporte retry solo-fallidos) ───────────

  const uploadDocsForTicket = useCallback(
    async (ticketId: number, slug: string, retryIndices?: Set<number>) => {
      if (!selectedMod) return;
      setUploadingDocs(true);

      // Construir lista completa con índice global estable
      type UploadItem = {
        docKey: string;
        label: string;
        file: File;
        category: string;
        globalIdx: number;
      };
      const allWithIdx: UploadItem[] = [];
      for (const doc of selectedMod.requiredDocs) {
        const files = docFiles[doc.key] ?? [];
        for (const file of files) {
          allWithIdx.push({
            docKey: doc.key,
            label: doc.label,
            file,
            category: doc.key,
            globalIdx: allWithIdx.length,
          });
        }
      }

      // En reintento: procesar solo los fallidos; de lo contrario, todos
      const toProcess = retryIndices
        ? allWithIdx.filter(({ globalIdx }) => retryIndices.has(globalIdx))
        : allWithIdx;

      // Inicializar / actualizar estados de subida
      if (!retryIndices) {
        setDocUploadStates(
          allWithIdx.map((d) => ({ docKey: d.docKey, label: d.label, status: "pending" as const }))
        );
      } else {
        // Solo reiniciar los fallidos; los "ok" permanecen intactos
        setDocUploadStates((prev) =>
          prev.map((s, i) =>
            retryIndices.has(i) ? { ...s, status: "pending" as const, error: undefined } : s
          )
        );
      }

      let lastExpediente: { complete: boolean; missing: string[] } = {
        complete: false,
        missing: [],
      };

      // Subir secuencialmente para no saturar el servidor
      for (const item of toProcess) {
        // Marcar como uploading (por índice global, no por posición en toProcess)
        setDocUploadStates((prev) =>
          prev.map((s, i) => (i === item.globalIdx ? { ...s, status: "uploading" as const } : s))
        );

        try {
          const fd = new FormData();
          fd.append("file", item.file);
          fd.append("category", item.category);
          fd.append("modSlug", slug);

          const res = await fetch(
            `/api/portal/tickets/${ticketId}/attachments/categorized`,
            { method: "POST", body: fd }
          );

          if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(data.error ?? `Error ${res.status}`);
          }

          const data = (await res.json()) as CategorizedUploadResponse;
          lastExpediente = data.expediente;

          setDocUploadStates((prev) =>
            prev.map((s, i) => (i === item.globalIdx ? { ...s, status: "ok" as const } : s))
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Error al subir archivo";
          setDocUploadStates((prev) =>
            prev.map((s, i) =>
              i === item.globalIdx ? { ...s, status: "error" as const, error: msg } : s
            )
          );
        }
      }

      setExpedienteCompleto(lastExpediente.complete);
      setUploadingDocs(false);
      // Limpiar recuperación cuando el expediente queda completo
      if (lastExpediente.complete) {
        sessionStorage.removeItem(SESSION_KEY_PENDING);
      }
    },
    [selectedMod, docFiles]
  );

  // ── Enviar solicitud ───────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!validateIne() || !validateRevision() || !selectedMod || !signatureResult || !ineMatchToken) {
      return;
    }

    setSubmitting(true);
    setError(null);

    // ── Fase 1: crear ticket ───────────────────────────────────────────────
    let createdTicket: SubmitResponse["ticket"];
    try {
      // Construir signature según contrato backend (SignatureInputSchema Zod)
      // NUNCA enviar signedContent / signerName / signatureDataUrl en raíz
      const payload: SubmitPayload = {
        modificationCatalogId: selectedMod.id,
        formData,
        signature: buildSignaturePayload(signatureResult, user.name),
        ineMatchToken,
        ...(draftId != null ? { draftId } : {}),
      };

      const result = await fetchJson<SubmitResponse>(
        "/api/portal/modificaciones/submit",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      createdTicket = result.ticket;
    } catch (err) {
      // Ticket no creado → mostrar error y liberar submitting
      const msg = err instanceof Error ? err.message : "Error al enviar la solicitud.";
      setError(msg);
      setSubmitting(false);
      return;
    }

    // ── Fase 2: upload de documentos (ticket ya creado) ───────────────────
    // setStep(6) antes del await para que la UX no se congele
    setSubmittedTicket(createdTicket);
    sessionStorage.setItem(SESSION_KEY_PENDING, String(createdTicket.id));
    setPendingTicketId(null);
    setStep(6);
    scrollTop();

    // await: handleSubmit no finaliza hasta que el upload concluye.
    // uploadingDocs=true activa beforeunload y deshabilita los links de acción.
    // Los errores de upload se muestran en StepFolio (no como error global).
    try {
      await uploadDocsForTicket(createdTicket.id, createdTicket.modificationSlug);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Reintentar SOLO los documentos que fallaron ────────────────────────────

  const handleRetryDocs = async () => {
    if (!submittedTicket || uploadingDocs) return;
    const failedIndices = new Set<number>(
      docUploadStates
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.status === "error")
        .map(({ i }) => i)
    );
    if (failedIndices.size === 0) return;
    // await: uploadingDocs=true bloquea links de acción y beforeunload activo
    await uploadDocsForTicket(
      submittedTicket.id,
      submittedTicket.modificationSlug,
      failedIndices
    );
  };

  // ── Renderizado ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div
          role="status"
          aria-label="Cargando modificaciones disponibles"
          className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600 motion-reduce:animate-none"
        >
          <span className="sr-only">Cargando…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Banner de recuperación — solo visible si hubo upload interrumpido */}
      {pendingTicketId && step < 6 && (
        <div
          role="alert"
          className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <p className="font-medium">Solicitud previa en proceso</p>
          <p className="mt-1 text-amber-700">
            Una subida de documentos puede haber quedado incompleta.{" "}
            <Link
              href={`/portal/tickets/${pendingTicketId}`}
              className="font-semibold underline"
              onClick={() => {
                sessionStorage.removeItem(SESSION_KEY_PENDING);
                setPendingTicketId(null);
              }}
            >
              Ver solicitud
            </Link>
            {" · "}
            <button
              type="button"
              className="underline"
              onClick={() => {
                sessionStorage.removeItem(SESSION_KEY_PENDING);
                setPendingTicketId(null);
              }}
            >
              Descartar
            </button>
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <PortalModuleBack />
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            Nueva solicitud de modificación
          </h1>
          <p className="text-xs text-slate-500">Una modificación por solicitud</p>
        </div>
      </div>

      {/* Stepper */}
      {step < 6 && <WizardStepper steps={STEPS} current={step} />}

      {/* Contenido del step */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {/* Error global */}
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {draftPrompt && step === 0 ? (
          <div
            role="status"
            aria-labelledby="draft-prompt-title"
            className="mb-4 space-y-3 rounded-xl border border-amber-100 bg-amber-50 p-4"
          >
            <div>
              <p
                id="draft-prompt-title"
                className="text-base font-semibold text-slate-800"
              >
                Tienes un borrador guardado
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Tipo: <strong>{draftPrompt.mod.name}</strong>
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Los documentos, INE y firma deberán volver a proporcionarse.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                onClick={resumeDraft}
                className={primaryBtn + " py-2 text-sm"}
              >
                Continuar borrador
              </button>
              <button
                type="button"
                onClick={() => void dismissDraft(true)}
                className={secondaryBtn + " py-2 text-sm"}
              >
                Empezar de nuevo
              </button>
            </div>
          </div>
        ) : null}

        {step === 0 && <StepVivienda catalog={catalog} />}

        {step === 1 && (
          <StepModificacion
            modifications={catalog?.modifications ?? []}
            selected={selectedMod}
            onSelect={setSelectedMod}
          />
        )}

        {step === 2 && selectedMod && (
          <StepDatos
            modification={selectedMod}
            formData={formData}
            fieldErrors={fieldErrors}
            onChange={(key, val) => {
              setFormData((d) => ({ ...d, [key]: val }));
              if (fieldErrors[key]) {
                setFieldErrors((e) => { const n = { ...e }; delete n[key]; return n; });
              }
            }}
          />
        )}

        {step === 3 && selectedMod && (
          <StepDocumentos
            modification={selectedMod}
            docFiles={docFiles}
            docErrors={docErrors}
            onFileChange={(key, files) => {
              // Validar tamaño (10 MB) antes de aceptar
              const tooBig = files.find((f) => f.size > MAX_FILE_BYTES);
              if (tooBig) {
                setDocErrors((e) => ({
                  ...e,
                  [key]: `"${tooBig.name}" supera el límite de 10 MB.`,
                }));
                return;
              }
              setDocFiles((d) => ({ ...d, [key]: files }));
              if (docErrors[key]) {
                setDocErrors((e) => { const n = { ...e }; delete n[key]; return n; });
              }
            }}
          />
        )}

        {step === 4 && (
          <StepIne
            matched={Boolean(ineMatchToken)}
            uploadError={ineUploadError}
            onReady={(token) => {
              setIneMatchToken(token);
              setIneUploadError(null);
            }}
            onClear={() => setIneMatchToken(null)}
          />
        )}

        {step === 5 && selectedMod && (
          <StepRevision
            modification={selectedMod}
            formData={formData}
            consentText={consentText}
            user={user}
            onSign={setSignatureResult}
            signatureResult={signatureResult}
            docFiles={docFiles}
            ineMatched={Boolean(ineMatchToken)}
          />
        )}

        {step === 6 && submittedTicket && (
          <StepFolio
            ticket={submittedTicket}
            docUploadStates={docUploadStates}
            uploadingDocs={uploadingDocs}
            expedienteCompleto={expedienteCompleto}
            onRetry={handleRetryDocs}
          />
        )}
      </div>

      {step < 6 && (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 0 || submitting || navigating}
            className={secondaryBtn + " disabled:opacity-30"}
          >
            Atrás
          </button>
          {step < 5 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={navigating}
              className={primaryBtn}
            >
              {navigating ? "Un momento…" : "Continuar"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !signatureResult?.hasSignature}
              className={primaryBtn}
            >
              {submitting ? "Enviando…" : "Enviar solicitud"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-componentes de cada step ──────────────────────────────────────────────

function StepVivienda({ catalog }: { catalog: CatalogResponse | null }) {
  if (!catalog) {
    return <p className="text-sm text-slate-500">Cargando información de tu vivienda…</p>;
  }

  if (!catalog.canSubmit) {
    return (
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-slate-800">Tu vivienda</h2>
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">Sin vivienda registrada</p>
          <p className="mt-1 text-amber-700">
            Para solicitar una modificación necesitas tener una vivienda asociada a tu cuenta.
            Ve a <strong>Mi perfil</strong> y solicita la verificación de tu cuenta.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-slate-800">Confirmar tu vivienda</h2>
      {catalog.development && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 text-emerald-500" aria-hidden="true">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-800">{catalog.development.name}</p>
              {catalog.claim && (
                <p className="text-sm text-emerald-700">
                  Vivienda: <strong>{catalog.claim.propertyIdentifier}</strong>
                </p>
              )}
              <p className="mt-1 text-xs text-emerald-600">Cuenta verificada ✓</p>
            </div>
          </div>
        </div>
      )}

      {catalog.claimStatus && catalog.claimStatus !== "approved" && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">Verificación en proceso</p>
          <p className="mt-1 text-amber-700">
            Tu solicitud está siendo revisada. Puedes continuar pero quedará{" "}
            <strong>en espera</strong> hasta que se complete la verificación.
          </p>
        </div>
      )}

      <p className="text-sm text-slate-600">
        Esta solicitud se registrará a nombre de la vivienda indicada. Confirma y continúa.
      </p>
    </div>
  );
}

function StepModificacion({
  modifications,
  selected,
  onSelect,
}: {
  modifications: ModificationOption[];
  selected: ModificationOption | null;
  onSelect: (mod: ModificationOption) => void;
}) {
  if (modifications.length === 0) {
    return (
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-slate-800">Tipo de modificación</h2>
        <p className="text-sm text-slate-500">
          No hay modificaciones disponibles para tu desarrollo en este momento.
          Contacta a administración para más información.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-slate-800">
        ¿Qué modificación deseas realizar?
      </h2>
      <p className="text-sm text-slate-500">
        Selecciona <strong>una</strong> modificación por solicitud.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {modifications.map((mod) => (
          <button
            key={mod.id}
            type="button"
            onClick={() => onSelect(mod)}
            className={`group rounded-xl border p-4 text-left transition-all ${
              selected?.id === mod.id
                ? "border-emerald-400 bg-emerald-50 shadow-sm"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
            }`}
            aria-pressed={selected?.id === mod.id}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border-2 transition-colors ${
                  selected?.id === mod.id
                    ? "border-emerald-500 bg-emerald-500"
                    : "border-slate-300 bg-white"
                }`}
                aria-hidden="true"
              />
              <div>
                <p className={`text-sm font-medium ${
                  selected?.id === mod.id ? "text-emerald-800" : "text-slate-800"
                }`}>
                  {mod.name}
                </p>
                {mod.description && (
                  <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">
                    {mod.description}
                  </p>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepDatos({
  modification,
  formData,
  fieldErrors,
  onChange,
}: {
  modification: ModificationOption;
  formData: Record<string, string>;
  fieldErrors: Record<string, string>;
  onChange: (key: string, val: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-slate-800">Datos técnicos</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Modificación: <strong>{modification.name}</strong>
        </p>
      </div>
      <div className="space-y-4">
        {modification.fields.map((field) => {
          const hasError = !!fieldErrors[field.key];
          const hintId = field.hint ? `hint-${field.key}` : undefined;
          const errorId = hasError ? `error-${field.key}` : undefined;
          const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

          return (
            <div key={field.key}>
              <label htmlFor={`field-${field.key}`} className={labelClass}>
                {field.label}
                {field.required && (
                  <span className="ml-1 text-red-500" aria-hidden="true">*</span>
                )}
                {field.unit && (
                  <span className="ml-1 font-normal text-slate-400">({field.unit})</span>
                )}
              </label>
              {field.hint && (
                <p className="mb-1.5 text-xs text-slate-400" id={hintId}>{field.hint}</p>
              )}
              {field.type === "select" ? (
                <select
                  id={`field-${field.key}`}
                  value={formData[field.key] ?? ""}
                  onChange={(e) => onChange(field.key, e.target.value)}
                  required={field.required}
                  aria-describedby={describedBy}
                  aria-invalid={hasError}
                  className={selectClass}
                >
                  <option value="">Selecciona una opción…</option>
                  {field.options?.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : field.type === "textarea" ? (
                <textarea
                  id={`field-${field.key}`}
                  value={formData[field.key] ?? ""}
                  onChange={(e) => onChange(field.key, e.target.value)}
                  placeholder={field.placeholder ?? ""}
                  required={field.required}
                  rows={4}
                  aria-describedby={describedBy}
                  aria-invalid={hasError}
                  className={inputClass}
                />
              ) : (
                <input
                  id={`field-${field.key}`}
                  type={field.type === "number" ? "number" : "text"}
                  value={formData[field.key] ?? ""}
                  onChange={(e) => onChange(field.key, e.target.value)}
                  placeholder={field.placeholder ?? ""}
                  required={field.required}
                  min={field.min}
                  max={field.max}
                  step={field.type === "number" ? "any" : undefined}
                  aria-describedby={describedBy}
                  aria-invalid={hasError}
                  className={inputClass}
                />
              )}
              {hasError && (
                <p className="mt-1 text-xs text-red-600" role="alert" id={errorId}>
                  {fieldErrors[field.key]}
                </p>
              )}
            </div>
          );
        })}
        {modification.fields.length === 0 && (
          <p className="text-sm text-slate-500">
            No se requieren datos técnicos adicionales para este tipo de modificación.
          </p>
        )}
      </div>
    </div>
  );
}

function StepDocumentos({
  modification,
  docFiles,
  docErrors,
  onFileChange,
}: {
  modification: ModificationOption;
  docFiles: Record<string, File[]>;
  docErrors: Record<string, string>;
  onFileChange: (key: string, files: File[]) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-slate-800">Documentos requeridos</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Sube los documentos para <strong>{modification.name}</strong>.
          Los archivos se acumulan; puedes añadir más sin perder los anteriores.
        </p>
      </div>
      <div className="space-y-4">
        {modification.requiredDocs.map((doc) => {
          const files = docFiles[doc.key] ?? [];
          const inputId = `doc-input-${doc.key}`;
          const labelId = `doc-label-${doc.key}`;
          const errorId = `doc-error-${doc.key}`;

          return (
            <div key={doc.key} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              {/* Etiqueta de texto (p, no label, para evitar label anidado) */}
              <p className="text-sm font-medium text-slate-800 mb-1" id={labelId}>
                {doc.label}
                {doc.required && (
                  <span className="ml-1 text-red-500" aria-hidden="true">*</span>
                )}
              </p>
              {doc.description && (
                <p className="mb-2 text-xs text-slate-500">{doc.description}</p>
              )}

              {/* Área de selección (label válido con htmlFor) */}
              <label
                htmlFor={inputId}
                aria-labelledby={labelId}
                className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
                  files.length > 0
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-slate-200 hover:border-slate-300 hover:bg-white"
                }`}
              >
                <input
                  id={inputId}
                  type="file"
                  accept={doc.accept ?? "image/jpeg,image/png,application/pdf"}
                  multiple={doc.multiple}
                  className="sr-only"
                  aria-describedby={docErrors[doc.key] ? errorId : undefined}
                  aria-invalid={!!docErrors[doc.key]}
                  onChange={(e) => {
                    const incoming = Array.from(e.target.files ?? []);
                    if (!incoming.length) return;
                    // Acumular y deduplicar por nombre+tamaño+lastModified
                    const existing = files;
                    const merged = [...existing];
                    for (const f of incoming) {
                      const dup = merged.some(
                        (x) =>
                          x.name === f.name &&
                          x.size === f.size &&
                          x.lastModified === f.lastModified
                      );
                      if (!dup) merged.push(f);
                    }
                    onFileChange(doc.key, merged);
                    // Resetear input para permitir re-seleccionar el mismo archivo
                    e.target.value = "";
                  }}
                />
                <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                </svg>
                <span className="text-xs text-slate-400">
                  {doc.multiple ? "Añadir archivos" : "Seleccionar archivo"} · PDF, JPG, PNG · Máx. 10 MB
                </span>
              </label>

              {/* Lista de archivos acumulados con botón de quitar */}
              {files.length > 0 && (
                <ul
                  className="mt-2 space-y-1"
                  aria-label={`Archivos seleccionados para ${doc.label}`}
                >
                  {files.map((f, fi) => (
                    <li
                      key={`${f.name}-${f.size}-${fi}`}
                      className="flex items-center gap-2 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs"
                    >
                      <span className="flex-1 truncate font-medium text-emerald-800">{f.name}</span>
                      <button
                        type="button"
                        onClick={() =>
                          onFileChange(doc.key, files.filter((_, i) => i !== fi))
                        }
                        className="shrink-0 text-slate-400 transition-colors hover:text-red-500"
                        aria-label={`Quitar ${f.name}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {docErrors[doc.key] && (
                <p className="mt-1 text-xs text-red-600" role="alert" id={errorId}>
                  {docErrors[doc.key]}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StepIne({
  matched,
  uploadError,
  onReady,
  onClear,
}: {
  matched: boolean;
  uploadError: string | null;
  onReady: (token: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-slate-800">Identificación oficial (INE)</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Toma el frente y el reverso. Si un dato no se lee bien, corrígelo. La solicitud sigue solo si coincide con tu perfil y está vigente.
        </p>
      </div>
      {uploadError && (
        <p className="text-sm text-rose-600" role="alert">
          {uploadError}
        </p>
      )}
      <IneCapture
        purpose="match"
        compact
        onReady={(result) => {
          if (result.token) onReady(result.token);
        }}
        onClear={onClear}
      />
      {matched && (
        <p className="text-sm text-emerald-700">Coincide con tu perfil. Puedes continuar.</p>
      )}
    </div>
  );
}

function StepRevision({
  modification,
  formData,
  consentText,
  user,
  onSign,
  signatureResult,
  docFiles,
  ineMatched,
}: {
  modification: ModificationOption;
  formData: Record<string, string>;
  consentText: string;
  user: PortalUser;
  onSign: (r: SignatureResult) => void;
  signatureResult: SignatureResult | null;
  docFiles: Record<string, File[]>;
  ineMatched: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-800">Revisar y firmar</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Revisa los datos antes de enviar tu solicitud.
        </p>
      </div>

      {/* Resumen completo */}
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Modificación</span>
          <span className="font-medium text-slate-800">{modification.name}</span>
        </div>

        {/* Campos técnicos */}
        {Object.entries(formData)
          .filter(([, v]) => v)
          .map(([key, val]) => {
            const field = modification.fields.find((f) => f.key === key);
            return (
              <div key={key} className="flex justify-between text-sm">
                <span className="text-slate-500">{field?.label ?? key}</span>
                <span className="font-medium text-slate-800">
                  {val} {field?.unit ?? ""}
                </span>
              </div>
            );
          })}

        {/* Documentos seleccionados */}
        {modification.requiredDocs.length > 0 && (
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Documentos
            </p>
            {modification.requiredDocs.map((doc) => {
              const files = docFiles[doc.key] ?? [];
              return (
                <div key={doc.key} className="flex justify-between text-sm">
                  <span className="text-slate-500">{doc.label}</span>
                  <span className={`font-medium ${files.length ? "text-emerald-700" : "text-slate-400"}`}>
                    {files.length
                      ? `${files.length} archivo${files.length > 1 ? "s" : ""}`
                      : "Sin archivos"}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* INE */}
        <div className="flex justify-between text-sm pt-2 border-t border-slate-100">
          <span className="text-slate-500">INE</span>
          <span className={`font-medium ${ineMatched ? "text-emerald-700" : "text-slate-400"}`}>
            {ineMatched ? "Coincide con tu perfil" : "No leída"}
          </span>
        </div>
      </div>

      {/* Texto de consentimiento */}
      <div>
        <p className={labelClass}>Texto de aceptación</p>
        <div
          className="max-h-32 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600"
          tabIndex={0}
          aria-label="Texto de consentimiento — desplaza para leer completo"
        >
          {consentText}
        </div>
      </div>

      {/* Firma */}
      <div>
        <p className={labelClass}>
          Firma{" "}
          <span className="font-normal text-slate-400 text-xs">
            (traza o escribe tu nombre para confirmar)
          </span>
        </p>
        <SignatureCanvas signerName={user.name} onSign={onSign} />
        {signatureResult?.hasSignature && (
          <p className="mt-2 text-xs text-emerald-600" role="status">
            ✓ Firma registrada correctamente.
          </p>
        )}
      </div>
    </div>
  );
}

function StepFolio({
  ticket,
  docUploadStates,
  uploadingDocs,
  expedienteCompleto,
  onRetry,
}: {
  ticket: SubmitResponse["ticket"];
  docUploadStates: DocUploadState[];
  uploadingDocs: boolean;
  expedienteCompleto: boolean;
  onRetry: () => void;
}) {
  const hasErrors = docUploadStates.some((s) => s.status === "error");
  const allOk = docUploadStates.length > 0 && docUploadStates.every((s) => s.status === "ok");

  return (
    <div className="space-y-6">
      {/* Icono + título */}
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="mt-4 text-lg font-bold text-slate-900">¡Solicitud enviada!</h2>
        <p className="mt-1 text-sm text-slate-500">{ticket.modificationName}</p>
      </div>

      {/* Folio */}
      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5 text-center">
        <p className="text-xs text-slate-400">Número de folio</p>
        <p className="mt-1 text-2xl font-bold tracking-widest text-slate-900">{ticket.folio}</p>
      </div>

      {/* En espera de verificación */}
      {ticket.held && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">En espera de verificación</p>
          <p className="mt-1 text-amber-700">
            Tu solicitud permanecerá <strong>en espera</strong> hasta que se complete
            la verificación de tu cuenta. Te notificaremos cuando avance.
          </p>
        </div>
      )}

      {/* Subida de documentos */}
      {docUploadStates.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">
              {uploadingDocs ? "Subiendo documentos…" : "Documentos"}
            </p>
            {uploadingDocs && (
              <div
                role="status"
                aria-label="Subiendo documentos"
                className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600 motion-reduce:animate-none"
              >
                <span className="sr-only">Subiendo…</span>
              </div>
            )}
          </div>

          {/* aria-live para anunciar cambios de estado a lectores de pantalla */}
          <div
            className="space-y-2"
            aria-live="polite"
            aria-atomic="false"
            aria-label="Estado de subida de documentos"
          >
            {docUploadStates.map((doc, idx) => (
              <div
                key={`upload-${idx}`}
                className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${
                  doc.status === "ok"
                    ? "border-emerald-100 bg-emerald-50"
                    : doc.status === "error"
                      ? "border-red-100 bg-red-50"
                      : doc.status === "uploading"
                        ? "border-slate-200 bg-slate-50"
                        : "border-slate-100 bg-white"
                }`}
              >
                {doc.status === "ok" && (
                  <svg className="h-4 w-4 flex-shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {doc.status === "error" && (
                  <svg className="h-4 w-4 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                {doc.status === "uploading" && (
                  <div
                    role="status"
                    aria-label={`Subiendo ${doc.label}`}
                    className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600 motion-reduce:animate-none"
                  >
                    <span className="sr-only">Subiendo {doc.label}…</span>
                  </div>
                )}
                {doc.status === "pending" && (
                  <div className="h-4 w-4 flex-shrink-0 rounded-full border-2 border-slate-200" aria-hidden="true" />
                )}

                <div className="flex-1 min-w-0">
                  <p className={`font-medium truncate ${
                    doc.status === "error" ? "text-red-700" : "text-slate-800"
                  }`}>
                    {doc.label}
                    {doc.status === "ok" && <span className="sr-only"> — subido correctamente</span>}
                    {doc.status === "error" && <span className="sr-only"> — error al subir</span>}
                  </p>
                  {doc.status === "error" && doc.error && (
                    <p className="text-xs text-red-600 mt-0.5">{doc.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Reintento — solo docs fallidos, sin duplicar exitosos */}
          {!uploadingDocs && hasErrors && (
            <div className="rounded-xl border border-orange-100 bg-orange-50 p-4">
              <p className="text-sm font-medium text-orange-800">
                Algunos documentos no se subieron correctamente
              </p>
              <p className="mt-1 text-xs text-orange-700">
                Tu solicitud fue registrada con folio <strong>{ticket.folio}</strong>.
                El reintento solo sube los archivos que fallaron, sin crear duplicados.
              </p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-orange-700"
              >
                Reintentar documentos fallidos
              </button>
            </div>
          )}

          {!uploadingDocs && !hasErrors && expedienteCompleto && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
              <p className="text-sm font-medium text-emerald-800">✓ Expediente completo</p>
              <p className="text-xs text-emerald-600 mt-0.5">
                Todos los documentos requeridos han sido recibidos.
              </p>
            </div>
          )}

          {!uploadingDocs && !hasErrors && !expedienteCompleto && allOk && (
            <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
              <p className="font-medium">Expediente en proceso</p>
              <p className="mt-0.5 text-xs text-amber-700">Los documentos se están procesando.</p>
            </div>
          )}
        </div>
      )}

      {!uploadingDocs && docUploadStates.length === 0 && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">Expediente pendiente</p>
          <p className="mt-1 text-amber-700">
            No seleccionaste archivos. Puedes subirlos desde el detalle de tu solicitud.
          </p>
        </div>
      )}

      {/* Acciones — deshabilitadas mientras se suben documentos */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link
          href="/portal/tickets"
          className={
            primaryBtn +
            " inline-block text-center" +
            (uploadingDocs ? " pointer-events-none opacity-50" : "")
          }
          aria-disabled={uploadingDocs || undefined}
          tabIndex={uploadingDocs ? -1 : undefined}
        >
          {uploadingDocs ? "Subiendo documentos…" : "Ver mis solicitudes"}
        </Link>
        <Link
          href="/portal/inicio"
          className={
            secondaryBtn +
            " inline-block text-center" +
            (uploadingDocs ? " pointer-events-none opacity-50" : "")
          }
          aria-disabled={uploadingDocs || undefined}
          tabIndex={uploadingDocs ? -1 : undefined}
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
