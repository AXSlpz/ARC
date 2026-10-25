const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const ARCH_EXT = new Set([
  "dwg",
  "dxf",
  "dwf",
  "dwt",
  "skp",
  "rvt",
  "rfa",
  "ifc",
  "plt",
  "3dm",
  "dgn",
  "stl",
]);

export type AttachmentPreviewKind = "image" | "pdf" | "text" | "office" | "none";

export function fileExtension(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim());
  return match ? match[1]!.toLowerCase() : "";
}

/** Planos y archivos de diseño. Un PDF o una imagen de ese plano también se puede ver. */
export function isArchitectureFile(
  name: string,
  category: string | null | undefined
): boolean {
  if (ARCH_EXT.has(fileExtension(name))) return true;
  if (category === "croquis") return true;
  return /\b(plano|planos|croquis)\b/i.test(name);
}

export function previewKind(name: string, mime: string): AttachmentPreviewKind {
  const ext = fileExtension(name);
  const type = mime.trim().toLowerCase();
  if (IMAGE_EXT.has(ext) || type.startsWith("image/")) return "image";
  if (ext === "pdf" || type === "application/pdf") return "pdf";
  if (ext === "txt" || type.startsWith("text/plain")) return "text";
  if (ext === "docx" || ext === "xlsx") return "office";
  return "none";
}

export function canPreviewFile(name: string, mime: string): boolean {
  return previewKind(name, mime) !== "none";
}

export function inlineMime(name: string, mime: string): string | null {
  const kind = previewKind(name, mime);
  if (kind === "image") {
    const ext = fileExtension(name);
    if (ext === "png") return "image/png";
    if (ext === "webp") return "image/webp";
    if (ext === "gif") return "image/gif";
    if (typeIs(mime, "image/png", "image/webp", "image/gif")) return mime;
    return "image/jpeg";
  }
  if (kind === "pdf") return "application/pdf";
  if (kind === "text") return "text/plain; charset=utf-8";
  return null;
}

function typeIs(mime: string, ...allowed: string[]): boolean {
  const type = mime.trim().toLowerCase();
  return allowed.includes(type);
}
