/**
 * Servicio: Firmas y evidencias de consentimiento en solicitudes.
 *
 * Registra la firma digital de un residente, comité o admin sobre una solicitud.
 * El hash SHA-256 del contenido firmado garantiza integridad.
 * No almacena la clave privada; solo el hash + contenido firmado + metadatos.
 */
import { createHash } from "node:crypto";
import db from "../db-connection";
import { initPhase3Schema } from "./schema-phase3";

initPhase3Schema();

// La unique constraint en request_signatures se aplica vía runMigration
// en schema-phase3.ts (incluye dedup de datos existentes).

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type SignerRole = "resident" | "committee" | "admin";

export interface RequestSignature {
  id: number;
  ticketId: number;
  signerId: number | null;
  signerName: string;
  signerRole: SignerRole;
  signatureHash: string;
  signedContent: string;
  ipAddress: string | null;
  userAgent: string | null;
  signedAt: number;
  /** Método de firma: 'drawn' (trazo) | 'typed' (nombre). */
  signatureMethod: "drawn" | "typed" | null;
  /** SHA-256 de la imagen del trazo. Nunca se expone el path. */
  signatureImageSha256: string | null;
}

interface SignatureRow {
  id: number;
  ticket_id: number;
  signer_id: number | null;
  signer_name: string;
  signer_role: string;
  signature_hash: string;
  signed_content: string;
  ip_address: string | null;
  user_agent: string | null;
  signed_at: number;
  signature_method: string | null;
  /** Solo para uso interno (no se expone al cliente). */
  signature_image_path: string | null;
  signature_image_sha256: string | null;
}

function mapSignature(row: SignatureRow): RequestSignature {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    signerId: row.signer_id,
    signerName: row.signer_name,
    signerRole: (["resident", "committee", "admin"] as const).includes(
      row.signer_role as SignerRole
    )
      ? (row.signer_role as SignerRole)
      : "resident",
    signatureHash: row.signature_hash,
    signedContent: row.signed_content,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    signedAt: row.signed_at,
    signatureMethod: (["drawn", "typed"] as const).includes(
      row.signature_method as "drawn" | "typed"
    )
      ? (row.signature_method as "drawn" | "typed")
      : null,
    // imageSha256 expuesto; imagePath NUNCA se incluye en el objeto público
    signatureImageSha256: row.signature_image_sha256 ?? null,
  };
}

// ── Canonical consent text ────────────────────────────────────────────────────

export interface ConsentTextParams {
  signerName: string;
  propertyIdentifier: string;
  modificationName: string;
  developmentName: string;
  /** Fecha en formato YYYY-MM-DD */
  date: string;
}

/**
 * Genera el texto de consentimiento canónico para una modificación.
 *
 * IMPORTANTE: Este texto se genera SIEMPRE en el servidor, nunca se acepta
 * del cliente. Así se evita que el usuario pueda firmar texto arbitrario.
 *
 * El texto está basado en el lenguaje del reglamento de modificaciones de ARC.
 */
