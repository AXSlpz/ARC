/**
 * Fase 4 – Servicios ARC: migraciones idempotentes y seeds.
 *
 * Tablas nuevas:
 *   portal_service_config  — configuración clave-valor del portal (lista de
 *                            precios a usar, etc.)
 *
 * Seeds:
 *   ticket_types → 'servicio-arc' (activo, con campos amigables)
 *
 * Idempotente: puede ejecutarse N veces sin error.
 */

import db from "../db-connection";
import { initPhase3Schema } from "./schema-phase3";

let initialized = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

function hasTable(name: string): boolean {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    )
    .get(name) as { name: string } | undefined;
  return Boolean(row);
}

function hasColumn(table: string, column: string): boolean {
  const rows = db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

function runMigration(version: string, fn: () => void): void {
  // schema_migrations creada en Phase 3; asumimos que ya existe.
  const exists = db
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(version) as { version: string } | undefined;
  if (exists) return;

  const tx = db.transaction(() => {
    fn();
    db.prepare(
      "INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)"
    ).run(version);
  });
  tx();
}

// ── Schema principal ──────────────────────────────────────────────────────────

export function initPhase4Schema(): void {
  if (initialized) return;
  initialized = true;

  // Asegurar tablas de fases anteriores.
  initPhase3Schema();

  // ── 1. portal_service_config ───────────────────────────────────────────────
  runMigration("phase4_service_config_v1", () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS portal_service_config (
        key        TEXT NOT NULL PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `);
  });

  // ── 2. Columna service_product_id en tickets (auditoría rápida) ───────────
  runMigration("phase4_tickets_service_product_id_v1", () => {
    if (!hasColumn("tickets", "service_product_id")) {
      db.exec(
        "ALTER TABLE tickets ADD COLUMN service_product_id INTEGER"
      );
    }
  });

  // ── 3. Seed ticket_type 'servicio-arc' ────────────────────────────────────
  runMigration("phase4_seed_servicio_arc_v1", () => {
    seedServicioArcTicketType();
  });
}

// ── Seeds ─────────────────────────────────────────────────────────────────────

/**
 * Inserta (o ignora si ya existe) el ticket_type 'servicio-arc' con sus
 * campos amigables.
 *
 * Este flujo comercial NO usa SLA de 5 días ni firma de modificación.
 */
function seedServicioArcTicketType(): void {
  // Verificar si ya existe
  const existing = db
    .prepare("SELECT id FROM ticket_types WHERE slug = 'servicio-arc'")
    .get() as { id: number } | undefined;

  let typeId: number;

  if (!existing) {
    const res = db
      .prepare(
        `INSERT INTO ticket_types
           (name, slug, description, active, letter_template, sort_order)
         VALUES (?, 'servicio-arc', ?, 1, NULL,
                 (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM ticket_types))`
      )
      .run(
        "Servicio ARC",
        "Solicitud de un servicio ofrecido por ARC Desarrollo (Mini CRM — sin SLA de modificación)."
      );
    typeId = Number(res.lastInsertRowid);
  } else {
    // Asegurar que esté activo
    db.prepare("UPDATE ticket_types SET active = 1 WHERE id = ?").run(
      existing.id
    );
    typeId = existing.id;
  }

  // Insertar campos si no existen para este tipo
  const existingFields = db
    .prepare(
      "SELECT COUNT(*) AS n FROM ticket_type_fields WHERE ticket_type_id = ?"
    )
    .get(typeId) as { n: number };

  if (existingFields.n === 0) {
    const insertField = db.prepare(
      `INSERT INTO ticket_type_fields
         (ticket_type_id, label, field_key, field_type, options, placeholder, required, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const fields: Array<{
      label: string;
      key: string;
      type: string;
      options: string | null;
      placeholder: string | null;
      required: number;
      sort: number;
    }> = [
      {
        label: "Cantidad",
        key: "cantidad",
        type: "number",
        options: null,
        placeholder: "1",
        required: 0,
        sort: 1,
      },
      {
        label: "Descripción de la necesidad",
        key: "descripcion_necesidad",
        type: "textarea",
        options: null,
        placeholder: "Describe brevemente qué necesitas y para qué lo usarás…",
        required: 1,
        sort: 2,
      },
      {
        label: "Preferencia de contacto",
        key: "preferencia_contacto",
        type: "select",
        options: JSON.stringify(["WhatsApp", "Correo electrónico", "Llamada telefónica"]),
        placeholder: null,
        required: 1,
        sort: 3,
      },
      {
        label: "Notas adicionales o adjuntos",
        key: "notas_adjuntos",
        type: "textarea",
        options: null,
        placeholder: "Información adicional, referencias o descripción de archivos que adjuntarás…",
        required: 0,
        sort: 4,
      },
    ];

    for (const f of fields) {
      insertField.run(
        typeId,
        f.label,
        f.key,
        f.type,
        f.options,
        f.placeholder,
        f.required,
        f.sort
      );
    }
  }
}

// Auto-inicializar al importar.
initPhase4Schema();
