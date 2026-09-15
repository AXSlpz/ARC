import type { TicketAttachment, TicketStatus } from "@/lib/portal/types";
import { TICKET_STATUS_LABELS } from "@/lib/portal/types";

/**
 * Cliente fetch same-origin para el portal. Las cookies (arc_portal_session)
 * viajan automáticamente. Parsea `{ error }` en fallos y lanza Error.
 */
export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new Error("No se pudo conectar con el servidor");
  }

  const data = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | null;

  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "error" in data && data.error) ||
      "Ocurrió un error inesperado";
    throw new Error(String(message));
  }

  return data as T;
}

/** Clases Tailwind (badge) por estatus de ticket. */
export const STATUS_BADGE_CLASSES: Record<TicketStatus, string> = {
  nuevo: "bg-slate-100 text-slate-700 border-slate-200",
  en_revision: "bg-amber-100 text-amber-800 border-amber-200",
  autorizado: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rechazado: "bg-rose-100 text-rose-800 border-rose-200",
  en_proceso: "bg-blue-100 text-blue-800 border-blue-200",
  completado: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cerrado: "bg-slate-100 text-slate-600 border-slate-200",
  cancelado: "bg-rose-100 text-rose-700 border-rose-200",
};

export function statusLabel(status: TicketStatus): string {
  return TICKET_STATUS_LABELS[status] ?? status;
}

/** Los timestamps del portal son epoch en segundos. */
export function formatDate(epochSeconds: number): string {
  if (!epochSeconds) return "—";
  const d = new Date(epochSeconds * 1000);
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function formatDateTime(epochSeconds: number): string {
  if (!epochSeconds) return "—";
  const d = new Date(epochSeconds * 1000);
  return d.toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// --- Adjuntos de tickets ---------------------------------------------------

/** Reglas del backend para adjuntos del portal. */
export const ATTACHMENT_MAX_FILES = 5;
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const ATTACHMENT_ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.webp,.gif,.txt,.doc,.docx,.xls,.xlsx";
export const ATTACHMENT_TYPES_LABEL =
  "PDF, JPG, PNG, WEBP, GIF, TXT, DOC, DOCX, XLS, XLSX";

/** Formatea bytes a un texto legible (KB, MB…). */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export interface UploadAttachmentsResult {
  stored: number;
  errors: string[];
  attachments: TicketAttachment[];
}

/**
 * Sube uno o varios archivos como adjuntos de un ticket. No fija Content-Type
 * manualmente (el navegador arma el multipart/form-data con su boundary).
 * Si se pasa `commentId`, los adjuntos quedan ligados a ese comentario.
 */
export async function uploadAttachments(
  ticketId: number | string,
  files: File[],
  commentId?: number,
): Promise<UploadAttachmentsResult> {
  const formData = new FormData();
  for (const file of files) formData.append("files", file);
  if (commentId != null) formData.append("commentId", String(commentId));

  let res: Response;
  try {
    res = await fetch(`/api/portal/tickets/${ticketId}/attachments`, {
      method: "POST",
      body: formData,
      credentials: "same-origin",
    });
  } catch {
    throw new Error("No se pudieron subir los archivos");
  }

  const data = (await res.json().catch(() => null)) as
    | (UploadAttachmentsResult & { error?: string })
    | null;

  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "error" in data && data.error) ||
      "No se pudieron subir los archivos";
    throw new Error(String(message));
  }

  return {
    stored: data?.stored ?? 0,
    errors: data?.errors ?? [],
    attachments: data?.attachments ?? [],
  };
}
