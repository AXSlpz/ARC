import { unlink } from "node:fs/promises";
import db from "../db";
import { initPortalSchema } from "./init-portal";
import { listAttachments } from "./attachments";
import { getTicketType } from "./ticket-types";
import {
  ACTIVE_TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  TICKET_STATUSES,
} from "./types";
import type {
  ResolutionDecision,
  Ticket,
  TicketAwaitingKind,
  TicketComment,
  TicketDocument,
  TicketStatus,
  TicketStatusHistory,
  TicketValue,
} from "./types";
import { RESOLUTION_DECISIONS } from "./types";

initPortalSchema();

interface TicketRow {
  id: number;
  folio: string;
  ticket_type_id: number;
  portal_user_id: number;
  status: string;
  awaiting_kind?: string;
  awaiting_note?: string | null;
  origin?: string | null;
  residente_id?: number | null;
  notification_template_id?: number | null;
  created_at: number;
  updated_at: number;
  ticket_type_name?: string;
  client_name?: string;
  client_email?: string;
  client_phone?: string | null;
  request_kind?: string | null;
  modification_catalog_id?: number | null;
  property_claim_id?: number | null;
  sla_status?: string | null;
  sla_target_at?: number | null;
  resolution_decision?: string | null;
  resolution_note?: string | null;
  resolution_hash?: string | null;
  claim_development_id?: number | null;
  property_identifier?: string | null;
  development_name?: string | null;
  modification_name?: string | null;
}

function mapTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    folio: row.folio,
    ticketTypeId: row.ticket_type_id,
    ticketTypeName: row.ticket_type_name,
    portalUserId: row.portal_user_id,
    clientName: row.client_name,
    clientEmail: row.client_email,
    clientPhone: row.client_phone ?? null,
    status: (TICKET_STATUSES as string[]).includes(row.status)
      ? (row.status as TicketStatus)
      : "nuevo",
    awaitingKind: (["none", "info", "file", "answer"] as string[]).includes(
      row.awaiting_kind ?? "none"
    )
      ? ((row.awaiting_kind ?? "none") as TicketAwaitingKind)
      : "none",
    awaitingNote: row.awaiting_note ?? null,
    origin: row.origin === "admin_notice" ? "admin_notice" : "client",
    residenteId: row.residente_id ?? null,
    notificationTemplateId: row.notification_template_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    requestKind: row.request_kind ?? null,
    modificationCatalogId: row.modification_catalog_id ?? null,
    modificationName: row.modification_name ?? null,
    propertyClaimId: row.property_claim_id ?? null,
    developmentId: row.claim_development_id ?? null,
    developmentName: row.development_name ?? null,
    propertyIdentifier: row.property_identifier ?? null,
    slaStatus: row.sla_status ?? null,
    slaTargetAt: row.sla_target_at ?? null,
    resolutionDecision: (RESOLUTION_DECISIONS as string[]).includes(
      row.resolution_decision ?? ""
    )
      ? (row.resolution_decision as ResolutionDecision)
      : null,
    resolutionNote: row.resolution_note ?? null,
    resolutionHash: row.resolution_hash ?? null,
  };
}

const BASE_SELECT = `
  SELECT t.*, tt.name AS ticket_type_name,
         u.name AS client_name, u.email AS client_email, u.phone AS client_phone,
         pc.development_id AS claim_development_id,
         pc.property_identifier AS property_identifier,
         d.name AS development_name,
         mc.name AS modification_name
  FROM tickets t
  JOIN ticket_types tt ON tt.id = t.ticket_type_id
  JOIN portal_users u ON u.id = t.portal_user_id
  LEFT JOIN property_claims pc ON pc.id = t.property_claim_id
  LEFT JOIN developments d ON d.id = pc.development_id
  LEFT JOIN modification_catalog mc ON mc.id = t.modification_catalog_id
`;

function generateFolio(id: number): string {
  return `ARC-${String(id).padStart(5, "0")}`;
}

export interface CreateTicketInput {
  ticketTypeId: number;
  portalUserId: number;
  values: Array<{ fieldKey: string; value: string | null }>;
}

