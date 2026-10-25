import db from "../db-connection";
import { initPhase2Schema } from "./schema";

/**
 * Fase 3 – Portal de clientes: dominios y migraciones idempotentes.
 *
 * Tablas nuevas:
 *   schema_migrations, developments, property_claims, modification_catalog,
 *   development_modification_config, portal_identity_documents,
 *   request_signatures, sla_events, committee_signature_config
 *
 * Columnas añadidas a tickets (idempotente via PRAGMA table_info):
 *   request_kind, modification_catalog_id, property_claim_id,
 *   sla_target_at, sla_paused_at, sla_status
 *
 * Idempotente: puede ejecutarse N veces sin error.
 * CHECK constraints en todas las tablas nuevas (se aplican en instalaciones frescas;
 * en tablas ya existentes SQLite no permite ALTER TABLE ADD CONSTRAINT → validación
 * reforzada en la capa de servicio).
 */

let initialized = false;

// ── Helpers de migración ──────────────────────────────────────────────────────

function hasColumn(table: string, column: string): boolean {
  const rows = db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

/**
 * Ejecuta `fn` solo si la versión de migración no ha sido aplicada antes.
 * Registra en schema_migrations para garantizar idempotencia entre procesos.
 */
function runMigration(version: string, fn: () => void): void {
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

export function initPhase3Schema(): void {
  if (initialized) return;
  initialized = true;

  // Asegurar que las tablas de Fase 2 existen primero (FK deps).
  initPhase2Schema();

  // ── 0. schema_migrations: tabla de control de versiones ────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT    NOT NULL PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  // ── 1. Tablas nuevas en una transacción ────────────────────────────────────
  const createTables = db.transaction(() => {
    db.exec(`
      -- ── Desarrollos (Capital Sur, Terrasoles, etc.) ─────────────────────
      CREATE TABLE IF NOT EXISTS developments (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL,
        slug       TEXT    NOT NULL UNIQUE,
        city       TEXT,
        active     INTEGER NOT NULL DEFAULT 1
                           CHECK(active IN (0, 1)),
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );

      -- ── Reclamos de propiedad ─────────────────────────────────────────────
      -- Partial unique index (fuera del CREATE TABLE): solo 1 approved por prop.
      CREATE TABLE IF NOT EXISTS property_claims (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        development_id      INTEGER NOT NULL,
        portal_user_id      INTEGER NOT NULL,
        property_identifier TEXT    NOT NULL,
        status              TEXT    NOT NULL DEFAULT 'pending'
                                    CHECK(status IN ('pending','approved','rejected','conflict')),
        property_snapshot   TEXT,
        hold_reason         TEXT,
        reviewed_by         TEXT,
        reviewed_at         INTEGER,
        created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at          INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (development_id)  REFERENCES developments(id),
        FOREIGN KEY (portal_user_id)  REFERENCES portal_users(id) ON DELETE CASCADE,
        UNIQUE(development_id, property_identifier, portal_user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_property_claims_user
        ON property_claims(portal_user_id, status);
      CREATE INDEX IF NOT EXISTS idx_property_claims_dev
        ON property_claims(development_id, status);

      -- Partial unique: solo UNA aprobación por (desarrollo, propiedad).
      CREATE UNIQUE INDEX IF NOT EXISTS idx_property_claims_one_approved
        ON property_claims(development_id, property_identifier)
        WHERE status = 'approved';

      -- ── Catálogo de modificaciones ────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS modification_catalog (
        id                    INTEGER PRIMARY KEY AUTOINCREMENT,
        name                  TEXT    NOT NULL,
        slug                  TEXT    NOT NULL UNIQUE,
        description           TEXT,
        requires_pdf_template TEXT,
        global_active         INTEGER NOT NULL DEFAULT 0
                                      CHECK(global_active IN (0, 1)),
        sort_order            INTEGER NOT NULL DEFAULT 0,
        created_at            INTEGER NOT NULL DEFAULT (unixepoch())
      );

      -- ── Configuración por desarrollo ──────────────────────────────────────
      CREATE TABLE IF NOT EXISTS development_modification_config (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        development_id          INTEGER NOT NULL,
        modification_catalog_id INTEGER NOT NULL,
        active                  INTEGER NOT NULL DEFAULT 1
                                        CHECK(active IN (0, 1)),
        max_per_ticket          INTEGER NOT NULL DEFAULT 1,
        extra_config            TEXT,
        created_at              INTEGER NOT NULL DEFAULT (unixepoch()),
        UNIQUE(development_id, modification_catalog_id),
        FOREIGN KEY (development_id)
          REFERENCES developments(id),
        FOREIGN KEY (modification_catalog_id)
          REFERENCES modification_catalog(id)
      );

      CREATE INDEX IF NOT EXISTS idx_dev_mod_config_dev
        ON development_modification_config(development_id, active);

      -- ── Documentos de identidad del cliente (INE + historial) ────────────
      CREATE TABLE IF NOT EXISTS portal_identity_documents (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        portal_user_id INTEGER NOT NULL,
        kind           TEXT    NOT NULL DEFAULT 'ine'
                               CHECK(kind IN ('ine','passport','other')),
        is_current     INTEGER NOT NULL DEFAULT 1
                               CHECK(is_current IN (0, 1)),
        stored_path    TEXT    NOT NULL,
        ocr_metadata   TEXT,
        ocr_status     TEXT    NOT NULL DEFAULT 'pending'
                               CHECK(ocr_status IN ('pending','processing','done','failed')),
        created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (portal_user_id)
          REFERENCES portal_users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_portal_identity_user
        ON portal_identity_documents(portal_user_id, is_current);

      -- Partial unique: solo UN documento 'current' por (usuario, kind).
      CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_docs_one_current
        ON portal_identity_documents(portal_user_id, kind)
        WHERE is_current = 1;

      -- ── Firmas / consentimientos ──────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS request_signatures (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id      INTEGER NOT NULL,
        signer_id      INTEGER,
        signer_name    TEXT    NOT NULL,
        signer_role    TEXT    NOT NULL DEFAULT 'resident'
                               CHECK(signer_role IN ('resident','committee','admin')),
        signature_hash TEXT    NOT NULL,
        signed_content TEXT    NOT NULL,
        ip_address     TEXT,
        user_agent     TEXT,
        signed_at      INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (ticket_id)  REFERENCES tickets(id) ON DELETE CASCADE,
        FOREIGN KEY (signer_id)  REFERENCES portal_users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_request_signatures_ticket
        ON request_signatures(ticket_id);

      -- ── Eventos SLA ───────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS sla_events (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id  INTEGER NOT NULL,
        event_type TEXT    NOT NULL
                   CHECK(event_type IN ('started','paused','resumed','completed','escalated')),
        reason     TEXT,
        target_at  INTEGER,
        paused_at  INTEGER,
        resumed_at INTEGER,
        created_by TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sla_events_ticket
        ON sla_events(ticket_id, created_at);

      -- Índice para buscar el último evento de un ticket rápidamente.
      CREATE INDEX IF NOT EXISTS idx_sla_events_type
        ON sla_events(ticket_id, event_type);

      -- ── Firma de comité por desarrollo ────────────────────────────────────
      CREATE TABLE IF NOT EXISTS committee_signature_config (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        development_id       INTEGER NOT NULL UNIQUE,
        committee_name       TEXT    NOT NULL,
        committee_role       TEXT    NOT NULL DEFAULT 'Comité de Arquitectura',
        signature_image_path TEXT,
        active               INTEGER NOT NULL DEFAULT 1
                                     CHECK(active IN (0, 1)),
        created_at           INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (development_id) REFERENCES developments(id)
      );
    `);
  });
  createTables();

  // ── 2. Columnas idempotentes en tickets ────────────────────────────────────
  migrateTicketColumns();

  // ── 3. Seeds base (idempotentes) ──────────────────────────────────────────
  seedDevelopments();
  seedModificationCatalogV2();

  // ── 4. Migraciones de datos (tracked, solo corren una vez) ────────────────

  // Poner city=NULL en desarrollos ya creados con 'Hermosillo' por error.
  runMigration("phase3_cities_null", () => {
    db.prepare(
      "UPDATE developments SET city = NULL WHERE slug IN ('capital-sur', 'terrasoles') AND city IS NOT NULL"
    ).run();
  });

  // Limpiar catálogo genérico incorrecto e insertar ítems exactos de los PDFs.
  runMigration("phase3_catalog_v2", () => {
    // Eliminar configuraciones que apuntan a slugs a borrar.
    db.prepare(`
      DELETE FROM development_modification_config
      WHERE modification_catalog_id IN (
        SELECT id FROM modification_catalog
        WHERE slug IN ('ampliacion-cuarto','bardeo-muro','techado-cochera','repellado')
      )
    `).run();

    // Eliminar slugs genéricos del catálogo anterior.
    db.prepare(
      "DELETE FROM modification_catalog WHERE slug IN ('ampliacion-cuarto','bardeo-muro','techado-cochera','repellado')"
    ).run();

    // Insertar nuevos ítems exactos de los PDFs (el seed ya los habrá insertado,
    // pero aquí es el punto explícito de la migración v2).
    seedModificationCatalogV2();
  });

  // Configurar por defecto los catálogos por desarrollo según los PDFs.
  runMigration("phase3_dev_configs_v1", () => {
    seedDevelopmentDefaultConfigs();
  });

  // ── Fase 3 extras: columnas y tablas adicionales ───────────────────────────
  // attachment_category en ticket_attachments
  runMigration("phase3_attachment_category_v1", () => {
    if (!hasColumn("ticket_attachments", "attachment_category")) {
      db.exec(`
        ALTER TABLE ticket_attachments
        ADD COLUMN attachment_category TEXT;
      `);
    }
  });

  // Unique constraint en request_signatures: un firmante solo firma una vez por ticket/rol.
  // Primero elimina duplicados (conserva el más reciente) para no romper índice.
  runMigration("phase3_signature_unique_v1", () => {
    db.exec(`
      DELETE FROM request_signatures
      WHERE signer_id IS NOT NULL
        AND id NOT IN (
          SELECT MAX(id)
          FROM request_signatures
          WHERE signer_id IS NOT NULL
          GROUP BY ticket_id, signer_id, signer_role
        );
    `);
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_request_signatures_unique_signer
        ON request_signatures(ticket_id, signer_id, signer_role)
        WHERE signer_id IS NOT NULL;
    `);
  });

  // Evidencia visual de firma: method, image_path (privado), image_sha256
  runMigration("phase3_signature_visual_v1", () => {
    if (!hasColumn("request_signatures", "signature_method")) {
      db.exec(`ALTER TABLE request_signatures ADD COLUMN signature_method TEXT
               CHECK(signature_method IN ('drawn','typed'))`);
    }
    if (!hasColumn("request_signatures", "signature_image_path")) {
      db.exec(`ALTER TABLE request_signatures ADD COLUMN signature_image_path TEXT`);
    }
    if (!hasColumn("request_signatures", "signature_image_sha256")) {
      db.exec(`ALTER TABLE request_signatures ADD COLUMN signature_image_sha256 TEXT`);
    }
  });

  // file_sha256 en ticket_attachments (dedup idempotente por retry)
  runMigration("phase3_attachment_sha256_v1", () => {
    if (!hasColumn("ticket_attachments", "file_sha256")) {
      db.exec(`ALTER TABLE ticket_attachments ADD COLUMN file_sha256 TEXT;`);
    }
    // Índice para dedup rápido en retry
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ticket_attachments_sha256
        ON ticket_attachments(ticket_id, attachment_category, file_sha256)
        WHERE file_sha256 IS NOT NULL;
    `);
  });

  // modification_drafts table
  runMigration("phase3_modification_drafts_v1", () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS modification_drafts (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        portal_user_id          INTEGER NOT NULL,
        modification_catalog_id INTEGER,
        step                    INTEGER NOT NULL DEFAULT 0,
        data                    TEXT    NOT NULL DEFAULT '{}',
        created_at              INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at              INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (portal_user_id) REFERENCES portal_users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_mod_drafts_user
        ON modification_drafts(portal_user_id);
    `);
  });

  runMigration("phase3_ine_back_and_captures_v1", () => {
    if (!hasColumn("portal_identity_documents", "back_stored_path")) {
      db.exec(
        "ALTER TABLE portal_identity_documents ADD COLUMN back_stored_path TEXT"
      );
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS ine_capture_tokens (
        token        TEXT PRIMARY KEY,
        portal_user_id INTEGER,
        purpose      TEXT NOT NULL CHECK(purpose IN ('register','match','profile')),
        front_path   TEXT NOT NULL,
        back_path    TEXT NOT NULL,
        ocr_metadata TEXT NOT NULL,
        expires_at   INTEGER NOT NULL,
        created_at   INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `);
  });

  runMigration("phase3_ine_capture_profile_v1", () => {
    const row = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'ine_capture_tokens'")
      .get() as { sql: string } | undefined;
    if (!row?.sql || row.sql.includes("'profile'")) return;
    db.exec(`
      CREATE TABLE ine_capture_tokens_v2 (
        token        TEXT PRIMARY KEY,
        portal_user_id INTEGER,
        purpose      TEXT NOT NULL CHECK(purpose IN ('register','match','profile')),
        front_path   TEXT NOT NULL,
        back_path    TEXT NOT NULL,
        ocr_metadata TEXT NOT NULL,
        expires_at   INTEGER NOT NULL,
        created_at   INTEGER NOT NULL DEFAULT (unixepoch())
      );
      INSERT INTO ine_capture_tokens_v2
        (token, portal_user_id, purpose, front_path, back_path, ocr_metadata, expires_at, created_at)
      SELECT token, portal_user_id, purpose, front_path, back_path, ocr_metadata, expires_at, created_at
      FROM ine_capture_tokens;
      DROP TABLE ine_capture_tokens;
      ALTER TABLE ine_capture_tokens_v2 RENAME TO ine_capture_tokens;
    `);
  });
}

