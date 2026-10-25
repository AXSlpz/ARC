/**
 * Servicio: Reclamos de propiedad (property_claims).
 *
 * Un usuario del portal puede reclamar una vivienda dentro de un desarrollo.
 * Un admin revisa y aprueba / rechaza / marca como conflicto.
 *
 * Estados: pending → approved | rejected | conflict
 */
import db from "../db-connection";
import { initPhase3Schema } from "./schema-phase3";

initPhase3Schema();

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type PropertyClaimStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "conflict";

export const PROPERTY_CLAIM_STATUSES: PropertyClaimStatus[] = [
  "pending",
  "approved",
  "rejected",
  "conflict",
];

export interface PropertyClaim {
  id: number;
  developmentId: number;
  portalUserId: number;
  propertyIdentifier: string;
  status: PropertyClaimStatus;
  propertySnapshot: Record<string, unknown> | null;
  holdReason: string | null;
  reviewedBy: string | null;
  reviewedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

interface ClaimRow {
  id: number;
  development_id: number;
  portal_user_id: number;
  property_identifier: string;
  status: string;
  property_snapshot: string | null;
  hold_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: number | null;
  created_at: number;
  updated_at: number;
}

function mapClaim(row: ClaimRow): PropertyClaim {
  let propertySnapshot: Record<string, unknown> | null = null;
  if (row.property_snapshot) {
    try {
      const parsed = JSON.parse(row.property_snapshot);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        propertySnapshot = parsed as Record<string, unknown>;
      }
    } catch {
      // malformed JSON
    }
  }

