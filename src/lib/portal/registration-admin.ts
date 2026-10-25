/**
 * Servicio Fase 2 – Registration-Admin.
 *
 * Combina:
 *  1. Registro escalonado de usuarios del portal con property claim.
 *  2. Gestión admin de claims: listar, aprobar y rechazar.
 *  3. Activación de tickets "held" al aprobar un claim.
 *  4. Auditoría de acciones admin en portal_admin_log.
 *
 * Contratos:
 *  - registerWithClaim: crea portal_user + property_claim atómicamente.
 *  - approveClaim: aprueba, asocia residente_id, activa tickets held, snapshot.
 *  - rejectClaim: rechaza con razón obligatoria.
 *  - listPendingClaimsAdmin: listado para la bandeja de admin.
 */

import db from "../db-connection";
import { hashPassword } from "../password";
import { createResidente } from "../residentes";
import { isValidEmail } from "./auth";
import {
  createPropertyClaim,
  getPropertyClaim,
  reviewPropertyClaim,
} from "./property-claims";
import { buildPropertyIdentifier, parsePropertyIdentifier } from "./catalog";
import { initRegistrationAdminSchema } from "./schema-registration-admin";
import { startSla } from "./sla";
import type { PortalUser } from "./types";
import type { PropertyClaim, PropertyClaimStatus } from "./property-claims";

initRegistrationAdminSchema();

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface RegistrationDwelling {
  developmentId: number;
  condominioId: number;
  numVivienda: number;
}

export interface RegistrationInput {
  developmentId: number;
  condominioId: number;
  numVivienda: number;
  /** Viviendas extra del mismo registro. La primera puede repetirse en los campos de arriba. */
  properties?: RegistrationDwelling[];
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
}

export type RegistrationResult =
  | { ok: true; user: PortalUser; claim: PropertyClaim }
  | { ok: false; error: string };

/** Claim enriquecido con datos de usuario para la bandeja de admin. */
export interface AdminClaimEntry {
  id: number;
  status: PropertyClaimStatus;
  developmentId: number;
  developmentName: string | null;
  propertyIdentifier: string;
  condominioId: number | null;
  numVivienda: number | null;
  propertySnapshot: Record<string, unknown> | null;
  holdReason: string | null;
  reviewedBy: string | null;
  reviewedAt: number | null;
  createdAt: number;
  updatedAt: number;
  // Datos del usuario (para admin)
  portalUserId: number;
  userName: string;
  userEmail: string;
  userPhone: string | null;
}

export type ApproveResult =
  | { ok: true; claim: PropertyClaim }
  | { ok: false; error: string };

export type RejectResult =
  | { ok: true; claim: PropertyClaim }
  | { ok: false; error: string };

// ── Helpers internos ──────────────────────────────────────────────────────────

interface UserRow {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  active: number;
  created_at: number;
}

function mapUser(row: UserRow): PortalUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    active: Boolean(row.active),
    createdAt: row.created_at,
  };
}

function logAdminAction(
  entityType: string,
  entityId: number,
  action: string,
  actor: string,
  note?: string | null,
  metadata?: Record<string, unknown> | null
): void {
  db.prepare(
    `INSERT INTO portal_admin_log
       (entity_type, entity_id, action, actor, note, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    entityType,
    entityId,
    action,
    actor,
    note ?? null,
    metadata ? JSON.stringify(metadata) : null
  );
}

const MAX_PORTAL_HOMES = 10;

function normalizeDwellings(
  input: Pick<
    RegistrationInput,
    "developmentId" | "condominioId" | "numVivienda" | "properties"
  >
): { ok: true; rows: RegistrationDwelling[] } | { ok: false; error: string } {
  const rows =
    input.properties && input.properties.length > 0
      ? input.properties
      : [
          {
            developmentId: input.developmentId,
            condominioId: input.condominioId,
            numVivienda: input.numVivienda,
          },
        ];
  if (rows.length > MAX_PORTAL_HOMES) {
    return { ok: false, error: `Puedes registrar hasta ${MAX_PORTAL_HOMES} viviendas.` };
  }
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.developmentId}:${row.condominioId}:${row.numVivienda}`;
    if (seen.has(key)) {
      return { ok: false, error: "No repitas la misma vivienda." };
    }
    seen.add(key);
  }
  return { ok: true, rows };
}