export type CreateTicketResult =
  | { ok: true; ticket: Ticket }
  | { ok: false; error: string };

export function createTicket(input: CreateTicketInput): CreateTicketResult {
  const type = getTicketType(input.ticketTypeId);
  if (!type || !type.active) {
    return { ok: false, error: "Tipo de solicitud no disponible." };
  }

  const provided = new Map(
    input.values.map((v) => [v.fieldKey, (v.value ?? "").toString()])
  );
  const fields = type.fields ?? [];

  for (const field of fields) {
    if (field.required) {
      const val = provided.get(field.fieldKey)?.trim();
      if (!val) {
        return { ok: false, error: `El campo "${field.label}" es obligatorio.` };
      }
    }
  }

  // Si el usuario tiene un claim pending/conflict, el ticket va a 'held'
  // hasta que el admin apruebe la cuenta. Consulta directa a la DB para
  // evitar dependencia circular con registration-admin.ts.
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

  const tx = db.transaction(() => {
    const res = db
      .prepare(
        "INSERT INTO tickets (folio, ticket_type_id, portal_user_id, status) VALUES ('', ?, ?, ?)"
      )
      .run(input.ticketTypeId, input.portalUserId, initialStatus);
    const ticketId = Number(res.lastInsertRowid);
    db.prepare("UPDATE tickets SET folio = ? WHERE id = ?").run(
      generateFolio(ticketId),
      ticketId
    );

    const insertVal = db.prepare(
      "INSERT INTO ticket_values (ticket_id, field_key, label, value) VALUES (?, ?, ?, ?)"
    );
    for (const field of fields) {
      const raw = provided.get(field.fieldKey);
      insertVal.run(
        ticketId,
        field.fieldKey,
        field.label,
        raw != null && raw !== "" ? raw : null
      );
    }

    db.prepare(
      `INSERT INTO ticket_status_history
         (ticket_id, from_status, to_status, changed_by, note)
       VALUES (?, NULL, ?, 'cliente', ?)`
    ).run(ticketId, initialStatus, historyNote);

    return ticketId;
  });

  const ticketId = tx();
  const ticket = getTicketById(ticketId);
  return ticket
    ? { ok: true, ticket }
    : { ok: false, error: "No se pudo crear la solicitud." };
}

export function listTicketsForUser(userId: number): Ticket[] {
  const rows = db
    .prepare(
      `${BASE_SELECT} WHERE t.portal_user_id = ? AND t.deleted_at IS NULL ORDER BY t.created_at DESC`
    )
    .all(userId) as TicketRow[];
  return rows.map(mapTicket);
}

export interface AdminTicketFilters {
  status?: TicketStatus;
  ticketTypeId?: number;
  search?: string;
  /** true = solo archivados (eliminados); false/undefined = solo activos. */
  archived?: boolean;
  developmentId?: number;
  /** Número de vivienda tal como lo escribió el cliente (parte final del identificador). */
  numVivienda?: string;
  modificationCatalogId?: number;
  /** Solo tickets con SLA activo ya vencido. */
  overdue?: boolean;
}

export function listTicketsAdmin(filters: AdminTicketFilters = {}): Ticket[] {
  const clauses: string[] = [
    filters.archived ? "t.deleted_at IS NOT NULL" : "t.deleted_at IS NULL",
  ];
  const params: unknown[] = [];
  if (filters.status) {
    clauses.push("t.status = ?");
    params.push(filters.status);
  }
  if (filters.ticketTypeId) {
    clauses.push("t.ticket_type_id = ?");
    params.push(filters.ticketTypeId);
  }
  if (filters.search) {
    clauses.push("(t.folio LIKE ? OR u.name LIKE ? OR u.email LIKE ?)");
    const like = `%${filters.search}%`;
    params.push(like, like, like);
  }
  if (filters.developmentId) {
    clauses.push("pc.development_id = ?");
    params.push(filters.developmentId);
  }
  if (filters.numVivienda) {
    clauses.push(
      "substr(pc.property_identifier, instr(pc.property_identifier, ':') + 1) = ?"
    );
    params.push(filters.numVivienda);
  }
  if (filters.modificationCatalogId) {
    clauses.push("t.modification_catalog_id = ?");
    params.push(filters.modificationCatalogId);
  }
  if (filters.overdue) {
    clauses.push(
      "t.sla_status = 'active' AND t.sla_target_at IS NOT NULL AND t.sla_target_at < unixepoch()"
    );
  }
  const where = `WHERE ${clauses.join(" AND ")}`;
  const orderCol = filters.archived ? "t.deleted_at" : "t.created_at";
  const rows = db
    .prepare(`${BASE_SELECT} ${where} ORDER BY ${orderCol} DESC`)
    .all(...params) as TicketRow[];
  return rows.map(mapTicket);
}

