/**
 * Servicio: Creación atómica de ticket de modificación + firma de consentimiento.
 *
 * Garantías:
 * - ticket + firma se insertan en UNA sola transacción SQLite.
 *   Si la firma falla, el ticket NO queda sin evidencia.
 * - El texto de consentimiento es generado AQUÍ (server-side), nunca del cliente.
 * - El request_kind, modification_catalog_id y property_claim_id se persisten
 *   directamente en tickets (no solo en ticket_values).
 * - La firma replica-protection: UNIQUE (ticket_id, signer_id, signer_role).
 * - IP se acepta pre-validada desde ip-helper (null si no hay proxy confiable).
 */
import db from "../db-connection";
import { initPhase3Schema } from "./schema-phase3";
import {
  buildConsentText,
  computeSignatureHash,
  type RequestSignature,
} from "./signature-evidence";
import {
  validateSignatureInput,
  cleanupPath,
  type SignatureInput,
} from "./signature-validator";
import { getTicketById } from "./tickets";
import type { Ticket } from "./types";

initPhase3Schema();

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ModificationTicketInput {
  ticketTypeId: number;
  portalUserId: number;
  modificationCatalogId: number;
  /**
   * ID del property_claim del usuario.
   * NO puede ser null sin propertyIdentifier válido.
   */
  propertyClaimId: number | null;
  /**
   * Identificador de la vivienda, p.ej. "A-101".
   * DEBE venir del claim server-side. NUNCA debe ser auth.name.
   * Si está vacío → error.
   */
  propertyIdentifier: string;
  /** Nombre del desarrollo, p.ej. "Capital Sur". */
  developmentName: string;
  /** Nombre legible de la modificación, p.ej. "Tanque de gas". */
  modificationName: string;
  /** Valores del formulario dinámico validados previamente. */
  formValues: Array<{ fieldKey: string; value: string | null }>;
  /** Nombre del firmante (viene de auth.name, no del body). */
  signerName: string;
  /** ID del firmante (viene de auth.id). */
  signerId: number;
  /** IP pre-validada (null si no hay proxy confiable). */
  ipAddress: string | null;
  /** User-Agent del cliente. */
  userAgent: string | null;
  /**
   * Evidencia visual de la firma.
   * drawn: PNG data URL del trazo en canvas.
   * typed: nombre escrito como alternativa accesible.
   * Si no se proporciona, se rechaza la solicitud.
   */
  signature: SignatureInput;
}

export type ModificationSubmitResult =
  | { ok: true; ticket: Ticket; signature: RequestSignature }
  | { ok: false; error: string };

// ── Helper folio ───────────────────────────────────────────────────────────────

function generateFolio(id: number): string {
  return `ARC-${String(id).padStart(5, "0")}`;
}

// ── Función principal ─────────────────────────────────────────────────────────

/**
 * Crea un ticket de modificación con su firma de consentimiento en una sola
 * transacción SQLite. Si cualquier paso falla, nada se persiste.
 */
