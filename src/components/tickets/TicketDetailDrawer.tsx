"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  canPreviewFile,
  isArchitectureFile,
  previewKind,
} from "@/lib/portal/attachment-kind";
import {
  RESOLUTION_DECISIONS,
  RESOLUTION_LABELS,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  ticketRequestTitle,
  type ResolutionDecision,
  type Ticket,
  type TicketAttachment,
  type TicketComment,
  type TicketStatus,
  type TicketStatusHistory,
} from "@/lib/portal/types";
import { useToast } from "@/components/Toast";
import {
  DetailPopup,
  detailBtnPress,
} from "@/components/residentes/DetailPopup";
import {
  fetchJson,
  formatBytes,
  formatDateTime,
  STATUS_BADGE_CLASS,
} from "./helpers";

interface TicketDetailDrawerProps {
  ticketId: number;
  refreshSignal?: number;
  isAdmin?: boolean;
  onClose: () => void;
  onChanged: () => void;
}

const ACCEPT_TYPES = ".pdf,.jpg,.jpeg,.png,.webp,.gif,.txt,.doc,.docx,.xls,.xlsx";

interface ReviewPayload {
  decision: ResolutionDecision | null;
  note: string | null;
  hash: string | null;
  slaStatus: string | null;
  documents: Array<{ key: string; label: string; present: boolean; required: boolean }>;
  technical: Array<{ key: string; label: string; present: boolean; required: boolean }>;
}

