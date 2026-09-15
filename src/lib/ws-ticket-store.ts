import db from "./db-connection";

interface TicketRow {
  token: string;
  expires_at: number;
}

let initialized = false;

function ensureTable(): void {
  if (initialized) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS ws_tickets (
      token TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ws_tickets_expires ON ws_tickets(expires_at);
  `);
  initialized = true;
}

function purgeExpired(): void {
  ensureTable();
  db.prepare("DELETE FROM ws_tickets WHERE expires_at < ?").run(Date.now());
}

export function issueWsTicket(token: string, expiresAt: number): void {
  ensureTable();
  purgeExpired();
  db.prepare(
    "INSERT OR REPLACE INTO ws_tickets (token, expires_at) VALUES (?, ?)"
  ).run(token, expiresAt);
}

export function consumeWsTicket(token: string): boolean {
  ensureTable();
  purgeExpired();
  if (!token || token.length < 32) return false;

  const row = db
    .prepare("SELECT token, expires_at FROM ws_tickets WHERE token = ?")
    .get(token) as TicketRow | undefined;

  if (!row || row.expires_at < Date.now()) {
    if (row) {
      db.prepare("DELETE FROM ws_tickets WHERE token = ?").run(token);
    }
    return false;
  }

  db.prepare("DELETE FROM ws_tickets WHERE token = ?").run(token);
  return true;
}