/** Soft-delete: envía el ticket al archivo. Idempotente. */
export function softDeleteTicket(id: number): boolean {
  const res = db
    .prepare(
      "UPDATE tickets SET deleted_at = unixepoch(), updated_at = unixepoch() WHERE id = ? AND deleted_at IS NULL"
    )
    .run(id);
  return res.changes > 0;
}

/** Restaura un ticket archivado. */
export function restoreTicket(id: number): boolean {
  const res = db
    .prepare(
      "UPDATE tickets SET deleted_at = NULL, updated_at = unixepoch() WHERE id = ? AND deleted_at IS NOT NULL"
    )
    .run(id);
  return res.changes > 0;
}

export type HardDeleteTicketResult =
  | { ok: true; folio: string }
  | { ok: false; status: number; error: string };

function deleteWaTicketStateRows(ticketId: number): void {
  try {
    db.prepare("DELETE FROM wa_ticket_state WHERE ticket_id = ?").run(ticketId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (!message.includes("no such table")) throw err;
  }
}

async function unlinkBestEffort(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    /* best-effort: el registro ya fue eliminado y el archivo puede no existir */
  }
}

/** Elimina definitivamente un ticket archivado y sus archivos físicos. */
export async function hardDeleteTicket(id: number): Promise<HardDeleteTicketResult> {
  const ticket = db
    .prepare("SELECT id, folio, deleted_at FROM tickets WHERE id = ?")
    .get(id) as { id: number; folio: string; deleted_at: number | null } | undefined;

  if (!ticket) {
    return { ok: false, status: 404, error: "No encontrado" };
  }
  if (ticket.deleted_at == null) {
    return {
      ok: false,
      status: 400,
      error: "Solo se pueden eliminar definitivamente tickets archivados.",
    };
  }

  const paths = db.transaction(() => {
    const documentRows = db
      .prepare("SELECT path FROM ticket_documents WHERE ticket_id = ?")
      .all(id) as Array<{ path: string | null }>;
    const attachmentRows = db
      .prepare("SELECT stored_path FROM ticket_attachments WHERE ticket_id = ?")
      .all(id) as Array<{ stored_path: string | null }>;

    db.prepare("DELETE FROM notifications_log WHERE ticket_id = ?").run(id);
    deleteWaTicketStateRows(id);
    db.prepare("DELETE FROM tickets WHERE id = ?").run(id);

    return [...documentRows.map((r) => r.path), ...attachmentRows.map((r) => r.stored_path)]
      .filter((p): p is string => Boolean(p && p.trim()));
  })();

  await Promise.all([...new Set(paths)].map(unlinkBestEffort));
  return { ok: true, folio: ticket.folio };
}

export function getTicketValues(ticketId: number): TicketValue[] {
  const rows = db
    .prepare(
      "SELECT field_key, label, value FROM ticket_values WHERE ticket_id = ? ORDER BY id"
    )
    .all(ticketId) as Array<{ field_key: string; label: string; value: string | null }>;
  return rows.map((r) => ({ fieldKey: r.field_key, label: r.label, value: r.value }));
}

