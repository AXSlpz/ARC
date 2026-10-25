import db from "./db-connection";

interface TicketRow {
  token: string;
  expires_at: number;
  portal_user_id: number | null;
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
  const cols = db.prepare("PRAGMA table_info(ws_tickets)").all() as { name: string }[];
  if (!cols.some((col) => col.name === "portal_user_id")) {
    db.exec("ALTER TABLE ws_tickets ADD COLUMN portal_user_id INTEGER");
  }
  initialized = true;
}

function purgeExpired(): void {
  ensureTable();
  db.prepare("DELETE FROM ws_tickets WHERE expires_at < ?").run(Date.now());
}

/** `portalUserId` null = conexión del panel admin (recibe todo el bus). */
export function issueWsTicket(
  token: string,
  expiresAt: number,
  portalUserId: number | null = null,
): void {
  ensureTable();
  purgeExpired();
  db.prepare(
    "INSERT OR REPLACE INTO ws_tickets (token, expires_at, portal_user_id) VALUES (?, ?, ?)"
  ).run(token, expiresAt, portalUserId);
}

export function consumeWsTicket(
  token: string,
): { portalUserId: number | null } | null {
  ensureTable();
  purgeExpired();
  if (!token || token.length < 32) return null;

  const row = db
    .prepare(
      "SELECT token, expires_at, portal_user_id FROM ws_tickets WHERE token = ?"
    )
    .get(token) as TicketRow | undefined;

  if (!row || row.expires_at < Date.now()) {
    if (row) {
      db.prepare("DELETE FROM ws_tickets WHERE token = ?").run(token);
    }
    return null;
  }

  db.prepare("DELETE FROM ws_tickets WHERE token = ?").run(token);
  const portalUserId =
    row.portal_user_id == null || !Number.isFinite(Number(row.portal_user_id))
      ? null
      : Number(row.portal_user_id);
  return { portalUserId };
}
