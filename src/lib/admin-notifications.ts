import db from "./db";

export type AdminNoticeKind = "solicitud" | "servicio";

export interface AdminNotice {
  id: number;
  kind: AdminNoticeKind;
  title: string;
  body: string;
  ticketId: number | null;
  folio: string | null;
  createdAt: number;
  read: boolean;
}

const KEEP = 300;

function clip(value: string, max: number): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK(kind IN ('solicitud', 'servicio')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    ticket_id INTEGER,
    folio TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_admin_notifications_created
    ON admin_notifications(created_at DESC, id DESC);

  CREATE TABLE IF NOT EXISTS admin_notification_reads (
    notification_id INTEGER NOT NULL,
    admin_user_id INTEGER NOT NULL,
    read_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (notification_id, admin_user_id)
  );
`);

function pruneOld(): void {
  const extra = db
    .prepare("SELECT COUNT(*) AS n FROM admin_notifications")
    .get() as { n: number };
  if (extra.n <= KEEP) return;
  const cutoff = db
    .prepare(
      "SELECT id FROM admin_notifications ORDER BY id DESC LIMIT 1 OFFSET ?"
    )
    .get(KEEP - 1) as { id: number } | undefined;
  if (!cutoff) return;
  db.prepare("DELETE FROM admin_notification_reads WHERE notification_id < ?").run(
    cutoff.id
  );
  db.prepare("DELETE FROM admin_notifications WHERE id < ?").run(cutoff.id);
}

export function publishAdminNotification(input: {
  kind: AdminNoticeKind;
  title: string;
  body: string;
  ticketId: number;
  folio: string;
}): number | null {
  const title = clip(input.title, 80);
  const body = clip(input.body, 180);
  const folio = clip(input.folio, 40);
  if (
    (input.kind !== "solicitud" && input.kind !== "servicio") ||
    !title ||
    !body ||
    !Number.isInteger(input.ticketId) ||
    input.ticketId <= 0
  ) {
    return null;
  }
  try {
    const row = db
      .prepare(
        `INSERT INTO admin_notifications (kind, title, body, ticket_id, folio)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(input.kind, title, body, input.ticketId, folio || null);
    pruneOld();
    return Number(row.lastInsertRowid);
  } catch {
    console.error("[admin-notice] no se pudo guardar el aviso");
    return null;
  }
}

export function listAdminNotifications(
  adminUserId: number,
  limit = 40
): { notifications: AdminNotice[]; unreadCount: number } {
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const rows = db
    .prepare(
      `SELECT n.id, n.kind, n.title, n.body, n.ticket_id, n.folio, n.created_at,
              CASE WHEN r.notification_id IS NULL THEN 0 ELSE 1 END AS is_read
       FROM admin_notifications n
       LEFT JOIN admin_notification_reads r
         ON r.notification_id = n.id AND r.admin_user_id = ?
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT ?`
    )
    .all(adminUserId, safeLimit) as Array<{
    id: number;
    kind: string;
    title: string;
    body: string;
    ticket_id: number | null;
    folio: string | null;
    created_at: number;
    is_read: number;
  }>;

  const unread = db
    .prepare(
      `SELECT COUNT(*) AS n
       FROM admin_notifications n
       LEFT JOIN admin_notification_reads r
         ON r.notification_id = n.id AND r.admin_user_id = ?
       WHERE r.notification_id IS NULL`
    )
    .get(adminUserId) as { n: number };

  return {
    unreadCount: unread.n,
    notifications: rows.map((row) => ({
      id: row.id,
      kind: row.kind === "servicio" ? "servicio" : "solicitud",
      title: row.title,
      body: row.body,
      ticketId: row.ticket_id,
      folio: row.folio,
      createdAt: row.created_at,
      read: row.is_read === 1,
    })),
  };
}

export function markAdminNotificationRead(
  adminUserId: number,
  notificationId: number
): boolean {
  const exists = db
    .prepare("SELECT id FROM admin_notifications WHERE id = ?")
    .get(notificationId) as { id: number } | undefined;
  if (!exists) return false;
  db.prepare(
    `INSERT INTO admin_notification_reads (notification_id, admin_user_id)
     VALUES (?, ?)
     ON CONFLICT(notification_id, admin_user_id) DO NOTHING`
  ).run(notificationId, adminUserId);
  return true;
}

export function markAllAdminNotificationsRead(adminUserId: number): void {
  db.prepare(
    `INSERT INTO admin_notification_reads (notification_id, admin_user_id)
     SELECT n.id, ?
     FROM admin_notifications n
     WHERE NOT EXISTS (
       SELECT 1 FROM admin_notification_reads r
       WHERE r.notification_id = n.id AND r.admin_user_id = ?
     )`
  ).run(adminUserId, adminUserId);
}