function validateDwelling(dwelling: RegistrationDwelling, index: number): string | null {
  const label = index > 0 ? `Vivienda ${index + 1}: ` : "";
  if (!dwelling.developmentId || dwelling.developmentId <= 0) {
    return `${label}Selecciona un desarrollo.`;
  }
  if (!dwelling.condominioId || dwelling.condominioId <= 0) {
    return `${label}Selecciona un condominio.`;
  }
  if (!dwelling.numVivienda || dwelling.numVivienda <= 0 || dwelling.numVivienda > 999999) {
    return `${label}El número de vivienda no es válido.`;
  }

  const dev = db
    .prepare("SELECT id FROM developments WHERE id = ?")
    .get(dwelling.developmentId) as { id: number } | undefined;
  if (!dev) return `${label}El desarrollo seleccionado no existe.`;

  const condo = db
    .prepare("SELECT id FROM condominios WHERE id = ?")
    .get(dwelling.condominioId) as { id: number } | undefined;
  if (!condo) return `${label}El condominio seleccionado no existe.`;

  const assigned = db
    .prepare(
      "SELECT development_id AS developmentId FROM development_condominios WHERE condominio_id = ?"
    )
    .get(dwelling.condominioId) as { developmentId: number } | undefined;
  if (assigned && assigned.developmentId !== dwelling.developmentId) {
    return `${label}El condominio no pertenece a ese desarrollo.`;
  }
  if (!assigned) {
    db.prepare(
      "INSERT OR IGNORE INTO development_condominios (development_id, condominio_id) VALUES (?, ?)"
    ).run(dwelling.developmentId, dwelling.condominioId);
  }
  return null;
}

// ── Registro escalonado ───────────────────────────────────────────────────────

/**
 * Registra un usuario del portal y crea un property_claim para la vivienda
 * indicada. La operación es atómica: si falla la creación del claim, no se
 * crea el usuario.
 *
 * El claim queda en 'pending' (o 'conflict' si la vivienda ya tiene un
 * claim approved de otro usuario).
 */
export function registerWithClaim(input: RegistrationInput): RegistrationResult {
  const name = input.name?.trim();
  const email = input.email?.trim().toLowerCase();
  const phone = input.phone?.trim() || null;
  const password = input.password ?? "";
  const confirmPassword = input.confirmPassword ?? "";

  // ── Validaciones de UI (también validadas en servidor) ────────────────────
  if (!name || name.length < 2) {
    return { ok: false, error: "Nombre inválido (mínimo 2 caracteres)." };
  }
  if (!email || !isValidEmail(email)) {
    return { ok: false, error: "Correo electrónico inválido." };
  }
  if (password.length < 8) {
    return { ok: false, error: "La contraseña debe tener al menos 8 caracteres." };
  }
  if (password !== confirmPassword) {
    return {
      ok: false,
      error: "Las contraseñas no coinciden. Verifica e intenta de nuevo.",
    };
  }
  const dwellings = normalizeDwellings(input);
  if (!dwellings.ok) return dwellings;
  for (let i = 0; i < dwellings.rows.length; i++) {
    const checked = validateDwelling(dwellings.rows[i]!, i);
    if (checked) return { ok: false, error: checked };
  }

  // ── Email único (anti-enumeración) ────────────────────────────────────────
  // Se verifica DESPUÉS del hash (timing similar al path normal) y el mensaje
  // es genérico para no confirmar si el correo ya está registrado.
  const existing = db
    .prepare("SELECT id FROM portal_users WHERE email = ?")
    .get(email) as { id: number } | undefined;
  if (existing) {
    // Calcular el hash igual que en el path exitoso, para equiparar timing.
    hashPassword(password);
    return {
      ok: false,
      error: "No se pudo completar el registro. Verifica los datos e intenta de nuevo.",
    };
  }

  // ── Transacción atómica: user + claims ────────────────────────────────────
  const tx = db.transaction(() => {
    const userRes = db
      .prepare(
        `INSERT INTO portal_users (name, email, phone, password_hash, active)
         VALUES (?, ?, ?, ?, 1)`
      )
      .run(name, email, phone, hashPassword(password));
    const userId = Number(userRes.lastInsertRowid);
    const claimIds: number[] = [];

    for (const dwelling of dwellings.rows) {
      const claimResult = createPropertyClaim({
        developmentId: dwelling.developmentId,
        portalUserId: userId,
        propertyIdentifier: buildPropertyIdentifier(
          dwelling.condominioId,
          dwelling.numVivienda
        ),
      });
      if (!claimResult.ok) throw new Error(claimResult.error);
      claimIds.push(claimResult.claim.id);
    }

    db.prepare(
      "UPDATE portal_users SET registration_claim_id = ? WHERE id = ?"
    ).run(claimIds[0], userId);

    return { userId, claimId: claimIds[0]! };
  });

  let ids: { userId: number; claimId: number };
  try {
    ids = tx();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }

  const userRow = db
    .prepare(
      "SELECT id, name, email, phone, active, created_at FROM portal_users WHERE id = ?"
    )
    .get(ids.userId) as UserRow | undefined;
  const claim = getPropertyClaim(ids.claimId);

  if (!userRow || !claim) {
    return { ok: false, error: "Error interno al crear la cuenta." };
  }

  for (const dwelling of dwellings.rows) {
    try {
      ensurePortalResidente({
        portalUserId: ids.userId,
        name,
        email,
        phone,
        condominioId: dwelling.condominioId,
        numVivienda: dwelling.numVivienda,
      });
    } catch {
      /* La cuenta y el claim ya quedaron. El residente se reintenta al listar. */
    }
  }

  return { ok: true, user: mapUser(userRow), claim };
}

