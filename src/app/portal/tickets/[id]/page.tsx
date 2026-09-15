"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type {
  PortalUser,
  Ticket,
  TicketAttachment,
} from "@/lib/portal/types";
import { TICKET_STATUS_LABELS } from "@/lib/portal/types";
import {
  fetchJson,
  formatBytes,
  formatDate,
  formatDateTime,
  uploadAttachments,
} from "@/components/portal/portalClient";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { AttachmentPicker } from "@/components/portal/AttachmentPicker";
import { usePortalSocket } from "@/hooks/usePortalSocket";

function AttachmentRow({
  ticketId,
  attachment,
}: {
  ticketId: number;
  attachment: TicketAttachment;
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
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

export default function TicketDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const ticketId = params?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [myUserId, setMyUserId] = useState<number | null>(null);
  const [justUpdated, setJustUpdated] = useState(false);

  const [comment, setComment] = useState("");
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);
  const [commentError, setCommentError] = useState("");
  const [uploadNotice, setUploadNotice] = useState("");

  const loadTicket = useCallback(async () => {
    const data = await fetchJson<{ ticket: Ticket }>(
      `/api/portal/tickets/${ticketId}`,
    );
    setTicket(data.ticket);
  }, [ticketId]);

  useEffect(() => {
    if (!ticketId) return;
    let active = true;
    (async () => {
      try {
        const me = await fetchJson<{ user: PortalUser | null }>(
          "/api/portal/me",
        );
        if (!me.user) {
          router.replace("/portal");
          return;
        }
        if (active) setMyUserId(me.user.id);
        await loadTicket();
      } catch (err) {
        if (active)
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo cargar la solicitud",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [ticketId, router, loadTicket]);

  // Tiempo real (WS) + respaldo por polling: mantiene el portal al día cuando
  // el cliente responde por WhatsApp o el admin actualiza el ticket.
  const refetchingRef = useRef(false);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    enabled: myUserId != null && !!ticketId,
    myUserId,
    ticketId,
    onMatch: () => softRefresh(true),
  });

  // Polling de respaldo (cada 12s) + al volver a la pestaña.
  useEffect(() => {
    if (myUserId == null || !ticketId) return;
    const interval = setInterval(() => softRefresh(false), 12_000);
    const onVis = () => {
      if (document.visibilityState === "visible") softRefresh(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [myUserId, ticketId, softRefresh]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

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

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
        Cargando solicitud…
      </div>
    );
  }

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

  const values = ticket.values ?? [];
  const history = ticket.history ?? [];
  const documents = ticket.documents ?? [];
  const comments = ticket.comments ?? [];
  const attachments = ticket.attachments ?? [];
  // Todos los archivos (portal + WhatsApp), no solo los sin comentario.
  const allAttachments = attachments;

  return (
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900 sm:text-xl">
                {ticket.ticketTypeName ?? "Solicitud"}
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
          <div className="flex items-center gap-2">
            {justUpdated && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Actualizado
              </span>
            )}
            <StatusBadge status={ticket.status} />
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-slate-400">Creada</dt>
            <dd className="text-slate-700">{formatDate(ticket.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Última actualización</dt>
            <dd className="text-slate-700">{formatDate(ticket.updatedAt)}</dd>
          </div>
        </dl>
      </div>

      {/* Datos de la solicitud */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">
          Datos de la solicitud
        </h2>
        {values.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Esta solicitud no tiene datos adicionales.
          </p>
        ) : (
          <dl className="mt-3 divide-y divide-slate-100">
            {values.map((v) => (
              <div
                key={v.fieldKey}
                className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-3 sm:gap-3"
              >
                <dt className="text-sm font-medium text-slate-500">
                  {v.label}
                </dt>
                <dd className="text-sm text-slate-800 sm:col-span-2">
                  {v.value?.trim() ? v.value : "—"}
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
              <li key={doc.id}>
                <a
                  href={`/api/portal/tickets/${ticket.id}/documents/${doc.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 shadow-sm transition-colors hover:bg-emerald-50"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                  </svg>
                  Ver carta de autorización (PDF)
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

      {/* Comentarios */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Comentarios</h2>
        {comments.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Aún no hay comentarios. Escribe el primero.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {comments.map((c) => {
              const commentAttachments = c.attachments ?? [];
              const viaWhatsApp = /\(WhatsApp\)/i.test(c.authorName ?? "");
              const displayName = viaWhatsApp
                ? (c.authorName ?? "Tú").replace(/\s*\(WhatsApp\)\s*/i, "").trim() ||
                  "Tú"
                : c.authorName ??
                  (c.authorType === "admin" ? "ARC" : "Tú");
              return (
                <li
                  key={c.id}
                  className={`rounded-lg border p-3 ${
                    c.authorType === "admin"
                      ? "border-emerald-100 bg-emerald-50/50"
                      : "border-slate-100 bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-600">
                      {c.authorType === "client" && !viaWhatsApp
                        ? "Tú"
                        : displayName}
                      {viaWhatsApp && (
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                          WhatsApp
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-slate-400">
                      {formatDateTime(c.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                    {c.body}
                  </p>
                  {commentAttachments.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                      {commentAttachments.map((att) => (
                        <li key={att.id}>
                          <a
                            href={`/api/portal/tickets/${ticket.id}/attachments/${att.id}`}
                            download
                            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-emerald-700 shadow-sm transition-colors hover:bg-emerald-50"
                          >
                            <svg
                              className="h-3.5 w-3.5"
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
                            <span className="max-w-[12rem] truncate">
                              {att.originalName}
                            </span>
                            <span className="text-slate-400">
                              ({formatBytes(att.sizeBytes)})
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
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
            <p className="mb-1.5 text-sm font-medium text-slate-700">
              Adjuntar archivos (opcional)
            </p>
            <AttachmentPicker
              files={commentFiles}
              onChange={setCommentFiles}
              disabled={posting}
            />
          </div>

          {commentError && (
            <p className="mt-2 text-sm text-rose-600">{commentError}</p>
          )}
          {uploadNotice && (
            <p className="mt-2 text-sm text-amber-600">{uploadNotice}</p>
          )}
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={
                posting || (!comment.trim() && commentFiles.length === 0)
              }
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
            >
              {posting ? "Enviando…" : "Enviar comentario"}
            </button>
          </div>
        </form>
      </section>
    </div>
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
