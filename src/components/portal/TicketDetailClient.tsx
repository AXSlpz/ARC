"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  Ticket,
  TicketAttachment,
  TicketDocument,
  TicketValue,
} from "@/lib/portal/types";
import { TICKET_STATUS_LABELS, ticketRequestTitle } from "@/lib/portal/types";
import {
  ALL_SLUGS,
  getModificationFormSchema,
} from "@/lib/portal/modification-form-schema";
import {
  fetchJson,
  formatBytes,
  formatDate,
  formatDateTime,
  uploadAttachments,
} from "@/components/portal/portalClient";
import { AttachmentPicker } from "@/components/portal/AttachmentPicker";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { usePortalSocket } from "@/hooks/usePortalSocket";
import { canPreviewFile, previewKind } from "@/lib/portal/attachment-kind";
import {
  PORTAL_FILE_PREVIEW_CLOSE_EVENT,
  publishPortalFilePreview,
} from "@/components/portal/portalFilePreview";

type FilePreviewState = {
  name: string;
  kind: "image" | "pdf" | "text";
  url: string | null;
  text: string;
  loading: boolean;
  error: string;
};

function AttachmentRow({
  ticketId,
  attachment,
  onView,
}: {
  ticketId: number;
  attachment: TicketAttachment;
  onView: (attachment: TicketAttachment) => void;
}) {
  const previewable = canPreviewFile(attachment.originalName, attachment.mime);
  return (
    <li className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      {previewable ? (
        <button
          type="button"
          onClick={() => onView(attachment)}
          className="inline-flex shrink-0 items-center rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-700"
        >
          Ver
        </button>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-700">
          {attachment.originalName}
        </span>
        <span className="text-xs text-slate-400">
          {formatBytes(attachment.sizeBytes)}
        </span>
      </span>
      <a
        href={`/api/portal/tickets/${ticketId}/attachments/${attachment.id}`}
        download
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-emerald-700 shadow-sm transition-colors hover:bg-emerald-50"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="M7 10l5 5 5-5" />
          <path d="M12 15V3" />
        </svg>
        Descargar
      </a>
    </li>
  );
}

const HIDDEN_REQUEST_KEYS = new Set([
  "modificacion_slug",
  "modificacion_nombre",
]);

function requestFields(ticket: Ticket): TicketValue[] {
  const values = ticket.values ?? [];
  const slug =
    values.find((item) => item.fieldKey === "modificacion_slug")?.value?.trim() ??
    "";
  const nombre =
    values
      .find((item) => item.fieldKey === "modificacion_nombre")
      ?.value?.trim() ||
    ticket.modificationName?.trim() ||
    "";
  const schema =
    slug && ALL_SLUGS.includes(slug) ? getModificationFormSchema(slug) : null;
  const labels = new Map(
    schema?.fields.map((field) => [field.key, field.label]) ?? [],
  );
  const filled = values
    .filter((item) => !HIDDEN_REQUEST_KEYS.has(item.fieldKey))
    .filter((item) => item.value?.trim())
    .map((item) => ({
      fieldKey: item.fieldKey,
      label: labels.get(item.fieldKey) || item.label,
      value: item.value,
    }));
  if (!nombre && !slug) return filled;
  return [
    {
      fieldKey: "tipo-solicitud",
      label: "Tipo de Solicitud",
      value: nombre || ticketRequestTitle(ticket),
    },
    ...filled,
  ];
}

export function TicketDetailClient({
  userId,
  initialTicket,
  initialError = "",
}: {
  userId: number;
  initialTicket: Ticket | null;
  initialError?: string;
}) {
  const ticketId = initialTicket ? String(initialTicket.id) : undefined;
  const [error, setError] = useState(initialError);
  const [ticket, setTicket] = useState<Ticket | null>(initialTicket);
  const [justUpdated, setJustUpdated] = useState(false);

  const [comment, setComment] = useState("");
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);
  const [commentError, setCommentError] = useState("");
  const [uploadNotice, setUploadNotice] = useState("");
  const [filePreview, setFilePreview] = useState<FilePreviewState | null>(null);

  useEffect(() => {
    setTicket(initialTicket);
    setError(initialError);
  }, [initialTicket, initialError]);

  const loadTicket = useCallback(async () => {
    if (!ticketId) return;
    const data = await fetchJson<{ ticket: Ticket }>(
      `/api/portal/tickets/${ticketId}`,
    );
    setTicket(data.ticket);
    setError("");
  }, [ticketId]);

  // Tiempo real (WS) + respaldo por polling: mantiene el portal al día cuando
  // el cliente responde por WhatsApp o el admin actualiza el ticket.
  const refetchingRef = useRef(false);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatScrollRef = useRef<HTMLUListElement | null>(null);
  const softRefresh = useCallback(
    (showNotice: boolean) => {
      if (refetchingRef.current) return;
      refetchingRef.current = true;
      loadTicket()
        .then(() => {
          if (!showNotice) return;
          setJustUpdated(true);
          if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
          noticeTimerRef.current = setTimeout(
            () => setJustUpdated(false),
            2500,
          );
        })
        .catch(() => {})
        .finally(() => {
          refetchingRef.current = false;
        });
    },
    [loadTicket],
  );

  usePortalSocketDetail({
    enabled: !!ticketId,
    myUserId: userId,
    ticketId,
    onMatch: () => softRefresh(true),
  });

  useEffect(() => {
    if (!ticketId) return;
    const interval = setInterval(() => softRefresh(false), 12_000);
    const onVis = () => {
      if (document.visibilityState === "visible") softRefresh(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [ticketId, softRefresh]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const box = chatScrollRef.current;
    if (!box) return;
    box.scrollTop = box.scrollHeight;
  }, [ticket?.comments?.length]);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = comment.trim();
    if (!body && commentFiles.length === 0) return;
    setPosting(true);
    setCommentError("");
    setUploadNotice("");
    try {
      // 1) Crear el comentario (aunque vaya vacío si sólo adjunta archivos).
      const created = await fetchJson<{ comment: { id: number } }>(
        `/api/portal/tickets/${ticketId}/comments`,
        {
          method: "POST",
          body: JSON.stringify({ body: body || "(archivos adjuntos)" }),
        },
      );
      // 2) Subir los archivos ligados a ese comentario.
      if (commentFiles.length > 0 && ticketId) {
        const result = await uploadAttachments(
          ticketId,
          commentFiles,
          created.comment.id,
        );
        if (result.errors.length > 0) {
          setUploadNotice(
            `Algunos archivos no se pudieron subir: ${result.errors.join(", ")}`,
          );
        }
      }
      setComment("");
      setCommentFiles([]);
      await loadTicket();
    } catch (err) {
      setCommentError(
        err instanceof Error ? err.message : "No se pudo enviar el comentario",
      );
    } finally {
      setPosting(false);
    }
  };

  const closeFilePreview = useCallback(() => {
    setFilePreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  }, []);

  const openFilePreview = useCallback(
    async (attachment: TicketAttachment) => {
      const kind = previewKind(attachment.originalName, attachment.mime);
      if (kind === "none" || !ticketId) return;
      setFilePreview((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return {
          name: attachment.originalName,
          kind: kind === "office" ? "text" : kind,
          url: null,
          text: "",
          loading: true,
          error: "",
        };
      });
      try {
        const base = `/api/portal/tickets/${ticketId}/attachments/${attachment.id}`;
        if (kind === "text" || kind === "office") {
          const res = await fetch(`${base}?mode=text`, { cache: "no-store" });
          const data = (await res.json().catch(() => null)) as {
            text?: string;
            error?: string;
          } | null;
          if (!res.ok) {
            throw new Error(data?.error || "No se pudo mostrar el archivo");
          }
          setFilePreview({
            name: attachment.originalName,
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
          name: attachment.originalName,
          kind,
          url,
          text: "",
          loading: false,
          error: "",
        });
      } catch (err) {
        setFilePreview({
          name: attachment.originalName,
          kind: "text",
          url: null,
          text: "",
          loading: false,
          error:
            err instanceof Error ? err.message : "No se pudo mostrar el archivo",
        });
      }
    },
    [ticketId],
  );

  const openDocumentPreview = useCallback(
    async (doc: TicketDocument) => {
      if (!ticketId) return;
      const name =
        doc.kind === "authorization_letter"
          ? "Carta de autorización"
          : doc.filename;
      setFilePreview((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return {
          name,
          kind: "pdf",
          url: null,
          text: "",
          loading: true,
          error: "",
        };
      });
      try {
        const res = await fetch(
          `/api/portal/tickets/${ticketId}/documents/${doc.id}?mode=inline`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error("No se pudo mostrar la carta");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setFilePreview({
          name,
          kind: "pdf",
          url,
          text: "",
          loading: false,
          error: "",
        });
      } catch (err) {
        setFilePreview({
          name,
          kind: "pdf",
          url: null,
          text: "",
          loading: false,
          error: err instanceof Error ? err.message : "No se pudo mostrar la carta",
        });
      }
    },
    [ticketId],
  );

  const previewOpen = filePreview !== null;

  useEffect(() => {
    publishPortalFilePreview(previewOpen);
    if (!previewOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeFilePreview();
    };
    const onClose = () => closeFilePreview();
    document.addEventListener("keydown", onKey);
    window.addEventListener(PORTAL_FILE_PREVIEW_CLOSE_EVENT, onClose);
    return () => {
      publishPortalFilePreview(false);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(PORTAL_FILE_PREVIEW_CLOSE_EVENT, onClose);
    };
  }, [previewOpen, closeFilePreview]);

  if (error || !ticket) {
    return (
      <div>
        <Link
          href="/portal/tickets"
          className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
        >
          ← Volver a mis solicitudes
        </Link>
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error || "Solicitud no encontrada"}
        </div>
      </div>
    );
  }

  const requestData = requestFields(ticket);
  const history = ticket.history ?? [];
  const documents = ticket.documents ?? [];
  const comments = ticket.comments ?? [];
  const attachments = ticket.attachments ?? [];
  // Todos los archivos (portal + WhatsApp), no solo los sin comentario.
  const allAttachments = attachments;

  return (
    <>
    <div className="space-y-6">
      <div>
        <Link
          href="/portal/tickets"
          className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
        >
          ← Volver a mis solicitudes
        </Link>
      </div>

      {/* Cabecera */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900 sm:text-xl">
                {ticketRequestTitle(ticket)}
              </h1>
              {ticket.origin === "admin_notice" && (
                <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                  Notificación de administración
                </span>
              )}
            </div>
            <p className="mt-1 font-mono text-sm text-slate-500">
              {ticket.folio}
            </p>
          </div>
          <div className="shrink-0">
            <StatusBadge status={ticket.status} />
          </div>
        </div>
        {justUpdated && (
          <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Actualizado
          </p>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs font-semibold text-violet-700">Creada</dt>
            <dd className="mt-1 text-slate-800">{formatDate(ticket.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-violet-700">
              Última actualización
            </dt>
            <dd className="mt-1 text-slate-800">{formatDate(ticket.updatedAt)}</dd>
          </div>
        </dl>
      </div>

      {/* Datos de la solicitud */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">
          Datos de la solicitud
        </h2>
        {requestData.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Esta solicitud no tiene datos adicionales.
          </p>
        ) : (
          <dl className="mt-3 grid grid-cols-2 gap-2">
            {requestData.map((item) => (
              <div
                key={item.fieldKey}
                className="min-w-0 rounded-lg border border-violet-100 bg-violet-50/40 px-3 py-2"
              >
                <dt className="text-xs font-semibold leading-snug text-violet-700">
                  {item.label}
                </dt>
                <dd className="mt-1 break-words text-sm text-slate-800">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {/* Archivos (portal + WhatsApp) */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Archivos</h2>
        {allAttachments.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No hay archivos adjuntos en esta solicitud.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {allAttachments.map((att) => (
              <AttachmentRow
                key={att.id}
                ticketId={ticket.id}
                attachment={att}
                onView={openFilePreview}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Documentos */}
      {documents.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">Documentos</h2>
          <ul className="mt-3 space-y-2">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => void openDocumentPreview(doc)}
                  className="inline-flex shrink-0 items-center rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-700"
                >
                  Ver
                </button>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-700">
                    {doc.kind === "authorization_letter"
                      ? "Carta de autorización"
                      : doc.filename}
                  </span>
                  <span className="text-xs text-slate-400">PDF</span>
                </span>
                <a
                  href={`/api/portal/tickets/${ticket.id}/documents/${doc.id}?mode=download`}
                  download
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-emerald-700 shadow-sm transition-colors hover:bg-emerald-50"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <path d="M7 10l5 5 5-5" />
                    <path d="M12 15V3" />
                  </svg>
                  Descargar
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Línea de tiempo */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">
          Historial de seguimiento
        </h2>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Sin cambios registrados.</p>
        ) : (
          <ol className="mt-4 space-y-4">
            {history.map((h) => (
              <li key={h.id} className="flex gap-3">
                <div className="mt-1 flex flex-col items-center">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-700">
                    {h.fromStatus ? (
                      <>
                        Cambió de{" "}
                        <span className="font-medium">
                          {TICKET_STATUS_LABELS[h.fromStatus]}
                        </span>{" "}
                        a{" "}
                      </>
                    ) : (
                      "Estatus inicial: "
                    )}
                    <span className="font-medium">
                      {TICKET_STATUS_LABELS[h.toStatus]}
                    </span>
                  </p>
                  {h.note && (
                    <p className="mt-0.5 text-sm text-slate-500">{h.note}</p>
                  )}
                  <p className="mt-0.5 text-xs text-slate-400">
                    {formatDateTime(h.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Conversación */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Conversación</h2>
        {comments.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Aún no hay mensajes. Escribe el primero.
          </p>
        ) : (
          <ul
            ref={chatScrollRef}
            className="mt-3 flex h-[min(18rem,42dvh)] flex-col gap-2 overflow-y-scroll overscroll-contain rounded-2xl bg-slate-100 p-3 [scrollbar-color:#94a3b8_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400"
          >
            {comments.map((c) => {
              const commentAttachments = c.attachments ?? [];
              const mine = c.authorType === "client";
              const viaWhatsApp = /\(WhatsApp\)/i.test(c.authorName ?? "");
              const displayName = viaWhatsApp
                ? (c.authorName ?? "Tú").replace(/\s*\(WhatsApp\)\s*/i, "").trim() ||
                  "Tú"
                : mine
                  ? "Tú"
                  : c.authorName?.trim() || "ARC";
              const showBody =
                c.body.trim() !== "(archivos adjuntos)" ||
                commentAttachments.length === 0;
              return (
                <li
                  key={c.id}
                  className={`flex ${mine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 shadow-sm ${
                      mine
                        ? "rounded-br-md bg-violet-600 text-white"
                        : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
                    }`}
                  >
                    <p
                      className={`flex flex-wrap items-center gap-1.5 text-[11px] font-semibold ${
                        mine ? "justify-end text-violet-100" : "text-slate-500"
                      }`}
                    >
                      {displayName}
                      {viaWhatsApp && (
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                            mine
                              ? "bg-white/15 text-white"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          WhatsApp
                        </span>
                      )}
                    </p>
                    {showBody && (
                      <p className="mt-0.5 whitespace-pre-wrap text-sm">
                        {c.body}
                      </p>
                    )}
                    {commentAttachments.length > 0 && (
                      <ul className="mt-2 space-y-1.5">
                        {commentAttachments.map((att) => (
                          <AttachmentRow
                            key={att.id}
                            ticketId={ticket.id}
                            attachment={att}
                            onView={openFilePreview}
                          />
                        ))}
                      </ul>
                    )}
                    <p
                      className={`mt-1 text-[10px] ${
                        mine ? "text-right text-violet-100" : "text-slate-400"
                      }`}
                    >
                      {formatDateTime(c.createdAt)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <form onSubmit={handleAddComment} className="mt-4">
          <label
            htmlFor="new-comment"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Agregar comentario
          </label>
          <textarea
            id="new-comment"
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Escribe un comentario para dar seguimiento…"
            className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
          />

          <div className="mt-3">
            <AttachmentPicker
              files={commentFiles}
              onChange={setCommentFiles}
              disabled={posting}
              beforeHint={
                <button
                  type="submit"
                  disabled={
                    posting || (!comment.trim() && commentFiles.length === 0)
                  }
                  className="ml-auto shrink-0 whitespace-nowrap rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  {posting ? "Enviando…" : "Enviar comentario"}
                </button>
              }
            />
            {commentError && (
              <p className="mt-2 text-sm text-rose-600">{commentError}</p>
            )}
            {uploadNotice && (
              <p className="mt-2 text-sm text-amber-600">{uploadNotice}</p>
            )}
          </div>
        </form>
      </section>
    </div>
    {filePreview && (
      <div
        className="fixed inset-x-0 bottom-0 z-10 flex flex-col bg-white"
        style={{
          top: "var(--portal-header-h, 4rem)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={filePreview.name}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 overflow-auto bg-slate-100">
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
    </>
  );
}

/**
 * Envuelve `usePortalSocket` para el detalle: refresca sólo cuando el evento
 * `ticket` corresponde al usuario actual y al ticket abierto.
 */
function usePortalSocketDetail({
  enabled,
  myUserId,
  ticketId,
  onMatch,
}: {
  enabled: boolean;
  myUserId: number | null;
  ticketId: string | undefined;
  onMatch: () => void;
}) {
  usePortalSocket(enabled, (event, data) => {
    if (event !== "ticket") return;
    if (myUserId == null || Number(data?.portalUserId) !== myUserId) return;
    if (ticketId == null || Number(data?.ticketId) !== Number(ticketId)) return;
    onMatch();
  });
}