function phoneToCelular(phone: string | null | undefined): number | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  if (local.length !== 10) return null;
  const value = Number(local);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Deja al propietario del portal en Residentes, en su condominio y vivienda,
 * con la marca de pendiente para que administración lo verifique.
 * Si esa vivienda ya tiene residente, solo enlaza la cuenta.
 */
export function ensurePortalResidente(input: {
  portalUserId: number;
  name: string;
  email: string;
  phone?: string | null;
  condominioId: number;
  numVivienda: number;
}): number | null {
  const linked = db
    .prepare("SELECT residente_id AS residenteId FROM portal_users WHERE id = ?")
    .get(input.portalUserId) as { residenteId: number | null } | undefined;
  if (!linked) return null;

  const condo = db
    .prepare("SELECT id FROM condominios WHERE id = ?")
    .get(input.condominioId) as { id: number } | undefined;
  if (!condo) return null;

  const existing = db
    .prepare(
      `SELECT id FROM residentes
       WHERE condominio_id = ? AND num_vivienda = ? AND active = 1
       ORDER BY id LIMIT 1`
    )
    .get(input.condominioId, input.numVivienda) as { id: number } | undefined;

  let residenteId = existing?.id;
  if (!residenteId) {
    const created = createResidente({
      condominio_id: input.condominioId,
      nombre: input.name,
      email: input.email,
      celular: phoneToCelular(input.phone),
      num_vivienda: input.numVivienda,
    });
    residenteId = created.id;
    db.prepare(
      "UPDATE residentes SET pendiente_asignacion = 1 WHERE id = ?"
    ).run(residenteId);
  }

  db.prepare(
    "UPDATE portal_users SET residente_id = ? WHERE id = ? AND residente_id IS NULL"
  ).run(residenteId, input.portalUserId);
  return residenteId;
}

export interface PortalHome {
  id: number;
  developmentName: string;
  condominioName: string;
  numVivienda: number;
  status: PropertyClaimStatus;
  statusLabel: string;
}

const CLAIM_STATUS_LABEL: Record<PropertyClaimStatus, string> = {
  pending: "Pendiente de autorización",
  approved: "Autorizada",
  rejected: "No autorizada",
  conflict: "En revisión",
};

