import fs from "node:fs";
import path from "node:path";

const MAX_PDF_SIZE = 20 * 1024 * 1024;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const PDF_MIME = new Set(["application/pdf"]);
const IMAGE_MIME = new Map([
  ["image/jpeg", ".jpeg"],
  ["image/jpg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

const DEFAULT_REGLAMENTOS_DIR = path.resolve(process.cwd(), "../Reglamentos");

export interface DocumentInfo {
  name: string;
  kind: "pdf" | "image";
  size: number;
  modifiedAt: number;
}

export function getReglamentosRootDir(): string {
  const dir = process.env.REGLAMENTOS_DIR ?? DEFAULT_REGLAMENTOS_DIR;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** @deprecated Use getDocumentsDir(condominioId) — root is no longer the doc store. */
export function getDocumentsDir(): string {
  return getReglamentosRootDir();
}

export function getCondominioDocumentsDir(condominioId: number): string {
  if (!Number.isInteger(condominioId) || condominioId <= 0) {
    throw new Error("condominioId inválido");
  }
  const dir = path.join(getReglamentosRootDir(), `condo-${condominioId}`);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function isPdf(name: string): boolean {
  return name.toLowerCase().endsWith(".pdf");
}

function isImage(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return [".jpeg", ".jpg", ".png", ".webp"].includes(ext);
}

export function sanitizeFilename(name: string): string {
  const base = path.basename(name).replace(/[^\w.\- áéíóúñÁÉÍÓÚÑ()]/g, "_");
  if (!base || base === "." || base === "..") {
    throw new Error("Nombre de archivo inválido");
  }
  return base;
}

function listDocumentsInDir(dir: string): DocumentInfo[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => isPdf(name) || isImage(name))
    .map((name) => {
      const stat = fs.statSync(path.join(dir, name));
      return {
        name,
        kind: isPdf(name) ? ("pdf" as const) : ("image" as const),
        size: stat.size,
        modifiedAt: Math.floor(stat.mtimeMs / 1000),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export function listDocuments(condominioId: number): DocumentInfo[] {
  return listDocumentsInDir(getCondominioDocumentsDir(condominioId));
}

export function countDocuments(condominioId: number): number {
  return listDocuments(condominioId).length;
}

export function saveDocument(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  condominioId: number
): DocumentInfo {
  const filename = sanitizeFilename(originalName);
  const ext = path.extname(filename).toLowerCase();

  if (ext === ".pdf") {
    if (!PDF_MIME.has(mimeType) && mimeType !== "application/octet-stream") {
      throw new Error("El archivo debe ser un PDF");
    }
    if (buffer.length > MAX_PDF_SIZE) {
      throw new Error("El PDF no puede superar 20 MB");
    }
  } else if (isImage(filename)) {
    const allowed = [...IMAGE_MIME.values()];
    if (!allowed.includes(ext) && mimeType !== "application/octet-stream") {
      throw new Error("Formato de imagen no soportado");
    }
    if (buffer.length > MAX_IMAGE_SIZE) {
      throw new Error("La imagen no puede superar 10 MB");
    }
  } else {
    throw new Error("Solo se permiten PDF o imágenes JPEG/PNG/WEBP");
  }

  const dir = getCondominioDocumentsDir(condominioId);
  const filePath = path.join(dir, filename);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  fs.writeFileSync(filePath, buffer);
  const stat = fs.statSync(filePath);

  return {
    name: filename,
    kind: isPdf(filename) ? "pdf" : "image",
    size: stat.size,
    modifiedAt: Math.floor(stat.mtimeMs / 1000),
  };
}

export function deleteDocument(filename: string, condominioId: number): void {
  const safe = sanitizeFilename(filename);
  const filePath = path.join(getCondominioDocumentsDir(condominioId), safe);
  if (!fs.existsSync(filePath)) {
    throw new Error("Archivo no encontrado");
  }
  fs.unlinkSync(filePath);
}

export function resolveDocumentPath(
  condominioId: number,
  filename: string
): string {
  const safe = sanitizeFilename(filename);
  const filePath = path.join(getCondominioDocumentsDir(condominioId), safe);
  if (!fs.existsSync(filePath)) {
    throw new Error("Archivo no encontrado");
  }
  const resolved = path.resolve(filePath);
  const root = path.resolve(getCondominioDocumentsDir(condominioId));
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error("Ruta de archivo inválida");
  }
  return resolved;
}

export function deleteCondominioDocuments(condominioId: number): void {
  const dir = path.join(getReglamentosRootDir(), `condo-${condominioId}`);
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Lista ids de condominios que tienen carpeta condo-{id} en el root. */
export function listCondominioIdsWithDocumentFolders(): number[] {
  const root = getReglamentosRootDir();
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^condo-\d+$/.test(d.name))
    .map((d) => Number(d.name.replace("condo-", "")))
    .filter((id) => Number.isInteger(id) && id > 0)
    .sort((a, b) => a - b);
}
