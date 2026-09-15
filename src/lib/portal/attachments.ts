import { mkdir, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import db from "../db";
import { initPhase2Schema } from "./schema";
import type { TicketAttachment } from "./types";

initPhase2Schema();

const UPLOADS_DIR = path.join(process.cwd(), "data", "uploads", "tickets");

/** Límite por archivo (bytes). Configurable con MAX_UPLOAD_MB. */
export const MAX_FILE_BYTES =
  Number(process.env.MAX_UPLOAD_MB || 10) * 1024 * 1024;
export const MAX_FILES_PER_REQUEST = 5;

/**
 * Whitelist de tipos permitidos. Se excluyen deliberadamente formatos
 * ejecutables o con capacidad de script (exe, sh, js, html, svg, etc.).
 */
const ALLOWED: Record<string, { ext: string; mimes: string[] }> = {
  pdf: { ext: "pdf", mimes: ["application/pdf"] },
  jpg: { ext: "jpg", mimes: ["image/jpeg"] },
  jpeg: { ext: "jpg", mimes: ["image/jpeg"] },
  png: { ext: "png", mimes: ["image/png"] },
  webp: { ext: "webp", mimes: ["image/webp"] },
  gif: { ext: "gif", mimes: ["image/gif"] },
  txt: { ext: "txt", mimes: ["text/plain"] },
  doc: { ext: "doc", mimes: ["application/msword"] },
  docx: {
    ext: "docx",
    mimes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  },
  xls: { ext: "xls", mimes: ["application/vnd.ms-excel"] },
  xlsx: {
    ext: "xlsx",
    mimes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
  },
};

function extOf(filename: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(filename.trim().toLowerCase());
  return m ? m[1]! : "";
}

/**
 * Verificación de "magic bytes" para los formatos con firma conocida.
 * Para formatos sin firma fiable (txt, doc) se omite esta comprobación.
 * Los .docx/.xlsx son ZIP (PK\x03\x04).
 */
function magicOk(ext: string, buf: Buffer): boolean {
  const startsWith = (sig: number[]) =>
    sig.every((b, i) => buf[i] === b);
  switch (ext) {
    case "pdf":
      return startsWith([0x25, 0x50, 0x44, 0x46]); // %PDF
    case "jpg":
      return startsWith([0xff, 0xd8, 0xff]);
    case "png":
      return startsWith([0x89, 0x50, 0x4e, 0x47]);
    case "gif":
      return startsWith([0x47, 0x49, 0x46, 0x38]); // GIF8
    case "webp":
      return (
        startsWith([0x52, 0x49, 0x46, 0x46]) && // RIFF
        buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50 // WEBP
      );
    case "docx":
    case "xlsx":
      return startsWith([0x50, 0x4b, 0x03, 0x04]); // PK zip
    case "txt":
    case "doc":
    case "xls":
      return true; // sin firma fiable; se acepta por extensión/mime + tamaño
    default:
      return true;
  }
}

/**
 * Antivirus opcional (ClamAV). Si `clamdscan`/`clamscan` está disponible y
 * ENABLE_CLAMAV=true, escanea el buffer. Si no, marca "skipped".
 * El escaneo NUNCA ejecuta el archivo; solo lo analiza.
 */
async function scanBuffer(buf: Buffer): Promise<"clean" | "infected" | "skipped"> {
  if (process.env.ENABLE_CLAMAV !== "true") return "skipped";
  try {
    const { spawn } = await import("node:child_process");
    return await new Promise((resolve) => {
      const proc = spawn("clamdscan", ["-", "--no-summary"], {
        stdio: ["pipe", "ignore", "ignore"],
      });
      proc.on("error", () => resolve("skipped"));
      proc.on("close", (code) => {
        // clamdscan: 0 limpio, 1 infectado, 2 error
        if (code === 0) resolve("clean");
        else if (code === 1) resolve("infected");
        else resolve("skipped");
      });
      proc.stdin.write(buf);
      proc.stdin.end();
    });
  } catch {
    return "skipped";
  }
}

export interface StoreFileInput {
  ticketId: number;
  commentId?: number | null;
  uploaderType: "client" | "admin";
  originalName: string;
  declaredMime: string;
  bytes: Buffer;
}

export type StoreFileResult =
  | { ok: true; attachment: TicketAttachment }
  | { ok: false; error: string };

export async function storeAttachment(
  input: StoreFileInput
): Promise<StoreFileResult> {
  const size = input.bytes.length;
  if (size <= 0) return { ok: false, error: "Archivo vacío." };
  if (size > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `El archivo supera el máximo de ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB.`,
    };
  }

  const ext = extOf(input.originalName);
  const rule = ALLOWED[ext];
  if (!rule) {
    return {
      ok: false,
      error: `Tipo de archivo no permitido (.${ext || "?"}). Permitidos: ${Object.keys(ALLOWED).join(", ")}.`,
    };
  }
  if (input.declaredMime && !rule.mimes.includes(input.declaredMime)) {
    // MIME declarado no coincide con la extensión: rechazar por seguridad.
    return { ok: false, error: "El tipo declarado no coincide con la extensión." };
  }
  if (!magicOk(rule.ext, input.bytes)) {
    return { ok: false, error: "El contenido del archivo no coincide con su tipo." };
  }

  const scanned = await scanBuffer(input.bytes);
  if (scanned === "infected") {
    return { ok: false, error: "El archivo fue rechazado por el antivirus." };
  }

  const dir = path.join(UPLOADS_DIR, String(input.ticketId));
  await mkdir(dir, { recursive: true });
  const storedName = `${randomBytes(16).toString("hex")}.${rule.ext}`;
  const storedPath = path.join(dir, storedName);
  await writeFile(storedPath, input.bytes, { mode: 0o600 });

  const res = db
    .prepare(
      `INSERT INTO ticket_attachments
         (ticket_id, comment_id, uploader_type, original_name, stored_path, mime, size_bytes, scanned)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.ticketId,
      input.commentId ?? null,
      input.uploaderType,
      input.originalName.slice(0, 200),
      storedPath,
      rule.mimes[0] ?? "application/octet-stream",
      size,
      scanned
    );

  const row = getAttachmentRow(Number(res.lastInsertRowid));
  db.prepare("UPDATE tickets SET updated_at = unixepoch() WHERE id = ?").run(
    input.ticketId
  );
  return { ok: true, attachment: row! };
}

interface AttachmentRow {
  id: number;
  ticket_id: number;
  comment_id: number | null;
  uploader_type: string;
  original_name: string;
  stored_path: string;
  mime: string;
  size_bytes: number;
  scanned: string;
  created_at: number;
}

function mapAttachment(row: AttachmentRow): TicketAttachment {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    commentId: row.comment_id,
    uploaderType: row.uploader_type === "admin" ? "admin" : "client",
    originalName: row.original_name,
    mime: row.mime,
    sizeBytes: row.size_bytes,
    scanned: row.scanned,
    createdAt: row.created_at,
  };
}

function getAttachmentRow(id: number): TicketAttachment | null {
  const row = db
    .prepare("SELECT * FROM ticket_attachments WHERE id = ?")
    .get(id) as AttachmentRow | undefined;
  return row ? mapAttachment(row) : null;
}

export function listAttachments(ticketId: number): TicketAttachment[] {
  const rows = db
    .prepare(
      "SELECT * FROM ticket_attachments WHERE ticket_id = ? ORDER BY created_at, id"
    )
    .all(ticketId) as AttachmentRow[];
  return rows.map(mapAttachment);
}

export function getAttachment(ticketId: number, attachmentId: number): TicketAttachment | null {
  const row = db
    .prepare("SELECT * FROM ticket_attachments WHERE id = ? AND ticket_id = ?")
    .get(attachmentId, ticketId) as AttachmentRow | undefined;
  return row ? mapAttachment(row) : null;
}

/** Ruta física para leer/servir el archivo (uso interno del servidor). */
export function getAttachmentStoredPath(
  ticketId: number,
  attachmentId: number
): { path: string; originalName: string } | null {
  const row = db
    .prepare("SELECT stored_path, original_name FROM ticket_attachments WHERE id = ? AND ticket_id = ?")
    .get(attachmentId, ticketId) as
    | { stored_path: string; original_name: string }
    | undefined;
  if (!row || !existsSync(row.stored_path)) return null;
  return { path: row.stored_path, originalName: row.original_name };
}

export async function deleteAttachment(
  ticketId: number,
  attachmentId: number
): Promise<boolean> {
  const row = db
    .prepare("SELECT stored_path FROM ticket_attachments WHERE id = ? AND ticket_id = ?")
    .get(attachmentId, ticketId) as { stored_path: string } | undefined;
  if (!row) return false;
  if (row.stored_path && existsSync(row.stored_path)) {
    try {
      await unlink(row.stored_path);
    } catch {
      /* ignore */
    }
  }
  const res = db.prepare("DELETE FROM ticket_attachments WHERE id = ?").run(attachmentId);
  return res.changes > 0;
}