export function listPortalHomes(portalUserId: number): PortalHome[] {
  const rows = db
    .prepare(
      `SELECT pc.id, pc.status, pc.property_identifier AS propertyIdentifier,
              d.name AS developmentName
       FROM property_claims pc
       JOIN developments d ON d.id = pc.development_id
       WHERE pc.portal_user_id = ?
       ORDER BY pc.created_at ASC`
    )
    .all(portalUserId) as Array<{
      id: number;
      status: PropertyClaimStatus;
      propertyIdentifier: string;
      developmentName: string;
    }>;

  return rows.flatMap((row) => {
    const parsed = parsePropertyIdentifier(row.propertyIdentifier);
    if (!parsed) return [];
    const condo = db
      .prepare("SELECT name, prefijo FROM condominios WHERE id = ?")
      .get(parsed.condominioId) as { name: string; prefijo: string | null } | undefined;
    const condominioName = condo
      ? `${condo.name}${condo.prefijo ? ` (${condo.prefijo})` : ""}`
      : "Condominio";
    return [
      {
        id: row.id,
        developmentName: row.developmentName,
        condominioName,
        numVivienda: parsed.numVivienda,
        status: row.status,
        statusLabel: CLAIM_STATUS_LABEL[row.status] ?? row.status,
      },
    ];
  });
}

/** Agrega otra vivienda a una cuenta ya creada. Queda pendiente de autorización. */
export function addPortalHome(
  portalUserId: number,
  dwelling: RegistrationDwelling
): { ok: true; home: PortalHome } | { ok: false; error: string } {
  const user = db
    .prepare("SELECT id, name, email, phone FROM portal_users WHERE id = ? AND active = 1")
    .get(portalUserId) as
    | { id: number; name: string; email: string; phone: string | null }
    | undefined;
  if (!user) return { ok: false, error: "La cuenta no está activa." };

  const count = db
    .prepare("SELECT COUNT(*) AS n FROM property_claims WHERE portal_user_id = ?")
    .get(portalUserId) as { n: number };
  if (count.n >= MAX_PORTAL_HOMES) {
    return { ok: false, error: `Puedes tener hasta ${MAX_PORTAL_HOMES} viviendas.` };
  }

  const checked = validateDwelling(dwelling, 0);
  if (checked) return { ok: false, error: checked };

  const claimResult = createPropertyClaim({
    developmentId: dwelling.developmentId,
    portalUserId,
    propertyIdentifier: buildPropertyIdentifier(dwelling.condominioId, dwelling.numVivienda),
  });
  if (!claimResult.ok) return claimResult;

  try {
    ensurePortalResidente({
      portalUserId,
      name: user.name,
      email: user.email,
      phone: user.phone,
      condominioId: dwelling.condominioId,
      numVivienda: dwelling.numVivienda,
    });
  } catch {
    /* El reclamo ya quedó pendiente. */
  }

  const home = listPortalHomes(portalUserId).find((row) => row.id === claimResult.claim.id);
  if (!home) return { ok: false, error: "No se pudo guardar la vivienda." };
  return { ok: true, home };
}

/** Cuentas del portal ya creadas que aún no aparecen en Residentes. */
export function syncPendingPortalResidentes(): void {
  const rows = db
    .prepare(
      `SELECT pu.id AS portalUserId, pu.name, pu.email, pu.phone,
              pc.property_identifier AS propertyIdentifier
       FROM portal_users pu
       JOIN property_claims pc ON pc.id = (
         SELECT id FROM property_claims
         WHERE portal_user_id = pu.id AND status IN ('pending', 'conflict')
         ORDER BY created_at DESC LIMIT 1
       )
       WHERE pu.residente_id IS NULL`
    )
    .all() as Array<{
      portalUserId: number;
      name: string;
      email: string;
      phone: string | null;
      propertyIdentifier: string;
    }>;

  for (const row of rows) {
    const [condoRaw, vivRaw] = row.propertyIdentifier.split(":");
    const condominioId = Number(condoRaw);
    const numVivienda = Number(vivRaw);
    if (!Number.isInteger(condominioId) || !Number.isInteger(numVivienda)) continue;
    if (condominioId <= 0 || numVivienda <= 0) continue;
    try {
      ensurePortalResidente({
        portalUserId: row.portalUserId,
        name: row.name,
        email: row.email,
        phone: row.phone,
        condominioId,
        numVivienda,
      });
    } catch {
      /* Sigue con el siguiente. */
    }
  }
}