export async function createModificationTicket(
  input: ModificationTicketInput
): Promise<ModificationSubmitResult> {
  // ── Validaciones previas ──────────────────────────────────────────────────
  if (!input.signerName?.trim()) {
    return { ok: false, error: "Nombre del firmante requerido." };
  }
  if (!input.modificationName?.trim()) {
    return { ok: false, error: "Nombre de modificación requerido." };
  }
  // propertyIdentifier DEBE venir del claim, nunca de auth.name ni estar vacío.
  if (!input.propertyIdentifier?.trim()) {
    return {
      ok: false,
      error:
        "No se encontró una vivienda asociada. El usuario debe tener un claim activo (pending, conflict o approved).",
    };
  }

  // ── Verificar tipo de ticket ──────────────────────────────────────────────
  const ticketType = db
    .prepare("SELECT id, active FROM ticket_types WHERE id = ?")
    .get(input.ticketTypeId) as { id: number; active: number } | undefined;
  if (!ticketType || !ticketType.active) {
    return { ok: false, error: "Tipo de solicitud no disponible." };
  }

  // ── Determinar estado inicial según claim del usuario ─────────────────────
  const hasPendingClaim = db
    .prepare(
      `SELECT 1 FROM property_claims
       WHERE portal_user_id = ? AND status IN ('pending','conflict')
       LIMIT 1`
    )
    .get(input.portalUserId) as { 1: number } | undefined;

  const initialStatus = hasPendingClaim ? "held" : "nuevo";
  const historyNote = hasPendingClaim
    ? "Solicitud creada — retenida hasta verificación de cuenta"
    : "Solicitud creada";

  // ── Validar y guardar evidencia visual de firma (puede fallar antes de tx) ─
  const sigValidation = await validateSignatureInput(input.signature);
  if (!sigValidation.ok) {
    return { ok: false, error: `Firma inválida: ${sigValidation.error}` };
  }
  const sigImagePath = sigValidation.imagePath;
  const sigImageSha256 = sigValidation.imageSha256;

  // ── Generar texto de consentimiento canónico (server-side) ─────────────────
  const today = new Date().toISOString().split("T")[0]!;
  const signedContent = buildConsentText({
    signerName: input.signerName.trim(),
    propertyIdentifier: input.propertyIdentifier.trim(),
    modificationName: input.modificationName.trim(),
    developmentName: input.developmentName.trim() || "ARC",
    date: today,
  });

  // ── Transacción atómica ────────────────────────────────────────────────────
  let createdTicketId = 0;
  let createdSigId = 0;

  try {
    const tx = db.transaction(() => {
      // 1. Insertar ticket con TODAS las columnas de modificación
      const ticketRes = db
        .prepare(
          `INSERT INTO tickets
             (folio, ticket_type_id, portal_user_id, status,
              request_kind, modification_catalog_id, property_claim_id)
           VALUES ('', ?, ?, ?, 'modification', ?, ?)`
        )
        .run(
          input.ticketTypeId,
          input.portalUserId,
          initialStatus,
          input.modificationCatalogId,
          input.propertyClaimId ?? null
        );

      const tId = Number(ticketRes.lastInsertRowid);

      // 2. Actualizar folio con ID real
      db.prepare("UPDATE tickets SET folio = ? WHERE id = ?").run(
        generateFolio(tId),
        tId
      );

      // 3. Insertar valores del formulario
      const insertVal = db.prepare(
        "INSERT INTO ticket_values (ticket_id, field_key, label, value) VALUES (?, ?, ?, ?)"
      );
      for (const v of input.formValues) {
        insertVal.run(tId, v.fieldKey, v.fieldKey, v.value ?? null);
      }

      // 4. Historial de estado
      db.prepare(
        `INSERT INTO ticket_status_history
           (ticket_id, from_status, to_status, changed_by, note)
         VALUES (?, NULL, ?, 'cliente', ?)`
      ).run(tId, initialStatus, historyNote);

      // 5. Calcular hash con ticket ID real + method + imageSha256
      const timestamp = Math.floor(Date.now() / 1000);
      const signerName = input.signerName.trim();
      const sigMethod = sigValidation.method;
      const hash = computeSignatureHash({
        ticketId: tId,
        signerName,
        signerRole: "resident",
        signedContent,
        timestamp,
        signatureMethod: sigMethod,
        signatureImageSha256: sigImageSha256 ?? null,
      });

      // 6. Insertar firma con evidencia visual
      const sigRes = db
        .prepare(
          `INSERT INTO request_signatures
             (ticket_id, signer_id, signer_name, signer_role,
              signature_hash, signed_content, ip_address, user_agent, signed_at,
              signature_method, signature_image_path, signature_image_sha256)
           VALUES (?, ?, ?, 'resident', ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          tId,
          input.signerId,
          signerName,
          hash,
          signedContent,
          input.ipAddress ?? null,
          input.userAgent ?? null,
          timestamp,
          sigMethod,
          sigImagePath ?? null,
          sigImageSha256 ?? null
        );

      createdTicketId = tId;
      createdSigId = Number(sigRes.lastInsertRowid);
    });

    tx();
  } catch (err) {
    // ── CLEANUP: borrar imagen si la tx falló ──────────────────────────────
    // No esperamos el resultado (best-effort en finally no disponible en sync)
    void cleanupPath(sigImagePath);

    const msg = err instanceof Error ? err.message : String(err);
    // Unique constraint → el usuario ya firmó este ticket
    if (/UNIQUE|constraint/i.test(msg)) {
      return { ok: false, error: "Ya existe una firma para esta solicitud." };
    }
    return { ok: false, error: `Error al crear solicitud: ${msg}` };
  }

  // ── Recuperar objetos creados ─────────────────────────────────────────────
  const ticket = getTicketById(createdTicketId);
  if (!ticket) {
    return { ok: false, error: "Solicitud creada pero no recuperable." };
  }

  const sigRow = db
    .prepare("SELECT * FROM request_signatures WHERE id = ?")
    .get(createdSigId) as SignatureRow | undefined;

  if (!sigRow) {
    return { ok: false, error: "Firma registrada pero no recuperable." };
  }

  return {
    ok: true,
    ticket,
    signature: mapSignatureRow(sigRow),
  };
}

// ── Mapeo interno ─────────────────────────────────────────────────────────────

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
  signature_image_path: string | null;
  signature_image_sha256: string | null;
}

function mapSignatureRow(row: SignatureRow): RequestSignature {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    signerId: row.signer_id,
    signerName: row.signer_name,
    signerRole: (["resident", "committee", "admin"] as const).includes(
      row.signer_role as "resident" | "committee" | "admin"
    )
      ? (row.signer_role as "resident" | "committee" | "admin")
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
    // imagePath NUNCA se expone; solo imageSha256
    signatureImageSha256: row.signature_image_sha256 ?? null,
  };
}