/** Convierte URLs del texto en enlaces (no abre archivos, solo enlaces web). */
function renderWithLinks(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all font-medium underline hover:no-underline"
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

type ThreadItem =
  | { kind: "comment"; key: string; at: number; comment: TicketComment }
  | { kind: "status"; key: string; at: number; history: TicketStatusHistory };

function AttachmentChip({
  att,
  ticketId,
  onView,
}: {
  att: TicketAttachment;
  ticketId: number;
  onView: (att: TicketAttachment) => void;
}) {
  const previewable = canPreviewFile(att.originalName, att.mime);
  const architecture = isArchitectureFile(att.originalName, att.attachmentCategory);
  const href = `/api/admin/tickets/${ticketId}/attachments/${att.id}`;

  return (
    <div className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-800">
          {att.originalName}
        </span>
        <span className="block text-[11px] text-slate-400">
          {formatBytes(att.sizeBytes)}
          {architecture ? " · plano" : ""}
        </span>
      </span>
      {previewable ? (
        <button
          type="button"
          onClick={() => onView(att)}
          className="shrink-0 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
        >
          Ver
        </button>
      ) : null}
      <a
        href={href}
        download
        className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        Descargar
      </a>
    </div>
  );
}

export function TicketDetailDrawer({
  ticketId,
  refreshSignal,
  isAdmin = false,
  onClose,
  onChanged,
}: TicketDetailDrawerProps) {
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [statusValue, setStatusValue] = useState<TicketStatus>("nuevo");
  const [statusNote, setStatusNote] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const [generatingLetter, setGeneratingLetter] = useState(false);
  const [showLetterPreview, setShowLetterPreview] = useState(false);
  const [letterPreviewHtml, setLetterPreviewHtml] = useState<string | null>(
    null
  );
  const [letterPreviewError, setLetterPreviewError] = useState("");
  const [letterPreviewLoading, setLetterPreviewLoading] = useState(false);
  const [filePreview, setFilePreview] = useState<{
    name: string;
    kind: "image" | "pdf" | "text";
    url: string | null;
    text: string;
    loading: boolean;
    error: string;
  } | null>(null);

  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [resolutionDecision, setResolutionDecision] =
    useState<ResolutionDecision>("autorizada");
  const [resolutionNote, setResolutionNote] = useState("");
  const [resolving, setResolving] = useState(false);
  const [requestKind, setRequestKind] = useState<"info" | "file" | "answer">(
    "info"
  );
  const [requestNote, setRequestNote] = useState("");
  const [requesting, setRequesting] = useState(false);

  const [commentBody, setCommentBody] = useState("");
  const [commentInternal, setCommentInternal] = useState(false);
  const [composerFiles, setComposerFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [composerErrors, setComposerErrors] = useState<string[]>([]);
  const composerInputRef = useRef<HTMLInputElement | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  const loadDetail = useCallback(async (mode: "full" | "silent" = "full") => {
    if (mode === "full") {
      setLoading(true);
      setError("");
    }
    try {
      const data = await fetchJson<{ ticket: Ticket }>(
        `/api/admin/tickets/${ticketId}`
      );
      setTicket(data.ticket);
      const reviewData = await fetchJson<{ review: ReviewPayload }>(
        `/api/admin/tickets/${ticketId}/review`
      ).catch(() => null);
      setReview(reviewData?.review ?? null);
      if (mode === "full") {
        setStatusValue(data.ticket.status);
        if (reviewData?.review.decision) {
          setResolutionDecision(reviewData.review.decision);
          setResolutionNote(reviewData.review.note ?? "");
        }
      }
    } catch (err) {
      if (mode === "full") {
        setError(err instanceof Error ? err.message : "Error al cargar el detalle");
      }
    } finally {
      if (mode === "full") setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // Tiempo real (vía el padre): al cambiar `refreshSignal` recargamos.
  const firstRefreshRef = useRef(true);
  useEffect(() => {
    if (firstRefreshRef.current) {
      firstRefreshRef.current = false;
      return;
    }
    void loadDetail("silent");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  // Cerrar con Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const uploadFiles = useCallback(
    async (files: File[], commentId: number | null): Promise<string[]> => {
      if (files.length === 0) return [];
      const formData = new FormData();
      for (const file of files) formData.append("files", file);
      if (commentId != null) formData.append("commentId", String(commentId));
      const res = await fetch(`/api/admin/tickets/${ticketId}/attachments`, {
        method: "POST",
        body: formData,
      });
      const data = (await res.json().catch(() => null)) as {
        stored?: number;
        errors?: string[];
        error?: string;
      } | null;
      if (!res.ok && !data?.errors) {
        throw new Error(data?.error ?? `Error ${res.status}`);
      }
      return data?.errors ?? [];
    },
    [ticketId]
  );

  const applyStatus = useCallback(
    async (status: TicketStatus, note: string) => {
      setSavingStatus(true);
      if (status === "autorizado") setGeneratingLetter(true);
      try {
        const data = await fetchJson<{
          ticket: Ticket;
          letterGenerated: boolean;
          letterError?: string | null;
        }>(`/api/admin/tickets/${ticketId}/status`, {
          method: "POST",
          body: JSON.stringify({ status, note: note.trim() || undefined }),
        });
        setStatusNote("");
        if (status === "autorizado" && !data.letterGenerated) {
          toast(
            data.letterError
              ? `Se autorizó, pero la carta no se generó: ${data.letterError}`
              : "Se autorizó, pero la carta no se generó.",
            "error"
          );
        } else {
          toast(
            status === "autorizado" && data.letterGenerated
              ? "Solicitud autorizada. La carta ya quedó generada."
              : `Estatus actualizado a "${TICKET_STATUS_LABELS[status]}".`,
            "success"
          );
        }
        await loadDetail();
        onChanged();
      } catch (err) {
        toast(
          err instanceof Error ? err.message : "Error al actualizar estatus",
          "error"
        );
      } finally {
        setSavingStatus(false);
        setGeneratingLetter(false);
      }
    },
    [ticketId, toast, loadDetail, onChanged]
  );

  const handleResolve = useCallback(async () => {
    setResolving(true);
    try {
      const data = await fetchJson<{ letterGenerated: boolean; letterError?: string | null }>(
        `/api/admin/tickets/${ticketId}/resolution`,
        {
          method: "POST",
          body: JSON.stringify({
            decision: resolutionDecision,
            note: resolutionNote.trim() || undefined,
          }),
        }
      );
      toast(
        data.letterGenerated
          ? "Resolución guardada. El PDF del comité ya está en el expediente."
          : data.letterError
            ? `Resolución guardada. El PDF no se generó: ${data.letterError}`
            : "Resolución guardada. El SLA queda en pausa hasta que el cliente corrija.",
        data.letterError ? "error" : "success"
      );
      await loadDetail();
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo resolver", "error");
    } finally {
      setResolving(false);
    }
  }, [ticketId, resolutionDecision, resolutionNote, toast, loadDetail, onChanged]);

  const handleRequestInfo = useCallback(async () => {
    setRequesting(true);
    try {
      await fetchJson(`/api/admin/tickets/${ticketId}/request-info`, {
        method: "POST",
        body: JSON.stringify({
          kind: requestKind,
          note: requestNote.trim() || undefined,
        }),
      });
      setRequestNote("");
      toast("Solicitud enviada al cliente (WhatsApp y correo).", "success");
      await loadDetail();
      onChanged();
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Error al enviar la solicitud",
        "error"
      );
    } finally {
      setRequesting(false);
    }
  }, [ticketId, requestKind, requestNote, toast, loadDetail, onChanged]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? `Error ${res.status}`);
      }
      toast("Solicitud enviada al archivo.", "success");
      setConfirmDelete(false);
      onChanged();
      onClose();
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Error al eliminar la solicitud",
        "error"
      );
    } finally {
      setDeleting(false);
    }
  }, [ticketId, toast, onChanged, onClose]);

  const handleSaveLetterPdf = useCallback(async () => {
    setGeneratingLetter(true);
    try {
      await fetchJson(`/api/admin/tickets/${ticketId}/letter`, {
        method: "POST",
      });
      toast("Carta generada y guardada como PDF.", "success");
      setShowLetterPreview(false);
      await loadDetail();
      onChanged();
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Error al generar la carta",
        "error"
      );
    } finally {
      setGeneratingLetter(false);
    }
  }, [ticketId, toast, loadDetail, onChanged]);

  const handleSend = useCallback(async () => {
    const body = commentBody.trim();
    if (!body && composerFiles.length === 0) return;
    setSending(true);
    setComposerErrors([]);
    try {
      let commentId: number | null = null;
      if (body) {
        const data = await fetchJson<{ comment: { id: number } }>(
          `/api/admin/tickets/${ticketId}/comments`,
          {
            method: "POST",
            body: JSON.stringify({ body, internal: commentInternal }),
          }
        );
        commentId = data.comment.id;
      }
      const errors = await uploadFiles(composerFiles, commentId);
      setComposerErrors(errors);
      if (errors.length === 0) {
        setCommentBody("");
        setComposerFiles([]);
        if (composerInputRef.current) composerInputRef.current.value = "";
      }
      if (body) {
        toast(
          commentInternal
            ? "Nota interna agregada."
            : "Comentario enviado. Se notificó al cliente.",
          "success"
        );
      } else if (errors.length === 0) {
        toast("Archivo(s) adjuntado(s).", "success");
      }
      await loadDetail();
      onChanged();
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Error al enviar",
        "error"
      );
    } finally {
      setSending(false);
    }
  }, [
    commentBody,
    composerFiles,
    commentInternal,
    ticketId,
    uploadFiles,
    toast,
    loadDetail,
    onChanged,
  ]);

  const thread = useMemo<ThreadItem[]>(() => {
    if (!ticket) return [];
    const items: ThreadItem[] = [];
    for (const c of ticket.comments ?? []) {
      items.push({ kind: "comment", key: `c${c.id}`, at: c.createdAt, comment: c });
    }
    for (const h of ticket.history ?? []) {
      items.push({ kind: "status", key: `h${h.id}`, at: h.createdAt, history: h });
    }
    return items.sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
  }, [ticket]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [thread.length]);

  const closeFilePreview = useCallback(() => {
    setFilePreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  }, []);

  const openFilePreview = useCallback(
    async (att: TicketAttachment) => {
      const kind = previewKind(att.originalName, att.mime);
      if (kind === "none" || !ticket) return;
      setFilePreview((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return {
          name: att.originalName,
          kind: kind === "office" ? "text" : kind,
          url: null,
          text: "",
          loading: true,
          error: "",
        };
      });
      try {
        const base = `/api/admin/tickets/${ticket.id}/attachments/${att.id}`;
        if (kind === "text" || kind === "office") {
          const res = await fetch(`${base}?mode=text`, { cache: "no-store" });
          const data = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
          if (!res.ok) {
            throw new Error(data?.error || "No se pudo mostrar el archivo");
          }
          setFilePreview({
            name: att.originalName,
            kind: "text",
            url: null,
            text: data?.text?.trim() || "El archivo no tiene texto para mostrar.",
            loading: false,
            error: "",
          });
          return;
        }
        const res = await fetch(`${base}?mode=inline`, { cache: "no-store" });
        if (!res.ok) throw new Error("No se pudo mostrar el archivo");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setFilePreview({
          name: att.originalName,
          kind,
          url,
          text: "",
          loading: false,
          error: "",
        });
      } catch (err) {
        setFilePreview({
          name: att.originalName,
          kind: "text",
          url: null,
          text: "",
          loading: false,
          error: err instanceof Error ? err.message : "No se pudo mostrar el archivo",
        });
      }
    },
    [ticket]
  );

  useEffect(() => {
    if (!filePreview) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeFilePreview();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [filePreview, closeFilePreview]);

  const generalAttachments = (ticket?.attachments ?? []).filter(
    (a) => a.commentId === null
  );

  return (
    <>
    <DetailPopup
      title={ticket?.folio ?? "Solicitud"}
      subtitle={
        ticket
          ? `${ticketRequestTitle(ticket)}${
              ticket.origin === "admin_notice" ? " · Notificación" : ""
            }`
          : undefined
      }
      headerExtra={
        isAdmin && ticket ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className={detailBtnPress(
              "rounded-lg border border-white/30 px-3 py-1.5 text-sm font-medium text-white [@media(hover:hover)]:hover:bg-white/10"
            )}
          >
            Eliminar
          </button>
        ) : null
      }
      onClose={onClose}
      size="xl"
      flush
    >
        {loading ? (
          <p className="p-6 text-sm text-gray-400">Cargando detalle...</p>
        ) : error ? (
          <div className="m-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            <button
              onClick={() => void loadDetail()}
              className="ml-2 font-medium underline hover:no-underline"
            >
              Reintentar
            </button>
          </div>
        ) : ticket ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(340px,400px)_1fr]">
            {/* ── Columna izquierda: datos + estatus + documentos ── */}
            <div className="min-h-0 space-y-5 overflow-y-auto border-b border-violet-100 bg-[#f8f7fc] px-5 py-5 lg:border-b-0 lg:border-r">
              {/* Cliente */}
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-800">Cliente</h4>
                <dl className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Nombre</dt>
                    <dd className="text-right font-medium text-slate-800">
                      {ticket.clientName ?? "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Correo</dt>
                    <dd className="text-right text-slate-700 break-all">
                      {ticket.clientEmail ?? "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Teléfono</dt>
                    <dd className="text-right text-slate-700">
                      {ticket.clientPhone ?? "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Creado</dt>
                    <dd className="text-right text-slate-700">
                      {formatDateTime(ticket.createdAt)}
                    </dd>
                  </div>
                </dl>
              </section>

              {/* Cambiar estatus */}
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-800">
                  Cambiar estatus
                </h4>
                <div className="mt-3 space-y-2">
                  <select
                    value={statusValue}
                    onChange={(e) =>
                      setStatusValue(e.target.value as TicketStatus)
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    {TICKET_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {TICKET_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    rows={2}
                    placeholder="Nota (opcional)"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => applyStatus(statusValue, statusNote)}
                      disabled={savingStatus}
                      className={detailBtnPress(
                        "rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-2 text-sm font-medium text-white [@media(hover:hover)]:hover:from-violet-700 [@media(hover:hover)]:hover:to-purple-700 disabled:opacity-50"
                      )}
                    >
                      {savingStatus ? "Actualizando..." : "Actualizar"}
                    </button>
                    <button
                      onClick={() => {
                        if (ticket.status === "autorizado") {
                          void handleSaveLetterPdf();
                          return;
                        }
                        void applyStatus("autorizado", statusNote);
                      }}
                      disabled={savingStatus || generatingLetter}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {generatingLetter ? "Generando carta…" : "Autorizar"}
                    </button>
                    <button
                      onClick={() => {
                        setShowLetterPreview(true);
                        setLetterPreviewHtml(null);
                        setLetterPreviewError("");
                        setLetterPreviewLoading(true);
                        void fetch(
                          `/api/admin/tickets/${ticketId}/letter/preview`,
                          { credentials: "same-origin" }
                        )
                          .then(async (res) => {
                            if (!res.ok) {
                              const data = (await res
                                .json()
                                .catch(() => null)) as { error?: string } | null;
                              throw new Error(
                                data?.error ?? `Error ${res.status}`
                              );
                            }
                            return res.text();
                          })
                          .then((html) => setLetterPreviewHtml(html))
                          .catch((err) =>
                            setLetterPreviewError(
                              err instanceof Error
                                ? err.message
                                : "No se pudo cargar la vista previa"
                            )
                          )
                          .finally(() => setLetterPreviewLoading(false));
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Generar carta
                    </button>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-800">
                  Resolución del comité
                </h4>
                <p className="mt-1 text-xs text-slate-500">
                  SLA: {review?.slaStatus ?? ticket.slaStatus ?? "sin iniciar"}
                  {review?.decision
                    ? ` · Última decisión: ${RESOLUTION_LABELS[review.decision]}`
                    : ""}
                </p>
                {(review?.documents.length || review?.technical.length) ? (
                  <ul className="mt-3 space-y-1 text-sm text-slate-700">
                    {[...(review?.documents ?? []), ...(review?.technical ?? [])].map((item) => (
                      <li key={item.key}>
                        {item.present ? "Listo" : "Falta"} · {item.label}
                        {item.required ? "" : " (opcional)"}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-3 space-y-2">
                  <label className="block text-xs font-medium text-slate-600" htmlFor="resolution-decision">
                    Decisión
                  </label>
                  <select
                    id="resolution-decision"
                    value={resolutionDecision}
                    onChange={(e) =>
                      setResolutionDecision(e.target.value as ResolutionDecision)
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    {RESOLUTION_DECISIONS.map((decision) => (
                      <option key={decision} value={decision}>
                        {RESOLUTION_LABELS[decision]}
                      </option>
                    ))}
                  </select>
                  <label className="block text-xs font-medium text-slate-600" htmlFor="resolution-note">
                    Condiciones, correcciones o motivo
                  </label>
                  <textarea
                    id="resolution-note"
                    value={resolutionNote}
                    onChange={(e) => setResolutionNote(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => void handleResolve()}
                    disabled={resolving || ticket.status === "held"}
                    aria-label="Guardar resolución del comité"
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {ticket.status === "held"
                      ? "En espera de verificación"
                      : resolving
                        ? "Guardando..."
                        : "Guardar resolución"}
                  </button>
                </div>
              </section>

              {/* Pedir respuesta al cliente */}
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-800">
                  Pedir respuesta al cliente
                </h4>
                {ticket.awaitingKind !== "none" && (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Esperando del cliente:{" "}
                    <span className="font-semibold">
                      {ticket.awaitingKind === "file"
                        ? "un archivo"
                        : ticket.awaitingKind === "answer"
                          ? "una respuesta"
                          : "información"}
                    </span>
                    {ticket.awaitingNote ? ` · ${ticket.awaitingNote}` : ""}
                  </div>
                )}
                <div className="mt-3 space-y-2">
                  <select
                    value={requestKind}
                    onChange={(e) =>
                      setRequestKind(e.target.value as "info" | "file" | "answer")
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    <option value="info">Información adicional</option>
                    <option value="file">Un archivo</option>
                    <option value="answer">Responder una pregunta</option>
                  </select>
                  <textarea
                    value={requestNote}
                    onChange={(e) => setRequestNote(e.target.value)}
                    rows={2}
                    placeholder="Detalle de lo que necesitas del cliente..."
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                  <button
                    onClick={handleRequestInfo}
                    disabled={requesting}
                    className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                  >
                    {requesting ? "Enviando..." : "Enviar solicitud"}
                  </button>
                  <p className="text-xs text-slate-400">
                    Se notifica por WhatsApp y correo. El cliente podrá responder
                    desde el portal o por WhatsApp.
                  </p>
                </div>
              </section>

              {/* Datos de la solicitud */}
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-800">
                  Datos de la solicitud
                </h4>
                {ticket.values && ticket.values.length > 0 ? (
                  <dl className="mt-2 space-y-2 text-sm">
                    {ticket.values.map((v) => (
                      <div key={v.fieldKey}>
                        <dt className="text-xs font-medium text-slate-500">
                          {v.label}
                        </dt>
                        <dd className="whitespace-pre-wrap text-slate-800">
                          {v.value ?? "—"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-2 text-sm text-slate-400">
                    Sin datos capturados.
                  </p>
                )}
              </section>

              {/* Documentos (carta PDF) */}
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-800">
                  Documentos
                </h4>
                {ticket.documents && ticket.documents.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {ticket.documents.map((doc) => (
                      <li
                        key={doc.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                      >
                        <span className="min-w-0 truncate text-sm text-slate-700">
                          {doc.filename}
                        </span>
                        <a
                          href={`/api/admin/tickets/${ticket.id}/documents/${doc.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                          Ver carta (PDF)
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-slate-400">
                    Aún no hay documentos generados.
                  </p>
                )}
              </section>

              {/* Archivos generales del ticket */}
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-800">
                  Archivos de la solicitud
                </h4>
                {generalAttachments.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {generalAttachments.map((att) => (
                      <AttachmentChip
                        key={att.id}
                        att={att}
                        ticketId={ticket.id}
                        onView={openFilePreview}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-400">
                    Sin archivos generales.
                  </p>
                )}
              </section>
            </div>

            {/* ── Columna derecha: conversación tipo chat ── */}
            <div className="flex min-h-0 flex-col bg-white">
              <div className="shrink-0 border-b border-slate-100 px-5 py-3">
                <h4 className="text-sm font-semibold text-slate-800">
                  Conversación
                </h4>
                <p className="text-xs text-slate-400">
                  Comentarios, cambios de estatus y archivos de esta solicitud.
                </p>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-white px-4 py-5 sm:px-6">
                {thread.length === 0 ? (
                  <p className="text-center text-sm text-slate-400">
                    Aún no hay actividad. Escribe el primer mensaje.
                  </p>
                ) : (
                  thread.map((item) => {
                    if (item.kind === "status") {
                      const h = item.history;
                      return (
                        <div key={item.key} className="flex justify-center">
                          <div className="max-w-[85%] rounded-full bg-slate-200/70 px-3 py-1 text-center text-xs text-slate-600">
                            <span className="font-medium">
                              {h.fromStatus
                                ? `${TICKET_STATUS_LABELS[h.fromStatus]} → ${TICKET_STATUS_LABELS[h.toStatus]}`
                                : TICKET_STATUS_LABELS[h.toStatus]}
                            </span>
                            {h.note ? ` · ${h.note}` : ""}
                            <span className="ml-1 text-slate-400">
                              · {formatDateTime(h.createdAt)}
                              {h.changedBy ? ` · ${h.changedBy}` : ""}
                            </span>
                          </div>
                        </div>
                      );
                    }
                    const c = item.comment;
                    const isAdmin = c.authorType === "admin";
                    const bubbleClass = c.internal
                      ? "bg-amber-50 border-amber-200 text-amber-900"
                      : isAdmin
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-slate-800 border-slate-200";
                    return (
                      <div
                        key={item.key}
                        className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}
                      >
                        <div className="max-w-[80%]">
                          <div
                            className={`rounded-2xl border px-4 py-2.5 shadow-sm ${bubbleClass} ${
                              isAdmin ? "rounded-br-md" : "rounded-bl-md"
                            }`}
                          >
                            <div className="mb-0.5 flex items-center gap-2">
                              <span
                                className={`text-[11px] font-semibold ${
                                  c.internal
                                    ? "text-amber-700"
                                    : isAdmin
                                      ? "text-indigo-100"
                                      : "text-slate-500"
                                }`}
                              >
                                {c.authorName ??
                                  (isAdmin ? "Administrador" : "Cliente")}
                              </span>
                              {c.internal && (
                                <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">
                                  interna
                                </span>
                              )}
                            </div>
                            {c.body && (
                              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                                {renderWithLinks(c.body)}
                              </p>
                            )}
                            {c.attachments && c.attachments.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {c.attachments.map((att) => (
                                  <AttachmentChip
                                    key={att.id}
                                    att={att}
                                    ticketId={ticket.id}
                                    onView={openFilePreview}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                          <p
                            className={`mt-1 text-[10px] text-slate-400 ${
                              isAdmin ? "text-right" : "text-left"
                            }`}
                          >
                            {formatDateTime(c.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={threadEndRef} />
              </div>

              {/* Composer */}
              <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
                {composerFiles.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {composerFiles.map((f, i) => (
                      <span
                        key={`${f.name}-${i}`}
                        className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600"
                      >
                        <span className="max-w-[140px] truncate">{f.name}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setComposerFiles((prev) =>
                              prev.filter((_, idx) => idx !== i)
                            )
                          }
                          className="text-slate-400 hover:text-red-500"
                          aria-label="Quitar archivo"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {composerErrors.length > 0 && (
                  <ul className="mb-2 space-y-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {composerErrors.map((msg, i) => (
                      <li key={i}>{msg}</li>
                    ))}
                  </ul>
                )}
                <div className="flex items-end gap-2">
                  <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50">
                    <input
                      ref={composerInputRef}
                      type="file"
                      multiple
                      accept={ACCEPT_TYPES}
                      className="hidden"
                      onChange={(e) => {
                        const list = e.target.files;
                        if (list)
                          setComposerFiles((prev) =>
                            [...prev, ...Array.from(list)].slice(0, 5)
                          );
                      }}
                    />
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05 12.25 20.24a5 5 0 0 1-7.07-7.07l8.49-8.49a3 3 0 1 1 4.24 4.24l-8.49 8.49a1 1 0 0 1-1.41-1.41l7.78-7.78" />
                    </svg>
                  </label>
                  <textarea
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    rows={1}
                    placeholder="Escribe un mensaje..."
                    className="max-h-32 min-h-[40px] flex-1 resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || (!commentBody.trim() && composerFiles.length === 0)}
                    className="h-10 shrink-0 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {sending ? "..." : "Enviar"}
                  </button>
                </div>
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={commentInternal}
                    onChange={(e) => setCommentInternal(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  Nota interna (no notificar al cliente)
                </label>
              </div>
            </div>
          </div>
        ) : null}
    </DetailPopup>

      {/* Confirmación de eliminación (archivar) */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div
            className="arc-detail-scrim absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => !deleting && setConfirmDelete(false)}
            aria-hidden
          />
          <div className="arc-detail-modal relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-4">
              <h3 className="text-lg font-semibold text-white">
                ¿Eliminar esta solicitud?
              </h3>
            </div>
            <p className="px-5 pt-4 text-sm text-gray-600">
              La solicitud{" "}
              <span className="font-mono font-semibold">{ticket?.folio}</span> se
              moverá al <span className="font-semibold">Archivo</span>. Podrás
              restaurarla más tarde desde ahí.
            </p>
            <div className="mt-5 flex justify-end gap-2 border-t border-violet-100 px-5 py-3">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className={detailBtnPress(
                  "rounded-lg border border-violet-200 px-4 py-2 text-sm font-medium text-violet-800 [@media(hover:hover)]:hover:bg-violet-50 disabled:opacity-50"
                )}
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className={detailBtnPress(
                  "rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white [@media(hover:hover)]:hover:bg-red-700 disabled:opacity-50"
                )}
              >
                {deleting ? "Eliminando..." : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {filePreview && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-3 sm:p-6">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeFilePreview}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={filePreview.name}
            className="relative flex h-full max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <p className="min-w-0 truncate text-sm font-semibold text-slate-900">
                {filePreview.name}
              </p>
              <button
                type="button"
                onClick={closeFilePreview}
                className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>
            <div className="min-h-0 flex-1 bg-slate-100">
              {filePreview.loading ? (
                <p className="p-6 text-sm text-slate-500">Abriendo archivo…</p>
              ) : filePreview.error ? (
                <p className="p-6 text-sm text-red-600">{filePreview.error}</p>
              ) : filePreview.kind === "image" && filePreview.url ? (
                <div className="flex h-full items-center justify-center overflow-auto p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={filePreview.url}
                    alt={filePreview.name}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : filePreview.kind === "pdf" && filePreview.url ? (
                <iframe
                  title={filePreview.name}
                  src={filePreview.url}
                  className="h-full w-full bg-white"
                />
              ) : (
                <pre className="h-full overflow-auto whitespace-pre-wrap break-words p-5 text-sm text-slate-800">
                  {filePreview.text}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Vista previa de la carta de autorización */}
      {showLetterPreview && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6">
          <div
            className="arc-detail-scrim absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setShowLetterPreview(false)}
            aria-hidden
          />
          <div className="arc-detail-modal relative flex h-full max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-3">
              <div>
                <h3 className="text-base font-semibold text-white">
                  Vista previa de la carta
                </h3>
                <p className="text-xs text-violet-200">
                  Revisa el documento antes de generar el PDF definitivo.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveLetterPdf}
                  disabled={generatingLetter}
                  className={detailBtnPress(
                    "rounded-lg bg-white px-4 py-2 text-sm font-medium text-violet-800 [@media(hover:hover)]:hover:bg-violet-50 disabled:opacity-50"
                  )}
                >
                  {generatingLetter ? "Generando..." : "Generar y guardar PDF"}
                </button>
                <button
                  onClick={() => setShowLetterPreview(false)}
                  className={detailBtnPress(
                    "rounded-full p-1.5 text-white/80 [@media(hover:hover)]:hover:bg-white/10 [@media(hover:hover)]:hover:text-white"
                  )}
                  aria-label="Cerrar"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 bg-[#f8f7fc]">
              {letterPreviewLoading && (
                <p className="p-8 text-center text-sm text-gray-400">
                  Cargando vista previa…
                </p>
              )}
              {!letterPreviewLoading && letterPreviewError && (
                <p className="p-8 text-center text-sm text-red-600">
                  {letterPreviewError}
                </p>
              )}
              {!letterPreviewLoading && letterPreviewHtml && (
                <iframe
                  title="Vista previa de la carta"
                  srcDoc={letterPreviewHtml}
                  sandbox=""
                  className="h-full w-full border-0 bg-white"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
