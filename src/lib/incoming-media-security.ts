import { randomBytes } from "node:crypto";
import path from "node:path";
import sharp from "sharp";

export const INCOMING_UPLOADS_DIR = path.resolve(
  process.cwd(),
  "data",
  "uploads",
  "incoming"
);

export const PORTAL_FILE_LIMIT_BYTES = 10 * 1024 * 1024;

export const FILE_TOO_LARGE_MESSAGE =
  "Ese archivo pesa más de 10 MB, que es el límite del portal. Envíalo más ligero o súbelo desde tu portal si no pasa de 10 MB.";

export function declaredByteLength(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  if (value && typeof value === "object") {
    const raw = String(value);
    if (/^\d+$/.test(raw)) {
      const asNumber = Number(raw);
      return Number.isFinite(asNumber) ? asNumber : null;
    }
  }
  return null;
}

export function exceedsPortalFileLimit(value: unknown): boolean {
  const bytes = declaredByteLength(value);
  return bytes != null && bytes > PORTAL_FILE_LIMIT_BYTES;
}

export const BLOCKED_MEDIA_MESSAGES = {
  pdf:
    "Por seguridad no procesamos archivos PDF por este canal. Envía una *foto* del documento o escribe tu consulta en texto.",
  document:
    "Por seguridad no aceptamos archivos adjuntos (Word, Excel, ZIP, etc.). Envía una *foto* o escribe tu mensaje en texto.",
  unsupported:
    "Solo puedo procesar mensajes de texto e imágenes. Si necesitas compartir un documento, envíalo como *foto*.",
  invalidImage:
    "No pude procesar esa imagen de forma segura. Intenta enviarla de nuevo como foto (JPEG o PNG), sin editores especiales.",
} as const;

export type BlockedMediaKind = keyof typeof BLOCKED_MEDIA_MESSAGES;

export class IncomingMediaError extends Error {
  constructor(
    message: string,
    readonly code: "too_large" | "invalid_format" | "sanitize_failed"
  ) {
    super(message);
    this.name = "IncomingMediaError";
  }
}

type ImageFormat = "jpeg" | "png" | "webp";

function readHeader(buffer: Buffer, length: number): Buffer {
  return buffer.subarray(0, Math.min(length, buffer.length));
}

export function detectImageFormat(buffer: Buffer): ImageFormat | null {
  if (buffer.length < 12) return null;

  const h = readHeader(buffer, 12);
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return "jpeg";
  if (
    h[0] === 0x89 &&
    h[1] === 0x50 &&
    h[2] === 0x4e &&
    h[3] === 0x47 &&
    h[4] === 0x0d &&
    h[5] === 0x0a &&
    h[6] === 0x1a &&
    h[7] === 0x0a
  ) {
    return "png";
  }
  if (
    h.toString("ascii", 0, 4) === "RIFF" &&
    h.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }

  return null;
}

export function assertIncomingImageBuffer(buffer: Buffer): ImageFormat {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new IncomingMediaError("Archivo vacío", "invalid_format");
  }
  if (buffer.length > PORTAL_FILE_LIMIT_BYTES) {
    throw new IncomingMediaError("Imagen demasiado grande", "too_large");
  }

  const format = detectImageFormat(buffer);
  if (!format) {
    throw new IncomingMediaError("Formato de imagen no permitido", "invalid_format");
  }

  return format;
}

/** Nombre seguro: sin input del cliente; solo timestamp + random. */
export function buildSecureIncomingFilename(): string {
  const token = randomBytes(8).toString("hex");
  return `${Date.now()}-${token}.jpg`;
}

export function resolvePathInsideIncomingDir(filename: string): string {
  const base = path.basename(filename);
  if (base !== filename || base.includes("..")) {
    throw new IncomingMediaError("Nombre de archivo inválido", "invalid_format");
  }
  const resolved = path.resolve(INCOMING_UPLOADS_DIR, base);
  const rootWithSep = INCOMING_UPLOADS_DIR + path.sep;
  if (!resolved.startsWith(rootWithSep)) {
    throw new IncomingMediaError("Ruta de archivo no permitida", "invalid_format");
  }
  return resolved;
}

export function assertPathInsideUploadsRoot(
  filePath: string,
  uploadsRoot: string
): string {
  const resolved = path.resolve(filePath);
  const root = path.resolve(uploadsRoot);
  const rootWithSep = root + path.sep;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    throw new Error("Ruta de archivo no permitida");
  }
  return resolved;
}

/**
 * Re-codifica la imagen: elimina EXIF/metadata y normaliza a JPEG.
 * Solo se usa el contenido visual para OCR/visión.
 */
export async function sanitizeIncomingImage(buffer: Buffer): Promise<Buffer> {
  assertIncomingImageBuffer(buffer);

  try {
    return await sharp(buffer, { failOn: "error", limitInputPixels: 40_000_000 })
      .rotate()
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new IncomingMediaError(
      "No se pudo sanitizar la imagen",
      "sanitize_failed"
    );
  }
}

export function isPdfDocument(
  mimeType: string | null | undefined,
  fileName: string | null | undefined
): boolean {
  const mime = (mimeType ?? "").toLowerCase();
  const name = (fileName ?? "").toLowerCase();
  return mime.includes("pdf") || name.endsWith(".pdf");
}

export function isBlockedClientDocument(
  mimeType: string | null | undefined,
  fileName: string | null | undefined
): BlockedMediaKind | null {
  if (isPdfDocument(mimeType, fileName)) return "pdf";

  const mime = (mimeType ?? "").toLowerCase();
  const name = (fileName ?? "").toLowerCase();

  const blockedExtensions = [
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".zip",
    ".rar",
    ".7z",
    ".exe",
    ".apk",
    ".html",
    ".htm",
    ".js",
    ".svg",
  ];
  if (blockedExtensions.some((ext) => name.endsWith(ext))) return "document";

  const blockedMimes = [
    "application/",
    "text/html",
    "text/javascript",
    "image/svg",
  ];
  if (
    mime &&
    blockedMimes.some((prefix) => mime.startsWith(prefix)) &&
    !mime.startsWith("image/jpeg") &&
    !mime.startsWith("image/png") &&
    !mime.startsWith("image/webp")
  ) {
    return "document";
  }

  return null;
}
