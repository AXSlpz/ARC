/**
 * Validación y almacenamiento seguro de evidencias visuales de firma.
 *
 * Garantías:
 * - Solo acepta data URL PNG (magic bytes verificados).
 * - Límite estricto de 512 KB decodificado.
 * - No acepta SVG ni ningún otro formato.
 * - Archivo guardado en directorio privado (no bajo /public) con permisos 0o600.
 * - Nombre del archivo generado con randomBytes (no predecible).
 * - cleanupPath() permite borrar el archivo si la transacción falla.
 * - Nunca se expone el path al cliente; solo el SHA-256.
 */
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { z } from "zod";

// ── Constantes ─────────────────────────────────────────────────────────────────

const MAX_IMAGE_BYTES = 512 * 1024; // 512 KB decoded
const SIGNATURE_DIR = path.join(process.cwd(), "data", "signatures");

// Prefijo PNG magic bytes (89 50 4E 47 0D 0A 1A 0A)
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// ── Zod schema ─────────────────────────────────────────────────────────────────

const DrawnSchema = z.object({
  method: z.literal("drawn"),
  dataUrl: z
    .string()
    .min(1)
    .max(1_000_000) // guarda máximo razonable antes de decodificar
    .refine((s) => s.startsWith("data:image/png;base64,"), {
      message: "Solo se acepta PNG como evidencia de firma (data:image/png;base64,…).",
    }),
});

const TypedSchema = z.object({
  method: z.literal("typed"),
  typedName: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres.")
    .max(200, "El nombre es demasiado largo."),
});

export const SignatureInputSchema = z.discriminatedUnion("method", [
  DrawnSchema,
  TypedSchema,
]);

export type SignatureInput = z.infer<typeof SignatureInputSchema>;

// ── Resultado ──────────────────────────────────────────────────────────────────

export type ValidateSignatureResult =
  | {
      ok: true;
      method: "drawn" | "typed";
      /** Ruta absoluta al archivo guardado (null para typed). Solo uso interno. */
      imagePath: string;
      /** SHA-256 hex del contenido de la imagen (null para typed). */
      imageSha256: string;
    }
  | {
      ok: true;
      method: "typed";
      imagePath: null;
      imageSha256: null;
      typedName: string;
    }
  | { ok: false; error: string };

// ── API principal ──────────────────────────────────────────────────────────────

/**
 * Valida una firma estructurada y, si es 'drawn', guarda el archivo PNG.
 *
 * Para 'drawn':
 *   - Valida magic bytes PNG en los primeros 8 bytes decodificados.
 *   - Verifica tamaño ≤ 512 KB.
 *   - Guarda en SIGNATURE_DIR con nombre aleatorio y permisos 0o600.
 *   - Retorna imagePath (privado) y imageSha256.
 *
 * Para 'typed':
 *   - Valida longitud del nombre.
 *   - No guarda ningún archivo.
 *   - imagePath y imageSha256 son null.
 */
export async function validateSignatureInput(
  raw: unknown
): Promise<ValidateSignatureResult> {
  // Zod parse
  const parsed = SignatureInputSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues;
    return {
      ok: false,
      error: issues[0]?.message ?? "Firma inválida.",
    };
  }

  const input = parsed.data;

  if (input.method === "typed") {
    return {
      ok: true,
      method: "typed",
      imagePath: null,
      imageSha256: null,
      typedName: input.typedName,
    };
  }

  // ── Drawn ──────────────────────────────────────────────────────────────────
  const b64 = input.dataUrl.replace(/^data:image\/png;base64,/, "");

  // Decodificar y validar tamaño antes de procesar
  let imgBuf: Buffer;
  try {
    imgBuf = Buffer.from(b64, "base64");
  } catch {
    return { ok: false, error: "Base64 inválido en la imagen de firma." };
  }

  if (imgBuf.length > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: `La imagen de firma excede el límite de ${MAX_IMAGE_BYTES / 1024} KB.`,
    };
  }

  if (imgBuf.length < 8) {
    return { ok: false, error: "La imagen de firma es demasiado pequeña." };
  }

  // Validar PNG magic bytes
  const hasPngMagic = PNG_MAGIC.every((b, i) => imgBuf[i] === b);
  if (!hasPngMagic) {
    return {
      ok: false,
      error: "El archivo debe ser una imagen PNG válida (magic bytes incorrectos).",
    };
  }

  // Calcular SHA-256 del contenido real
  const imageSha256 = createHash("sha256").update(imgBuf).digest("hex");

  // Guardar en directorio privado
  const userDir = SIGNATURE_DIR;
  await mkdir(userDir, { recursive: true });
  const filename = `sig-${randomBytes(16).toString("hex")}.png`;
  const imagePath = path.join(userDir, filename);

  await writeFile(imagePath, imgBuf, { mode: 0o600 });

  return {
    ok: true,
    method: "drawn",
    imagePath,
    imageSha256,
  };
}

/**
 * Elimina el archivo de firma si existe (cleanup en caso de rollback).
 * Silencia errores (best-effort).
 */
export async function cleanupPath(filePath: string | null): Promise<void> {
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch {
    // Ignorar si no existe o ya fue borrado
  }
}
