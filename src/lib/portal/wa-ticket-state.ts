import db from "../db";

/**
 * Estado transitorio de la conversación de WhatsApp respecto a un ticket.
 * Aislado en su propia tabla para NO tocar el esquema de `conversations`.
 *
 * mode:
 *  - "confirm"      → el bot preguntó "¿tu mensaje es sobre tu solicitud X?"
 *  - "choose_folio" → hay varios tickets activos; se espera que el cliente indique el folio
 *  - "menu"         → menú guiado (1 cancelar / 2 confirmar / texto = comentario)
 */
export type WaTicketMode = "confirm" | "choose_folio" | "menu";

export interface WaTicketState {
  conversationId: number;
  mode: WaTicketMode;
  ticketId: number | null;
  updatedAt: number;
}

let initialized = false;
function ensureTable(): void {
  if (initialized) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS wa_ticket_state (
      conversation_id INTEGER PRIMARY KEY,
      mode TEXT NOT NULL,
      ticket_id INTEGER,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
  initialized = true;
}

/** TTL del estado (evita quedar atascado si el cliente no responde). */
const STATE_TTL_SEC = 60 * 60; // 1 hora

export function getWaTicketState(conversationId: number): WaTicketState | null {
  ensureTable();
  const row = db
    .prepare(
      "SELECT conversation_id, mode, ticket_id, updated_at FROM wa_ticket_state WHERE conversation_id = ?"
    )
    .get(conversationId) as
    | { conversation_id: number; mode: string; ticket_id: number | null; updated_at: number }
    | undefined;
  if (!row) return null;
  if (row.updated_at < Math.floor(Date.now() / 1000) - STATE_TTL_SEC) {
    clearWaTicketState(conversationId);
    return null;
  }
  return {
    conversationId: row.conversation_id,
    mode: row.mode as WaTicketMode,
    ticketId: row.ticket_id,
    updatedAt: row.updated_at,
  };
}

export function setWaTicketState(
  conversationId: number,
  mode: WaTicketMode,
  ticketId: number | null
): void {
  ensureTable();
  db.prepare(
    `INSERT INTO wa_ticket_state (conversation_id, mode, ticket_id, updated_at)
     VALUES (?, ?, ?, unixepoch())
     ON CONFLICT(conversation_id) DO UPDATE SET
       mode = excluded.mode, ticket_id = excluded.ticket_id, updated_at = unixepoch()`
  ).run(conversationId, mode, ticketId);
}

export function clearWaTicketState(conversationId: number): void {
  ensureTable();
  db.prepare("DELETE FROM wa_ticket_state WHERE conversation_id = ?").run(
    conversationId
  );
}