// ── Column migrations ─────────────────────────────────────────────────────────

function migrateTicketColumns(): void {
  // 'modification' | 'service_arc' | NULL  —  validado en capa app
  if (!hasColumn("tickets", "request_kind")) {
    db.exec("ALTER TABLE tickets ADD COLUMN request_kind TEXT");
  }
  if (!hasColumn("tickets", "modification_catalog_id")) {
    db.exec("ALTER TABLE tickets ADD COLUMN modification_catalog_id INTEGER");
  }
  if (!hasColumn("tickets", "property_claim_id")) {
    db.exec("ALTER TABLE tickets ADD COLUMN property_claim_id INTEGER");
  }
  if (!hasColumn("tickets", "sla_target_at")) {
    db.exec("ALTER TABLE tickets ADD COLUMN sla_target_at INTEGER");
  }
  if (!hasColumn("tickets", "sla_paused_at")) {
    db.exec("ALTER TABLE tickets ADD COLUMN sla_paused_at INTEGER");
  }
  if (!hasColumn("tickets", "sla_status")) {
    db.exec(
      "ALTER TABLE tickets ADD COLUMN sla_status TEXT NOT NULL DEFAULT 'active'"
    );
  }
  if (!hasColumn("tickets", "resolution_decision")) {
    db.exec("ALTER TABLE tickets ADD COLUMN resolution_decision TEXT");
  }
  if (!hasColumn("tickets", "resolution_note")) {
    db.exec("ALTER TABLE tickets ADD COLUMN resolution_note TEXT");
  }
  if (!hasColumn("tickets", "resolution_hash")) {
    db.exec("ALTER TABLE tickets ADD COLUMN resolution_hash TEXT");
  }
}

