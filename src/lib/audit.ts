import db from "./db";
import type { Conversation } from "./db";
import { getWaLine } from "./db";
import {
  buildAuditSummary,
  parseAuditDetails,
} from "./audit-helpers";

export interface AuditEntry {
  id: number;
  userId: number | null;
  username: string;
  action: string;
  entityType: string | null;
  entityId: number | null;
  details: Record<string, unknown> | null;
  summary: string;
  createdAt: number;
}

export function conversationAuditDetails(
  convo: Conversation,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  const line = getWaLine(convo.line_id);
  return {
    conversationId: convo.id,
    phone: convo.phone,
    contactName: convo.name,
    lineId: convo.line_id,
    lineName: line?.name ?? `Línea ${convo.line_id}`,
    mode: convo.mode,
    category: convo.category,
    priority: convo.priority,
    ...extra,
  };
}

export function logAudit(
  userId: number | null,
  username: string,
  action: string,
  entityType?: string,
  entityId?: number | null,
  details?: Record<string, unknown>
): void {
  db.prepare(
    `INSERT INTO audit_log (user_id, username, action, entity_type, entity_id, details)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    userId,
    username,
    action,
    entityType ?? null,
    entityId ?? null,
    details ? JSON.stringify(details) : null
  );
}

export function listAuditLog(limit = 100): AuditEntry[] {
  return (
    db
      .prepare(
        `SELECT id, user_id, username, action, entity_type, entity_id, details, created_at
         FROM audit_log ORDER BY created_at DESC LIMIT ?`
      )
      .all(limit) as {
      id: number;
      user_id: number | null;
      username: string;
      action: string;
      entity_type: string | null;
      entity_id: number | null;
      details: string | null;
      created_at: number;
    }[]
  ).map((row) => {
    const details = parseAuditDetails(row.details);
    return {
      id: row.id,
      userId: row.user_id,
      username: row.username,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      details,
      summary: buildAuditSummary(row.action, details),
      createdAt: row.created_at,
    };
  });
}
