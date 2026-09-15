import { existsSync, unlinkSync } from "node:fs";
import db from "../src/lib/db.js";
import { initPhase2Schema } from "../src/lib/portal/schema.js";

/**
 * Borra SOLO los datos de prueba generados por el smoke test de la Fase 2:
 * clientes con correo `cliente_smoke_%`, sus tickets (y datos ligados) y los
 * movimientos de finanzas creados por 'smoke'. Conserva el seed (tipos y
 * categorías) intacto.
 */
initPhase2Schema();

const smokeUsers = db
  .prepare("SELECT id FROM portal_users WHERE email LIKE 'cliente_smoke_%'")
  .all() as { id: number }[];

const userIds = smokeUsers.map((u) => u.id);

if (userIds.length > 0) {
  const tickets = db
    .prepare(
      `SELECT id FROM tickets WHERE portal_user_id IN (${userIds.join(",")})`
    )
    .all() as { id: number }[];

  for (const t of tickets) {
    const docs = db
      .prepare("SELECT path FROM ticket_documents WHERE ticket_id = ?")
      .all(t.id) as { path: string }[];
    for (const d of docs) {
      if (d.path && existsSync(d.path)) {
        try {
          unlinkSync(d.path);
        } catch {
          /* ignore */
        }
      }
    }
    db.prepare("DELETE FROM ticket_documents WHERE ticket_id = ?").run(t.id);
    db.prepare("DELETE FROM ticket_values WHERE ticket_id = ?").run(t.id);
    db.prepare("DELETE FROM ticket_comments WHERE ticket_id = ?").run(t.id);
    db.prepare("DELETE FROM ticket_status_history WHERE ticket_id = ?").run(t.id);
    db.prepare("DELETE FROM notifications_log WHERE ticket_id = ?").run(t.id);
  }
  db.prepare(
    `DELETE FROM tickets WHERE portal_user_id IN (${userIds.join(",")})`
  ).run();
  db.prepare(
    `DELETE FROM portal_sessions WHERE user_id IN (${userIds.join(",")})`
  ).run();
  db.prepare(
    `DELETE FROM portal_users WHERE id IN (${userIds.join(",")})`
  ).run();
}

const fin = db
  .prepare("DELETE FROM finance_entries WHERE created_by = 'smoke'")
  .run();

console.log(
  `Limpieza lista. Clientes borrados: ${userIds.length}. Movimientos finanzas borrados: ${fin.changes}.`
);
process.exit(0);