export function getTicketComments(
  ticketId: number,
  opts: { includeInternal?: boolean } = {}
): TicketComment[] {
  const where = opts.includeInternal ? "" : "AND internal = 0";
  const rows = db
    .prepare(
      `SELECT * FROM ticket_comments WHERE ticket_id = ? ${where} ORDER BY created_at`
    )
    .all(ticketId) as Array<{
    id: number;
    ticket_id: number;
    author_type: string;
    author_name: string | null;
    body: string;
    internal: number;
    created_at: number;
  }>;
  const attachments = listAttachments(ticketId);
  return rows.map((r) => ({
    id: r.id,
    ticketId: r.ticket_id,
    authorType: r.author_type === "admin" ? "admin" : "client",
    authorName: r.author_name,
    body: r.body,
    internal: Boolean(r.internal),
    createdAt: r.created_at,
    attachments: attachments.filter((a) => a.commentId === r.id),
  }));
}

export function getTicketHistory(ticketId: number): TicketStatusHistory[] {
  const rows = db
    .prepare(
      "SELECT * FROM ticket_status_history WHERE ticket_id = ? ORDER BY created_at"
    )
    .all(ticketId) as Array<{
    id: number;
    ticket_id: number;
    from_status: string | null;
    to_status: string;
    changed_by: string | null;
    note: string | null;
    created_at: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    ticketId: r.ticket_id,
    fromStatus: (r.from_status as TicketStatus) ?? null,
    toStatus: r.to_status as TicketStatus,
    changedBy: r.changed_by,
    note: r.note,
    createdAt: r.created_at,
  }));
}

export function getTicketDocuments(ticketId: number): TicketDocument[] {
  const rows = db
    .prepare("SELECT * FROM ticket_documents WHERE ticket_id = ? ORDER BY created_at DESC")
    .all(ticketId) as Array<{
    id: number;
    ticket_id: number;
    kind: string;
    filename: string;
    path: string;
    created_at: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    ticketId: r.ticket_id,
    kind: r.kind,
    filename: r.filename,
    path: r.path,
    createdAt: r.created_at,
  }));
}

export function getTicketById(id: number): Ticket | null {
  const row = db.prepare(`${BASE_SELECT} WHERE t.id = ?`).get(id) as
    | TicketRow
    | undefined;
  if (!row) return null;
  const ticket = mapTicket(row);
  ticket.values = getTicketValues(id);
  ticket.history = getTicketHistory(id);
  ticket.documents = getTicketDocuments(id);
  ticket.attachments = listAttachments(id);
  return ticket;
}

export function addComment(input: {
  ticketId: number;
  authorType: "client" | "admin";
  authorName?: string | null;
  body: string;
  internal?: boolean;
}): TicketComment | null {
  const body = input.body?.trim();
  if (!body) return null;
  const res = db
    .prepare(
      "INSERT INTO ticket_comments (ticket_id, author_type, author_name, body, internal) VALUES (?, ?, ?, ?, ?)"
    )
    .run(
      input.ticketId,
      input.authorType,
      input.authorName ?? null,
      body,
      input.internal ? 1 : 0
    );
  db.prepare("UPDATE tickets SET updated_at = unixepoch() WHERE id = ?").run(
    input.ticketId
  );
  const row = db
    .prepare("SELECT * FROM ticket_comments WHERE id = ?")
    .get(res.lastInsertRowid) as {
    id: number;
    ticket_id: number;
    author_type: string;
    author_name: string | null;
    body: string;
    internal: number;
    created_at: number;
  };
  return {
    id: row.id,
    ticketId: row.ticket_id,
    authorType: row.author_type === "admin" ? "admin" : "client",
    authorName: row.author_name,
    body: row.body,
    internal: Boolean(row.internal),
    createdAt: row.created_at,
  };
}

