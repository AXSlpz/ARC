/**
 * Servicio: Borradores de solicitudes de modificación (server-side drafts).
 *
 * Garantías:
 * - Ownership estricto: cada operación verifica que el draft pertenezca al usuario.
 * - No se guardan documentos de identidad ni firmas en el draft.
 * - Auto-migración de la tabla modification_drafts (idempotente).
 */
import db from "../db-connection";
import { initPhase3Schema } from "./schema-phase3";

// initPhase3Schema() ya crea modification_drafts vía runMigration idempotente.
initPhase3Schema();

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ModificationDraft {
  id: number;
  portalUserId: number;
  modificationCatalogId: number | null;
  step: number;
  data: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

interface DraftRow {
  id: number;
  portal_user_id: number;
  modification_catalog_id: number | null;
  step: number;
  data: string;
  created_at: number;
  updated_at: number;
}

function mapDraft(row: DraftRow): ModificationDraft {
  let data: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.data);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    // JSON malformado → dejar vacío
  }
  return {
    id: row.id,
    portalUserId: row.portal_user_id,
    modificationCatalogId: row.modification_catalog_id,
    step: row.step,
    data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Obtiene un draft por ID verificando ownership.
 * Retorna null si no existe o si el usuario no es el dueño.
 */
export function getDraft(
  id: number,
  portalUserId: number
): ModificationDraft | null {
  const row = db
    .prepare(
      "SELECT * FROM modification_drafts WHERE id = ? AND portal_user_id = ?"
    )
    .get(id, portalUserId) as DraftRow | undefined;
  return row ? mapDraft(row) : null;
}

/** Lista todos los drafts de un usuario, ordenados por más reciente. */
export function listDraftsForUser(portalUserId: number): ModificationDraft[] {
  const rows = db
    .prepare(
      "SELECT * FROM modification_drafts WHERE portal_user_id = ? ORDER BY updated_at DESC"
    )
    .all(portalUserId) as DraftRow[];
  return rows.map(mapDraft);
}

// ── Constantes ────────────────────────────────────────────────────────────────

/** Máximo de drafts simultáneos por usuario. Previene abuso de almacenamiento. */
export const MAX_DRAFTS_PER_USER =
  Number(process.env.MAX_DRAFTS_PER_USER ?? 5);

/** Tamaño máximo del payload JSON del draft (bytes). */
const MAX_DRAFT_DATA_BYTES = 64 * 1024; // 64 KB

// ── Mutations ─────────────────────────────────────────────────────────────────

export interface CreateDraftInput {
  portalUserId: number;
  modificationCatalogId?: number | null;
  step?: number;
  data?: Record<string, unknown>;
}

export type DraftResult =
  | { ok: true; draft: ModificationDraft }
  | { ok: false; error: string };

/** Crea un nuevo draft para un usuario (máx MAX_DRAFTS_PER_USER). */
export function createDraft(input: CreateDraftInput): DraftResult {
  if (!input.portalUserId || input.portalUserId <= 0) {
    return { ok: false, error: "portalUserId inválido." };
  }

  // Verificar que el usuario existe
  const user = db
    .prepare("SELECT id FROM portal_users WHERE id = ?")
    .get(input.portalUserId) as { id: number } | undefined;
  if (!user) {
    return { ok: false, error: "Usuario no encontrado." };
  }

  // Límite de drafts por usuario
  const draftCount = (
    db
      .prepare("SELECT COUNT(*) AS cnt FROM modification_drafts WHERE portal_user_id = ?")
      .get(input.portalUserId) as { cnt: number }
  ).cnt;

  if (draftCount >= MAX_DRAFTS_PER_USER) {
    return {
      ok: false,
      error: `Se alcanzó el límite de ${MAX_DRAFTS_PER_USER} borradores por usuario. Elimina uno antes de crear otro.`,
    };
  }

  const dataJson = JSON.stringify(input.data ?? {});

  // Límite de tamaño del payload
  if (Buffer.byteLength(dataJson, "utf8") > MAX_DRAFT_DATA_BYTES) {
    return {
      ok: false,
      error: `El borrador excede el tamaño máximo permitido (${MAX_DRAFT_DATA_BYTES / 1024} KB).`,
    };
  }

  const step = input.step ?? 0;

  const res = db
    .prepare(
      `INSERT INTO modification_drafts
         (portal_user_id, modification_catalog_id, step, data)
       VALUES (?, ?, ?, ?)`
    )
    .run(
      input.portalUserId,
      input.modificationCatalogId ?? null,
      step,
      dataJson
    );

  const draft = getDraft(Number(res.lastInsertRowid), input.portalUserId);
  return draft ? { ok: true, draft } : { ok: false, error: "Error al crear draft." };
}

export interface UpdateDraftInput {
  id: number;
  portalUserId: number;
  modificationCatalogId?: number | null;
  step?: number;
  data?: Record<string, unknown>;
}

/** Actualiza un draft verificando ownership. */
export function updateDraft(input: UpdateDraftInput): DraftResult {
  // Verificar ownership primero
  const existing = getDraft(input.id, input.portalUserId);
  if (!existing) {
    return { ok: false, error: "Draft no encontrado o acceso denegado." };
  }

  const newData = input.data !== undefined ? input.data : existing.data;
  const newStep = input.step !== undefined ? input.step : existing.step;
  const newModId =
    input.modificationCatalogId !== undefined
      ? input.modificationCatalogId
      : existing.modificationCatalogId;

  db.prepare(
    `UPDATE modification_drafts
     SET step = ?, modification_catalog_id = ?, data = ?, updated_at = unixepoch()
     WHERE id = ? AND portal_user_id = ?`
  ).run(newStep, newModId ?? null, JSON.stringify(newData), input.id, input.portalUserId);

  const updated = getDraft(input.id, input.portalUserId);
  return updated
    ? { ok: true, draft: updated }
    : { ok: false, error: "Error al actualizar draft." };
}

/**
 * Elimina un draft verificando ownership.
 * Retorna true si se eliminó, false si no existía o no es del usuario.
 */
export function deleteDraft(id: number, portalUserId: number): boolean {
  // Verificar ownership antes de borrar
  const existing = getDraft(id, portalUserId);
  if (!existing) return false;

  const res = db
    .prepare(
      "DELETE FROM modification_drafts WHERE id = ? AND portal_user_id = ?"
    )
    .run(id, portalUserId);
  return res.changes > 0;
}

/**
 * Elimina todos los drafts de un usuario (limpieza opcional).
 */
export function clearDraftsForUser(portalUserId: number): number {
  const res = db
    .prepare("DELETE FROM modification_drafts WHERE portal_user_id = ?")
    .run(portalUserId);
  return res.changes;
}
