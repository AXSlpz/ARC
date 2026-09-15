import db from "../db-connection";
import type { IncomingTextEvent } from "./types";

function ensureMetaInboundTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta_inbound_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      line_id INTEGER NOT NULL,
      chat_key TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      push_name TEXT,
      text TEXT NOT NULL,
      external_message_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_meta_inbound_created
      ON meta_inbound_queue(created_at);
  `);
}

ensureMetaInboundTable();

export function enqueueMetaInbound(event: IncomingTextEvent): void {
  db.prepare(
    `INSERT INTO meta_inbound_queue
      (line_id, chat_key, contact_phone, push_name, text, external_message_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    event.lineId,
    event.chatKey,
    event.contactPhone,
    event.pushName,
    event.text,
    event.externalMessageId ?? null
  );
}

export function listMetaInboundBatch(limit = 20): Array<
  IncomingTextEvent & { queueId: number }
> {
  const rows = db
    .prepare(
      `SELECT id, line_id, chat_key, contact_phone, push_name, text, external_message_id
       FROM meta_inbound_queue
       ORDER BY id ASC
       LIMIT ?`
    )
    .all(limit) as Array<{
    id: number;
    line_id: number;
    chat_key: string;
    contact_phone: string;
    push_name: string | null;
    text: string;
    external_message_id: string | null;
  }>;

  return rows.map((r) => ({
    queueId: r.id,
    lineId: r.line_id,
    chatKey: r.chat_key,
    contactPhone: r.contact_phone,
    pushName: r.push_name,
    text: r.text,
    externalMessageId: r.external_message_id ?? undefined,
  }));
}

export function deleteMetaInbound(queueId: number): void {
  db.prepare("DELETE FROM meta_inbound_queue WHERE id = ?").run(queueId);
}
