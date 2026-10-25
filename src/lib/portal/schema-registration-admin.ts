/**
 * Fase 2 – Registration-Admin: migraciones de schema idempotentes.
 *
 * Tablas nuevas:
 *   development_condominios  — mapeo admin-configurable desarrollo → condominio.
 *   portal_admin_log         — auditoría de acciones admin sobre claims.
 *
 * Columna añadida (idempotente via PRAGMA):
 *   portal_users.registration_claim_id  — claim raíz de la cuenta.
 *
 * El estado 'held' en tickets se valida en capa de servicio (SQLite no
 * puede añadir CHECK constraints a tablas existentes).
 */

import db from "../db-connection";
import { initPortalSchema } from "./init-portal";

let initialized = false;

function hasColumn(table: string, column: string): boolean {
  const rows = db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

export function initRegistrationAdminSchema(): void {
  if (initialized) return;
  initialized = true;

  // Garantiza que el schema base (Fase 2 + Fase 3) ya existe.
  initPortalSchema();

  // ── 1. Tabla development_condominios ──────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS development_condominios (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      development_id INTEGER NOT NULL REFERENCES developments(id) ON DELETE CASCADE,
      condominio_id  INTEGER NOT NULL REFERENCES condominios(id)  ON DELETE CASCADE,
      created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(development_id, condominio_id)
    );

    CREATE INDEX IF NOT EXISTS idx_dev_condos_dev
      ON development_condominios(development_id);
    CREATE INDEX IF NOT EXISTS idx_dev_condos_condo
      ON development_condominios(condominio_id);
  `);

  // ── 2. Tabla portal_admin_log ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS portal_admin_log (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type    TEXT    NOT NULL,
      entity_id      INTEGER NOT NULL,
      action         TEXT    NOT NULL,
      actor          TEXT    NOT NULL,
      note           TEXT,
      metadata       TEXT,
      created_at     INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_portal_admin_log_entity
      ON portal_admin_log(entity_type, entity_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_portal_admin_log_actor
      ON portal_admin_log(actor, created_at);
  `);

  // ── 3. Columna idempotente portal_users.registration_claim_id ─────────────
  if (!hasColumn("portal_users", "registration_claim_id")) {
    db.exec("ALTER TABLE portal_users ADD COLUMN registration_claim_id INTEGER");
  }
}

// Auto-inicializar al importar.
initRegistrationAdminSchema();