// ── getUserActiveClaim ────────────────────────────────────────────────────────

/**
 * Retorna el claim activo (pending o conflict) del usuario.
 * Retorna null si no hay claim activo.
 */
export function getUserActiveClaim(portalUserId: number): PropertyClaim | null {
  const row = db
    .prepare(
      `SELECT id FROM property_claims
       WHERE portal_user_id = ? AND status IN ('pending','conflict')
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(portalUserId) as { id: number } | undefined;
  return row ? getPropertyClaim(row.id) : null;
}

/**
 * Retorna true si el usuario tiene al menos un claim en estado pending o conflict.
 * Usado para decidir si los tickets nuevos van a 'held'.
 */
export function userHasPendingClaim(portalUserId: number): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM property_claims
       WHERE portal_user_id = ? AND status IN ('pending','conflict')
       LIMIT 1`
    )
    .get(portalUserId) as { 1: number } | undefined;
  return row !== undefined;
}

// ── Activación de tickets held ────────────────────────────────────────────────

/**
 * Activa todos los tickets en estado 'held' del usuario, moviéndolos a 'nuevo'.
 * Registra el cambio de estatus en ticket_status_history.
 */
export function releaseHeldTickets(portalUserId: number, approvedBy: string): number {
  const heldTickets = db
    .prepare(
      "SELECT id FROM tickets WHERE portal_user_id = ? AND status = 'held'"
    )
    .all(portalUserId) as Array<{ id: number }>;

  const now = Math.floor(Date.now() / 1000);
  const updateStatus = db.prepare(
    "UPDATE tickets SET status = 'nuevo', updated_at = ? WHERE id = ?"
  );
  const insertHistory = db.prepare(
    `INSERT INTO ticket_status_history
       (ticket_id, from_status, to_status, changed_by, note)
     VALUES (?, 'held', 'nuevo', ?, 'Cuenta verificada — solicitud activada')`
  );

  const tx = db.transaction(() => {
    for (const ticket of heldTickets) {
      updateStatus.run(now, ticket.id);
      insertHistory.run(ticket.id, approvedBy);
    }
  });
  tx();

  return heldTickets.length;
}

// ── Listado para admin ────────────────────────────────────────────────────────

interface AdminClaimRow {
  id: number;
  status: string;
  development_id: number;
  development_name: string | null;
  property_identifier: string;
  property_snapshot: string | null;
  hold_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: number | null;
  created_at: number;
  updated_at: number;
  portal_user_id: number;
  user_name: string;
  user_email: string;
  user_phone: string | null;
}

function mapAdminClaim(row: AdminClaimRow): AdminClaimEntry {
  let propertySnapshot: Record<string, unknown> | null = null;
  if (row.property_snapshot) {
    try {
      const parsed = JSON.parse(row.property_snapshot);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        propertySnapshot = parsed as Record<string, unknown>;
      }
    } catch {
      /* malformed */
    }
  }

  // Parsear condominioId y numVivienda del identifier
  const parts = row.property_identifier.split(":");
  const condominioId = parts.length === 2 ? parseInt(parts[0], 10) : null;
  const numVivienda = parts.length === 2 ? parseInt(parts[1], 10) : null;

  return {
    id: row.id,
    status: row.status as PropertyClaimStatus,
    developmentId: row.development_id,
    developmentName: row.development_name,
    propertyIdentifier: row.property_identifier,
    condominioId: condominioId && !isNaN(condominioId) ? condominioId : null,
    numVivienda: numVivienda && !isNaN(numVivienda) ? numVivienda : null,
    propertySnapshot,
    holdReason: row.hold_reason,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    portalUserId: row.portal_user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    userPhone: row.user_phone,
  };
}

/**
 * Lista claims para la bandeja de admin.
 * Por defecto muestra pending + conflict.
 * Soporta paginación via limit/offset para no devolver conjuntos sin límite.
 */