  return {
    id: row.id,
    developmentId: row.development_id,
    portalUserId: row.portal_user_id,
    propertyIdentifier: row.property_identifier,
    status: (PROPERTY_CLAIM_STATUSES as string[]).includes(row.status)
      ? (row.status as PropertyClaimStatus)
      : "pending",
    propertySnapshot,
    holdReason: row.hold_reason,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function getPropertyClaim(id: number): PropertyClaim | null {
  const row = db
    .prepare("SELECT * FROM property_claims WHERE id = ?")
    .get(id) as ClaimRow | undefined;
  return row ? mapClaim(row) : null;
}

export function listClaimsForUser(portalUserId: number): PropertyClaim[] {
  const rows = db
    .prepare(
      "SELECT * FROM property_claims WHERE portal_user_id = ? ORDER BY created_at DESC"
    )
    .all(portalUserId) as ClaimRow[];
  return rows.map(mapClaim);
}

export function listClaimsForDevelopment(
  developmentId: number,
  opts: { status?: PropertyClaimStatus } = {}
): PropertyClaim[] {
  const where = opts.status ? "AND status = ?" : "";
  const params: unknown[] = [developmentId];
  if (opts.status) params.push(opts.status);
  const rows = db
    .prepare(
      `SELECT * FROM property_claims WHERE development_id = ? ${where} ORDER BY created_at DESC`
    )
    .all(...params) as ClaimRow[];
  return rows.map(mapClaim);
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export interface CreateClaimInput {
  developmentId: number;
  portalUserId: number;
  propertyIdentifier: string;
}

export type CreateClaimResult =
  | { ok: true; claim: PropertyClaim }
  | { ok: false; error: string };

export function createPropertyClaim(input: CreateClaimInput): CreateClaimResult {
  const identifier = input.propertyIdentifier?.trim();
  if (!identifier) {
    return { ok: false, error: "El identificador de propiedad es requerido." };
  }

  // Verifica que el desarrollo exista
  const dev = db
    .prepare("SELECT id FROM developments WHERE id = ?")
    .get(input.developmentId) as { id: number } | undefined;
  if (!dev) {
    return { ok: false, error: "El desarrollo no existe." };
  }

  // Solo un claim por (dev, property, user) — puede haber conflict si otro ya la reclamó
  const existing = db
    .prepare(
      `SELECT id, status FROM property_claims
       WHERE development_id = ? AND property_identifier = ? AND portal_user_id = ?`
    )
    .get(input.developmentId, identifier, input.portalUserId) as
    | { id: number; status: string }
    | undefined;

  if (existing) {
    if (existing.status === "rejected") {
      // Permite re-solicitar si fue rechazado
      db.prepare(
        "UPDATE property_claims SET status = 'pending', hold_reason = NULL, reviewed_by = NULL, reviewed_at = NULL, updated_at = unixepoch() WHERE id = ?"
      ).run(existing.id);
      const claim = getPropertyClaim(existing.id);
      return claim ? { ok: true, claim } : { ok: false, error: "Error al actualizar." };
    }
    return {
      ok: false,
      error: "Ya tienes un reclamo activo para esta propiedad.",
    };
  }

  // Detectar conflicto: ¿otro usuario ya tiene la propiedad aprobada?
  const conflictApproved = db
    .prepare(
      `SELECT id FROM property_claims
       WHERE development_id = ? AND property_identifier = ? AND status = 'approved'`
    )
    .get(input.developmentId, identifier) as { id: number } | undefined;

  const initialStatus: PropertyClaimStatus = conflictApproved ? "conflict" : "pending";

  const res = db
    .prepare(
      `INSERT INTO property_claims
         (development_id, portal_user_id, property_identifier, status)
       VALUES (?, ?, ?, ?)`
    )
    .run(input.developmentId, input.portalUserId, identifier, initialStatus);

  const claim = getPropertyClaim(Number(res.lastInsertRowid));
  return claim ? { ok: true, claim } : { ok: false, error: "Error al crear el reclamo." };
}

export interface ReviewClaimInput {
  status: "approved" | "rejected" | "conflict";
  reviewedBy: string;
  holdReason?: string | null;
  propertySnapshot?: Record<string, unknown> | null;
}

export type ReviewClaimResult =
  | { ok: true; claim: PropertyClaim }
  | { ok: false; error: string };

/**
 * Revisa (aprueba / rechaza / marca conflicto) un reclamo de propiedad.
 *
 * La aprobación es atómica:
 *   1. Actualiza el claim a 'approved' — esto puede violar el partial unique
 *      index idx_property_claims_one_approved si ya existe otro aprobado.
 *   2. Si la inserción pasa, marca otros claims pendientes del mismo inmueble
 *      como 'conflict'.
 *
 * Si la DB lanza SQLITE_CONSTRAINT_UNIQUE, devuelve error en lugar de lanzar.
 * No queda estado parcial gracias a la transacción.
 */
export function reviewPropertyClaim(
  claimId: number,
  input: ReviewClaimInput
): ReviewClaimResult {
  const claim = getPropertyClaim(claimId);
  if (!claim) return { ok: false, error: "Reclamo no encontrado." };
  if (claim.status === input.status) {
    return { ok: true, claim }; // idempotente
  }

  // Guarda de transiciones: 'approved' solo puede venir de pending/conflict.
  // Un claim 'rejected' no puede ser aprobado directamente.
  if (input.status === "approved" && !["pending", "conflict"].includes(claim.status)) {
    return {
      ok: false,
      error: `No se puede aprobar un reclamo en estado '${claim.status}'. Solo se pueden aprobar reclamos en estado pending o conflict.`,
    };
  }

  const snapshotJson = input.propertySnapshot
    ? JSON.stringify(input.propertySnapshot)
    : null;

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE property_claims
       SET status = ?, reviewed_by = ?, reviewed_at = unixepoch(),
           hold_reason = ?, property_snapshot = ?, updated_at = unixepoch()
       WHERE id = ?`
    ).run(
      input.status,
      input.reviewedBy,
      input.holdReason ?? null,
      snapshotJson,
      claimId
    );

    // Si se aprueba, marcar otros pending del mismo inmueble como conflict.
    // El partial unique index evita que haya dos 'approved' simultáneos.
    if (input.status === "approved") {
      db.prepare(
        `UPDATE property_claims
         SET status = 'conflict', updated_at = unixepoch()
         WHERE development_id = ? AND property_identifier = ?
           AND id != ? AND status IN ('pending','conflict')`
      ).run(claim.developmentId, claim.propertyIdentifier, claimId);
    }
  });

  try {
    tx();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // El partial unique index dispara SQLITE_CONSTRAINT_UNIQUE cuando ya existe
    // otro claim aprobado para el mismo (development_id, property_identifier).
    if (msg.includes("UNIQUE") || msg.includes("unique")) {
      return {
        ok: false,
        error:
          "Ya existe una aprobación activa para este inmueble en este desarrollo (conflict).",
      };
    }
    throw err;
  }

  const updated = getPropertyClaim(claimId);
  return updated ? { ok: true, claim: updated } : { ok: false, error: "Error al revisar." };
}
