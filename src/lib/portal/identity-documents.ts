/**
 * Servicio: Documentos de identidad del portal (INE/pasaporte + historial).
 *
 * Garantías:
 * - Solo UN documento is_current=1 por (usuario, kind) — enforced por partial unique index.
 * - El alta es transaccional: marca el anterior como not-current ANTES de insertar
 *   el nuevo. Si falla, no hay estado parcial.
 * - El historial completo se conserva (soft-history, no DELETE).
 */
import db from "../db-connection";
import { initPhase3Schema } from "./schema-phase3";

initPhase3Schema();

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type IdentityDocumentKind = "ine" | "passport" | "other";
export type OcrStatus = "pending" | "processing" | "done" | "failed";

export interface IdentityDocument {
  id: number;
  portalUserId: number;
  kind: IdentityDocumentKind;
  isCurrent: boolean;
  storedPath: string;
  backStoredPath: string | null;
  ocrMetadata: Record<string, unknown> | null;
  ocrStatus: OcrStatus;
  createdAt: number;
}

interface DocRow {
  id: number;
  portal_user_id: number;
  kind: string;
  is_current: number;
  stored_path: string;
  back_stored_path: string | null;
  ocr_metadata: string | null;
  ocr_status: string;
  created_at: number;
}

const KIND_VALUES: IdentityDocumentKind[] = ["ine", "passport", "other"];
const OCR_STATUS_VALUES: OcrStatus[] = ["pending", "processing", "done", "failed"];

function mapDoc(row: DocRow): IdentityDocument {
  let ocrMetadata: Record<string, unknown> | null = null;
  if (row.ocr_metadata) {
    try {
      const parsed = JSON.parse(row.ocr_metadata);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        ocrMetadata = parsed as Record<string, unknown>;
      }
    } catch {
      // JSON malformado → ignorar
    }
  }
  return {
    id: row.id,
    portalUserId: row.portal_user_id,
    kind: KIND_VALUES.includes(row.kind as IdentityDocumentKind)
      ? (row.kind as IdentityDocumentKind)
      : "other",
    isCurrent: Boolean(row.is_current),
    storedPath: row.stored_path,
    backStoredPath: row.back_stored_path,
    ocrMetadata,
    ocrStatus: OCR_STATUS_VALUES.includes(row.ocr_status as OcrStatus)
      ? (row.ocr_status as OcrStatus)
      : "pending",
    createdAt: row.created_at,
  };
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function getIdentityDocument(id: number): IdentityDocument | null {
  const row = db
    .prepare("SELECT * FROM portal_identity_documents WHERE id = ?")
    .get(id) as DocRow | undefined;
  return row ? mapDoc(row) : null;
}

/**
 * Devuelve el documento current (is_current=1) para un usuario y tipo.
 */
export function getCurrentIdentityDocument(
  portalUserId: number,
  kind: IdentityDocumentKind = "ine"
): IdentityDocument | null {
  const row = db
    .prepare(
      "SELECT * FROM portal_identity_documents WHERE portal_user_id = ? AND kind = ? AND is_current = 1"
    )
    .get(portalUserId, kind) as DocRow | undefined;
  return row ? mapDoc(row) : null;
}

/**
 * Historial completo de documentos de identidad de un usuario, más reciente primero.
 */
export function getIdentityDocumentHistory(portalUserId: number): IdentityDocument[] {
  const rows = db
    .prepare(
      "SELECT * FROM portal_identity_documents WHERE portal_user_id = ? ORDER BY created_at DESC"
    )
    .all(portalUserId) as DocRow[];
  return rows.map(mapDoc);
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export interface AddIdentityDocumentInput {
  portalUserId: number;
  kind?: IdentityDocumentKind;
  storedPath: string;
  backStoredPath?: string | null;
  ocrMetadata?: Record<string, unknown> | null;
  ocrStatus?: OcrStatus;
}

export type AddIdentityDocumentResult =
  | { ok: true; doc: IdentityDocument }
  | { ok: false; error: string };

/**
 * Agrega un nuevo documento de identidad.
 *
 * Transacción:
 *   1. Marca el documento anterior (is_current=1 del mismo kind) como is_current=0.
 *   2. Inserta el nuevo documento con is_current=1.
 *
 * Si algún paso falla (incluida la violación del partial unique index),
 * la transacción revierte y no queda estado parcial.
 */
export function addIdentityDocument(
  input: AddIdentityDocumentInput
): AddIdentityDocumentResult {
  const storedPath = input.storedPath?.trim();
  if (!storedPath) {
    return { ok: false, error: "stored_path es requerido." };
  }

  const kind: IdentityDocumentKind = input.kind ?? "ine";
  if (!KIND_VALUES.includes(kind)) {
    return { ok: false, error: `kind inválido: ${kind}.` };
  }

  const ocrStatus: OcrStatus = input.ocrStatus ?? "pending";
  const ocrMetadataJson = input.ocrMetadata
    ? JSON.stringify(input.ocrMetadata)
    : null;

  let insertedId = 0;

  const tx = db.transaction(() => {
    // 1. Marcar documento actual como historial
    db.prepare(
      "UPDATE portal_identity_documents SET is_current = 0 WHERE portal_user_id = ? AND kind = ? AND is_current = 1"
    ).run(input.portalUserId, kind);

    // 2. Insertar nuevo documento como current
    const res = db
      .prepare(
        `INSERT INTO portal_identity_documents
           (portal_user_id, kind, is_current, stored_path, back_stored_path, ocr_metadata, ocr_status)
         VALUES (?, ?, 1, ?, ?, ?, ?)`
      )
      .run(
        input.portalUserId,
        kind,
        storedPath,
        input.backStoredPath ?? null,
        ocrMetadataJson,
        ocrStatus
      );
    insertedId = Number(res.lastInsertRowid);
  });

  try {
    tx();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // El partial unique index disparará SQLITE_CONSTRAINT_UNIQUE si la transacción
    // no logra marcar el anterior como not-current (ej. concurrencia extrema).
    if (msg.includes("UNIQUE") || msg.includes("unique")) {
      return {
        ok: false,
        error: "Conflicto al actualizar el documento de identidad actual. Reintenta.",
      };
    }
    throw err;
  }

  const doc = getIdentityDocument(insertedId);
  return doc
    ? { ok: true, doc }
    : { ok: false, error: "Error al recuperar el documento insertado." };
}

/**
 * Actualiza el estado OCR y metadatos de un documento.
 * No cambia is_current ni otros campos.
 */
export function updateOcrStatus(
  docId: number,
  status: OcrStatus,
  metadata?: Record<string, unknown> | null
): IdentityDocument | null {
  const metaJson = metadata !== undefined ? JSON.stringify(metadata) : undefined;

  if (metaJson !== undefined) {
    db.prepare(
      "UPDATE portal_identity_documents SET ocr_status = ?, ocr_metadata = ? WHERE id = ?"
    ).run(status, metaJson, docId);
  } else {
    db.prepare(
      "UPDATE portal_identity_documents SET ocr_status = ? WHERE id = ?"
    ).run(status, docId);
  }

  return getIdentityDocument(docId);
}

/** Actualiza los datos de la INE vigente sin cambiar las fotos. */
export function updateCurrentIneMetadata(
  portalUserId: number,
  metadata: Record<string, unknown>
): boolean {
  const res = db
    .prepare(
      `UPDATE portal_identity_documents
       SET ocr_metadata = ?, ocr_status = 'done'
       WHERE portal_user_id = ? AND kind = 'ine' AND is_current = 1`
    )
    .run(JSON.stringify(metadata), portalUserId);
  return res.changes > 0;
}