// ── Seeds ─────────────────────────────────────────────────────────────────────

/** Capital Sur y Terrasoles. city=NULL (no hardcodear ciudad). */
function seedDevelopments(): void {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO developments (name, slug, city, active) VALUES (?, ?, NULL, 1)"
  );
  insert.run("Capital Sur", "capital-sur");
  insert.run("Terrasoles", "terrasoles");
}

/**
 * Catálogo fiel extraído de los PDFs de los desarrollos.
 * global_active = 0 en todos: Admin habilita por desarrollo.
 * Los 3 ítems configurables (calentador solar, pérgola, repellado interior)
 * tampoco se activan globalmente ni se asignan a ningún desarrollo por default.
 */
function seedModificationCatalogV2(): void {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO modification_catalog
      (name, slug, description, requires_pdf_template, global_active, sort_order)
    VALUES (?, ?, ?, ?, 0, ?)
  `);

  const items: ReadonlyArray<[string, string, string, string, number]> = [
    // ── Compartidos (ambos desarrollos pueden configurarlos) ──────────────
    [
      "Tanque de gas",
      "tanque-gas",
      "Instalación de tanque estacionario de gas LP.",
      "carta-tanque-gas",
      10,
    ],
    [
      "Toma de gas",
      "toma-gas",
      "Conexión a la red de gas del fraccionamiento (Terrasoles).",
      "carta-toma-gas",
      15,
    ],
    [
      "Escalera de azotea",
      "escalera-azotea",
      "Construcción de escalera de acceso a azotea.",
      "carta-escalera-azotea",
      20,
    ],
    [
      "Muro colindante",
      "muro-colindante",
      "Construcción o modificación de muro en lindero.",
      "carta-muro-colindante",
      30,
    ],
    [
      "Techumbre cuarto de lavado",
      "techumbre-lavado",
      "Techado del cuarto de lavado.",
      "carta-techumbre-lavado",
      40,
    ],
    [
      "Techumbre área posterior",
      "techumbre-posterior",
      "Techado del área posterior de la vivienda.",
      "carta-techumbre-posterior",
      45,
    ],
    [
      "Cuarto de lavado",
      "cuarto-lavado",
      "Construcción de cuarto de lavado en área de servicio.",
      "carta-cuarto-lavado",
      50,
    ],
    [
      "Reja lateral",
      "reja-lateral",
      "Instalación de reja en pasillo lateral.",
      "carta-reja-lateral",
      60,
    ],
    [
      "Reja de pasillo",
      "reja-pasillo",
      "Instalación de reja de acceso en pasillo.",
      "carta-reja-pasillo",
      65,
    ],
    [
      "Herrería posterior",
      "herreria-posterior",
      "Instalación o modificación de herrería en área posterior (con variantes de config).",
      "carta-herreria-posterior",
      70,
    ],
    [
      "Mosquiteros",
      "mosquiteros",
      "Instalación de mosquiteros en puertas y ventanas.",
      "carta-mosquiteros",
      80,
    ],
    [
      "Área verde delantera",
      "area-verde-delantera",
      "Modificación o mejora del área verde delantera.",
      "carta-area-verde",
      90,
    ],
    [
      "Piso / firme posterior",
      "piso-firme-posterior",
      "Colado de piso o firme de concreto en área posterior (Terrasoles).",
      "carta-piso-firme",
      100,
    ],
    [
      "Volado de acceso",
      "volado-acceso",
      "Construcción de volado en acceso principal (Capital Sur).",
      "carta-volado-acceso",
      110,
    ],
    [
      "Pintura y retoque",
      "pintura-retoque",
      "Aplicación de pintura o retoque en fachada exterior.",
      "carta-pintura",
      120,
    ],
    [
      "Instalaciones especiales",
      "instalaciones-especiales",
      "Instalaciones autorizadas fuera del catálogo estándar (Capital Sur).",
      "carta-instalaciones-especiales",
      130,
    ],
    // ── Configurables por Admin (no activos globalmente, sin config por defecto) ──
    [
      "Calentador solar",
      "calentador-solar",
      "Instalación de calentador solar en azotea (requiere habilitación de Administrador).",
      "carta-calentador-solar",
      200,
    ],
    [
      "Pérgola",
      "pergola",
      "Construcción de pérgola en jardín o terraza (requiere habilitación de Administrador).",
      "carta-pergola",
      210,
    ],
    [
      "Repellado interior",
      "repellado-interior",
      "Aplicación de repellado en muros interiores (requiere habilitación de Administrador).",
      "carta-repellado-interior",
      220,
    ],
  ];

  for (const [name, slug, description, template, sort] of items) {
    insert.run(name, slug, description, template, sort);
  }
}

/**
 * Configuración por defecto de modificaciones por desarrollo según los PDFs.
 * Solo corre una vez (dentro de runMigration "phase3_dev_configs_v1").
 * Los admins pueden cambiar estas configs después; no se sobrescribe en reinicios.
 */
function seedDevelopmentDefaultConfigs(): void {
  const getDevId = (slug: string): number | null => {
    const row = db
      .prepare("SELECT id FROM developments WHERE slug = ?")
      .get(slug) as { id: number } | undefined;
    return row?.id ?? null;
  };

  const getCatalogId = (slug: string): number | null => {
    const row = db
      .prepare("SELECT id FROM modification_catalog WHERE slug = ?")
      .get(slug) as { id: number } | undefined;
    return row?.id ?? null;
  };

  const upsertConfig = db.prepare(`
    INSERT INTO development_modification_config
      (development_id, modification_catalog_id, active, max_per_ticket)
    VALUES (?, ?, 1, 1)
    ON CONFLICT(development_id, modification_catalog_id)
    DO NOTHING
  `);

  // Capital Sur: modificaciones del PDF de Capital Sur
  const capitalSurId = getDevId("capital-sur");
  if (capitalSurId) {
    const capitalSurSlugs = [
      "tanque-gas",
      "escalera-azotea",
      "muro-colindante",
      "techumbre-lavado",
      "techumbre-posterior",
      "cuarto-lavado",
      "reja-lateral",
      "reja-pasillo",
      "herreria-posterior",
      "mosquiteros",
      "area-verde-delantera",
      "volado-acceso",
      "pintura-retoque",
      "instalaciones-especiales",
    ];
    for (const slug of capitalSurSlugs) {
      const catId = getCatalogId(slug);
      if (catId) upsertConfig.run(capitalSurId, catId);
    }
  }

  // Terrasoles: modificaciones del PDF de Terrasoles
  const terrasolesId = getDevId("terrasoles");
  if (terrasolesId) {
    const terraSlugs = [
      "tanque-gas",
      "toma-gas",
      "reja-lateral",
      "reja-pasillo",
      "herreria-posterior",
      "mosquiteros",
      "area-verde-delantera",
      "piso-firme-posterior",
      "pintura-retoque",
    ];
    for (const slug of terraSlugs) {
      const catId = getCatalogId(slug);
      if (catId) upsertConfig.run(terrasolesId, catId);
    }
  }
  // calentador-solar, pergola, repellado-interior → SIN config por defecto.
}

// Auto-initialize on import.
initPhase3Schema();