export function buildConsentText(params: ConsentTextParams): string {
  const { signerName, propertyIdentifier, modificationName, developmentName, date } = params;
  // NOTA: Este texto solo declara hechos verificables; no contiene afirmaciones
  // legales sobre validez jurídica ni referencias a legislación específica.
  return (
    `Yo, ${signerName}, declaro ser residente/propietario de la vivienda ` +
    `${propertyIdentifier} en ${developmentName}. ` +
    `Solicito revisión y autorización de la modificación: "${modificationName}". ` +
    `Manifiesto haber leído y estar de acuerdo con el Reglamento de Modificaciones ` +
    `al Inmueble y los lineamientos del desarrollo. ` +
    `Fecha: ${date}.`
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Calcula el SHA-256 del contenido firmado.
 * El hash incluye: ticketId + signerName + signerRole + timestamp + content
 *                + method + imageSha256 (cuando aplica).
 * Cambiar cualquier elemento hace el hash diferente (integridad).
 */
export function computeSignatureHash(params: {
  ticketId: number;
  signerName: string;
  signerRole: SignerRole;
  signedContent: string;
  timestamp: number;
  /** Método de firma: 'drawn' | 'typed'. Opcional para compatibilidad. */
  signatureMethod?: string | null;
  /** SHA-256 de la imagen del trazo. Null para typed o legado. */
  signatureImageSha256?: string | null;
}): string {
  const canonical = [
    `ticket:${params.ticketId}`,
    `signer:${params.signerName}`,
    `role:${params.signerRole}`,
    `ts:${params.timestamp}`,
    `content:${params.signedContent}`,
    `method:${params.signatureMethod ?? ""}`,
    `imageSha256:${params.signatureImageSha256 ?? ""}`,
  ].join("\n");

  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Verifica que un hash almacenado coincide con el contenido re-calculado.
 * Útil para auditoría de integridad.
 */
export function verifySignatureHash(signature: RequestSignature): boolean {
  const expected = computeSignatureHash({
    ticketId: signature.ticketId,
    signerName: signature.signerName,
    signerRole: signature.signerRole,
    signedContent: signature.signedContent,
    timestamp: signature.signedAt,
    signatureMethod: signature.signatureMethod ?? null,
    signatureImageSha256: signature.signatureImageSha256 ?? null,
  });
  return expected === signature.signatureHash;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function listSignaturesForTicket(ticketId: number): RequestSignature[] {
  const rows = db
    .prepare(
      "SELECT * FROM request_signatures WHERE ticket_id = ? ORDER BY signed_at"
    )
    .all(ticketId) as SignatureRow[];
  return rows.map(mapSignature);
}

export function getSignature(id: number): RequestSignature | null {
  const row = db
    .prepare("SELECT * FROM request_signatures WHERE id = ?")
    .get(id) as SignatureRow | undefined;
  return row ? mapSignature(row) : null;
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export interface AddSignatureInput {
  ticketId: number;
  signerId?: number | null;
  signerName: string;
  signerRole: SignerRole;
  /** Texto completo del consentimiento/autorización firmada */
  signedContent: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Timestamp unix (segundos). Por defecto: ahora. */
  timestamp?: number;
  /** Método de firma: 'drawn' o 'typed'. */
  signatureMethod?: "drawn" | "typed" | null;
  /** Ruta privada al archivo de imagen (solo uso interno, no se expone). */
  signatureImagePath?: string | null;
  /** SHA-256 del contenido de la imagen. */
  signatureImageSha256?: string | null;
}

export type AddSignatureResult =
  | { ok: true; signature: RequestSignature }
  | { ok: false; error: string };

export function addSignature(input: AddSignatureInput): AddSignatureResult {
  const signerName = input.signerName?.trim();
  if (!signerName) {
    return { ok: false, error: "El nombre del firmante es requerido." };
  }

  const signedContent = input.signedContent?.trim();
  if (!signedContent) {
    return { ok: false, error: "El contenido firmado es requerido." };
  }

  // Verifica que el ticket exista
  const ticketExists = db
    .prepare("SELECT id FROM tickets WHERE id = ?")
    .get(input.ticketId) as { id: number } | undefined;
  if (!ticketExists) {
    return { ok: false, error: "El ticket no existe." };
  }

  const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000);
  const hash = computeSignatureHash({
    ticketId: input.ticketId,
    signerName,
    signerRole: input.signerRole,
    signedContent,
    timestamp,
    signatureMethod: input.signatureMethod ?? null,
    signatureImageSha256: input.signatureImageSha256 ?? null,
  });

  const res = db
    .prepare(
      `INSERT INTO request_signatures
         (ticket_id, signer_id, signer_name, signer_role,
          signature_hash, signed_content, ip_address, user_agent, signed_at,
          signature_method, signature_image_path, signature_image_sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.ticketId,
      input.signerId ?? null,
      signerName,
      input.signerRole,
      hash,
      signedContent,
      input.ipAddress ?? null,
      input.userAgent ?? null,
      timestamp,
      input.signatureMethod ?? null,
      input.signatureImagePath ?? null,
      input.signatureImageSha256 ?? null
    );

  const signature = getSignature(Number(res.lastInsertRowid));
  return signature
    ? { ok: true, signature }
    : { ok: false, error: "Error al registrar la firma." };
}

/**
 * Verifica la integridad de todas las firmas de un ticket.
 * Devuelve un mapa id → válido/inválido.
 */
export function auditSignatures(
  ticketId: number
): Array<{ id: number; valid: boolean }> {
  return listSignaturesForTicket(ticketId).map((sig) => ({
    id: sig.id,
    valid: verifySignatureHash(sig),
  }));
}