export function listPendingClaimsAdmin(
  opts: {
    status?: PropertyClaimStatus[];
    limit?: number;
    offset?: number;
  } = {}
): AdminClaimEntry[] {
  const statuses =
    opts.status && opts.status.length > 0
      ? opts.status
      : (["pending", "conflict"] as PropertyClaimStatus[]);

  const limit = Math.min(opts.limit ?? 100, 500); // máximo absoluto: 500
  const offset = opts.offset ?? 0;

  const placeholders = statuses.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT pc.*,
              d.name AS development_name,
              u.name AS user_name,
              u.email AS user_email,
              u.phone AS user_phone
       FROM property_claims pc
       JOIN developments d ON d.id = pc.development_id
       JOIN portal_users u ON u.id = pc.portal_user_id
       WHERE pc.status IN (${placeholders})
       ORDER BY pc.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...(statuses as string[]), limit, offset) as AdminClaimRow[];

  return rows.map(mapAdminClaim);
}

// ── Aprobación ────────────────────────────────────────────────────────────────

/**
 * Aprueba un claim de forma completamente ATÓMICA:
 *   1. Valida que el claim exista y sea pending/conflict.
 *   2. En UNA SOLA transacción DB:
 *      a. Actualiza claim → approved + snapshot.
 *      b. Marca otros pending/conflict del mismo inmueble → conflict.
 *      c. Asocia portal_user.residente_id (si hay residente en la vivienda).
 *      d. Libera TODOS los tickets held (→ nuevo), sin LIMIT.
 *   3. FUERA de la transacción (best-effort, sin revertir DB si falla):
 *      a. Inicia SLA para cada ticket liberado.
 *      b. Registra en portal_admin_log.
 */