export function changeStatus(input: {
  ticketId: number;
  toStatus: TicketStatus;
  changedBy?: string | null;
  note?: string | null;
  /** Si true (default), también deja un comentario visible en el chat del ticket. */
  asComment?: boolean;
}): Ticket | null {
  const current = db
    .prepare("SELECT status FROM tickets WHERE id = ?")
    .get(input.ticketId) as { status: string } | undefined;
  if (!current) return null;
  if (current.status === input.toStatus) return getTicketById(input.ticketId);

  const tx = db.transaction(() => {
    db.prepare("UPDATE tickets SET status = ?, updated_at = unixepoch() WHERE id = ?").run(
      input.toStatus,
      input.ticketId
    );
    db.prepare(
      "INSERT INTO ticket_status_history (ticket_id, from_status, to_status, changed_by, note) VALUES (?, ?, ?, ?, ?)"
    ).run(
      input.ticketId,
      current.status,
      input.toStatus,
      input.changedBy ?? null,
      input.note ?? null
    );
  });
  tx();

  if (input.asComment !== false) {
    const fromLabel =
      TICKET_STATUS_LABELS[current.status as TicketStatus] ?? current.status;
    const toLabel = TICKET_STATUS_LABELS[input.toStatus] ?? input.toStatus;
    const notePart = input.note?.trim() ? `\n${input.note.trim()}` : "";
    const byClient =
      (input.changedBy ?? "").toLowerCase().includes("cliente") ||
      (input.changedBy ?? "").toLowerCase().includes("whatsapp");
    addComment({
      ticketId: input.ticketId,
      authorType: byClient ? "client" : "admin",
      authorName: input.changedBy ?? (byClient ? "Cliente" : "Administración"),
      body: `Estatus: ${fromLabel} → ${toLabel}${notePart}`,
      internal: false,
    });
  }

  return getTicketById(input.ticketId);
}

/** Fija (o limpia) el estado de "espera de respuesta del cliente" en el ticket. */
export function setTicketAwaiting(
  ticketId: number,
  kind: TicketAwaitingKind,
  note: string | null = null
): Ticket | null {
  db.prepare(
    "UPDATE tickets SET awaiting_kind = ?, awaiting_note = ?, updated_at = unixepoch() WHERE id = ?"
  ).run(kind, kind === "none" ? null : note, ticketId);
  return getTicketById(ticketId);
}

/** Últimos 10 dígitos de un teléfono (normalización simple MX para matching). */
function last10(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D+/g, "");
  return digits.slice(-10);
}

/**
 * Tickets ACTIVOS de un usuario del portal, más reciente primero.
 * "Activo" = estatus en ACTIVE_TICKET_STATUSES.
 */
export function getActiveTicketsForUser(userId: number): Ticket[] {
  const placeholders = ACTIVE_TICKET_STATUSES.map(() => "?").join(",");
  const rows = db
    .prepare(
      `${BASE_SELECT} WHERE t.portal_user_id = ? AND t.status IN (${placeholders}) ORDER BY t.created_at DESC`
    )
    .all(userId, ...ACTIVE_TICKET_STATUSES) as TicketRow[];
  return rows.map(mapTicket);
}

/**
 * Tickets ACTIVOS asociados a un teléfono (comparando por últimos 10 dígitos
 * contra el teléfono del cliente del portal). Usado por el bot de WhatsApp.
 */
export function getActiveTicketsByPhone(phone: string): Ticket[] {
  const target = last10(phone);
  if (target.length < 10) return [];
  const placeholders = ACTIVE_TICKET_STATUSES.map(() => "?").join(",");
  const rows = db
    .prepare(
      `${BASE_SELECT} WHERE t.status IN (${placeholders}) ORDER BY t.created_at DESC`
    )
    .all(...ACTIVE_TICKET_STATUSES) as TicketRow[];
  return rows.map(mapTicket).filter((t) => last10(t.clientPhone) === target);
}

export function addDocument(input: {
  ticketId: number;
  kind?: string;
  filename: string;
  path: string;
}): TicketDocument {
  const res = db
    .prepare(
      "INSERT INTO ticket_documents (ticket_id, kind, filename, path) VALUES (?, ?, ?, ?)"
    )
    .run(input.ticketId, input.kind ?? "authorization_letter", input.filename, input.path);
  const row = db
    .prepare("SELECT * FROM ticket_documents WHERE id = ?")
    .get(res.lastInsertRowid) as {
    id: number;
    ticket_id: number;
    kind: string;
    filename: string;
    path: string;
    created_at: number;
  };
  return {
    id: row.id,
    ticketId: row.ticket_id,
    kind: row.kind,
    filename: row.filename,
    path: row.path,
    createdAt: row.created_at,
  };
}
