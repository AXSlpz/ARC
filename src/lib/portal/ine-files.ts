import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export const IDENTITY_DIR = path.resolve(process.cwd(), "data", "identity");
export const INE_PENDING_DIR = path.join(IDENTITY_DIR, "pending");

const MAX_BYTES = 10 * 1024 * 1024;
const MIN_EDGE = 900;

export class IneFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IneFileError";
  }
}

function magicOk(buf: Buffer): "jpeg" | "png" | "webp" | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45
  ) {
    return "webp";
  }
  return null;
}

export async function acceptIneImage(buf: Buffer, sideLabel: string): Promise<Buffer> {
  if (buf.length > MAX_BYTES) {
    throw new IneFileError(`La foto del ${sideLabel} pesa más de 10 MB.`);
  }
  const kind = magicOk(buf);
  if (!kind) {
    throw new IneFileError(
      `La foto del ${sideLabel} no es una imagen válida. Usa JPG, PNG o WEBP.`
    );
  }
  const image = sharp(buf, { failOn: "error" }).rotate();
  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < MIN_EDGE || height < MIN_EDGE * 0.5) {
    throw new IneFileError(
      `La foto del ${sideLabel} quedó muy pequeña. Acerca la credencial al marco y repítela.`
    );
  }
  const stats = await image.stats();
  const channels = stats.channels.map((channel) => channel.mean);
  const mean = channels.reduce((sum, value) => sum + value, 0) / Math.max(channels.length, 1);
  if (mean < 28) {
    throw new IneFileError(
      `La foto del ${sideLabel} está muy oscura. Busca más luz y repítela.`
    );
  }
  return image.jpeg({ quality: 90 }).toBuffer();
}

export async function storeIneImage(buf: Buffer, folder: string): Promise<string> {
  await mkdir(folder, { recursive: true });
  const filename = `${randomBytes(12).toString("hex")}.jpg`;
  const stored = path.join(folder, filename);
  const resolved = path.resolve(stored);
  if (!resolved.startsWith(path.resolve(folder) + path.sep)) {
    throw new IneFileError("No se pudo guardar la foto.");
  }
  await writeFile(resolved, buf);
  return resolved;
}

export function pathInsideIdentity(filePath: string): string | null {
  const resolved = path.resolve(filePath);
  const root = IDENTITY_DIR + path.sep;
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

export function identityContentType(buf: Buffer): { type: string; ext: string } {
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return { type: "application/pdf", ext: "pdf" };
  }
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { type: "image/png", ext: "png" };
  }
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45
  ) {
    return { type: "image/webp", ext: "webp" };
  }
  return { type: "image/jpeg", ext: "jpg" };
}