export function approveClaim(
  claimId: number,
  reviewedBy: string
): ApproveResult {
  const claim = getPropertyClaim(claimId);
  if (!claim) {
    return { ok: false, error: "Reclamo no encontrado." };
  }
  if (!reviewedBy?.trim()) {
    return { ok: false, error: "El revisor es requerido." };
  }
  // Guarda de transición: solo pending/conflict pueden ser aprobados
  if (!["pending", "conflict"].includes(claim.status)) {
    return {
      ok: false,
      error: `No se puede aprobar un reclamo en estado '${claim.status}'. Solo se pueden aprobar reclamos pending o conflict.`,
    };
  }

  const fromStatus = claim.status;

  // Parsear el identifier para obtener condominio y vivienda
  const parts = claim.propertyIdentifier.split(":");
  const condominioId = parts.length === 2 ? parseInt(parts[0], 10) : null;
  const numVivienda = parts.length === 2 ? parseInt(parts[1], 10) : null;

  // Buscar residente en esa vivienda (para snapshot y asociación)
  const residente =
    condominioId && numVivienda
      ? (db
          .prepare(
            "SELECT id, nombre, num_vivienda, condominio_id FROM residentes WHERE condominio_id = ? AND num_vivienda = ? LIMIT 1"
          )
          .get(condominioId, numVivienda) as {
          id: number;
          nombre: string;
          num_vivienda: number;
          condominio_id: number;
        } | undefined)
      : undefined;

  const propertySnapshot: Record<string, unknown> = {
    condominioId,
    numVivienda,
    residenteId: residente?.id ?? null,
    approvedAt: Math.floor(Date.now() / 1000),
  };
  const snapshotJson = JSON.stringify(propertySnapshot);

  // ── Transacción atómica única ──────────────────────────────────────────────
  // Incluye: aprobación del claim, actualización de residente_id y
  // liberación de tickets held. Si cualquier paso falla, TODO hace rollback.
  let releasedTicketIds: number[] = [];

  const atomicTx = db.transaction(() => {
    // 1. Aprobar el claim (puede lanzar SQLITE_CONSTRAINT_UNIQUE si hay conflicto)
    db.prepare(
      `UPDATE property_claims
       SET status = 'approved',
           reviewed_by = ?,
           reviewed_at = unixepoch(),
           property_snapshot = ?,
           updated_at = unixepoch()
       WHERE id = ?`
    ).run(reviewedBy, snapshotJson, claimId);

    // 2. Marcar otros claims pending/conflict del mismo inmueble como conflict
    db.prepare(
      `UPDATE property_claims
       SET status = 'conflict', updated_at = unixepoch()
       WHERE development_id = ? AND property_identifier = ?
         AND id != ? AND status IN ('pending','conflict')`
    ).run(claim.developmentId, claim.propertyIdentifier, claimId);

    // 3. Asociar residente_id al portal_user (si hay residente real)
    if (residente) {
      db.prepare(
        "UPDATE portal_users SET residente_id = ? WHERE id = ? AND (residente_id IS NULL OR residente_id = ?)"
      ).run(residente.id, claim.portalUserId, residente.id);
      db.prepare(
        "UPDATE residentes SET pendiente_asignacion = 0 WHERE id = ?"
      ).run(residente.id);
    }

    // 4. Liberar TODOS los tickets held (sin LIMIT) y colectar sus IDs para SLA
    const heldTickets = db
      .prepare(
        "SELECT id FROM tickets WHERE portal_user_id = ? AND status = 'held'"
      )
      .all(claim.portalUserId) as Array<{ id: number }>;

    if (heldTickets.length > 0) {
      const now = Math.floor(Date.now() / 1000);
      const updateStatus = db.prepare(
        "UPDATE tickets SET status = 'nuevo', updated_at = ? WHERE id = ?"
      );
      const insertHistory = db.prepare(
        `INSERT INTO ticket_status_history
           (ticket_id, from_status, to_status, changed_by, note)
         VALUES (?, 'held', 'nuevo', ?, 'Cuenta verificada — solicitud activada')`
      );
      for (const ticket of heldTickets) {
        updateStatus.run(now, ticket.id);
        insertHistory.run(ticket.id, reviewedBy);
      }
      releasedTicketIds = heldTickets.map((t) => t.id);
    }
  });

  try {
    atomicTx();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE") || msg.includes("unique")) {
      return {
        ok: false,
        error: "Ya existe una aprobación activa para este inmueble (conflict).",
      };
    }
    throw err;
  }

  // ── Fuera de la transacción: best-effort SLA y auditoría ──────────────────
  // Si estas operaciones fallan, la aprobación ya quedó guardada en DB.

  for (const ticketId of releasedTicketIds) {
    try {
      startSla(ticketId, 5, { createdBy: reviewedBy });
    } catch {
      /* best-effort: error de SLA no revierte la aprobación */
    }
  }

  logAdminAction("property_claim", claimId, "approved", reviewedBy, null, {
    portalUserId: claim.portalUserId,
    fromStatus,
    residenteId: residente?.id ?? null,
    activatedTickets: releasedTicketIds.length,
  });

  const updated = getPropertyClaim(claimId);
  return updated
    ? { ok: true, claim: updated }
    : { ok: false, error: "Error al recuperar el reclamo actualizado." };
}

// ── Rechazo ───────────────────────────────────────────────────────────────────

/**
 * Rechaza un claim con razón obligatoria.
 */
export function rejectClaim(
  claimId: number,
  reviewedBy: string,
  reason: string
): RejectResult {
  const trimmedReason = reason?.trim();
  if (!trimmedReason) {
    return { ok: false, error: "La razón de rechazo es obligatoria." };
  }
  if (!reviewedBy?.trim()) {
    return { ok: false, error: "El revisor es requerido." };
  }

  const claim = getPropertyClaim(claimId);
  if (!claim) {
    return { ok: false, error: "Reclamo no encontrado." };
  }

  const reviewResult = reviewPropertyClaim(claimId, {
    status: "rejected",
    reviewedBy,
    holdReason: trimmedReason,
  });

  if (!reviewResult.ok) {
    return { ok: false, error: reviewResult.error };
  }

  // Auditoría
  logAdminAction("property_claim", claimId, "rejected", reviewedBy, trimmedReason, {
    portalUserId: claim.portalUserId,
  });

  return { ok: true, claim: reviewResult.claim };
}

syncPendingPortalResidentes();
