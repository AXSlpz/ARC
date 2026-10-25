import db from "../db";

/**
 * Esquema de la Fase 2 (portal de clientes, tickets con formularios dinámicos,
 * carta de autorización, ingresos/egresos y log de notificaciones).
 *
 * Se ejecuta una sola vez al importar. Todas las tablas usan IF NOT EXISTS para
 * ser idempotentes y no chocar con el esquema base de ARC.
 */
let initialized = false;

export function initPhase2Schema(): void {
  if (initialized) return;
  initialized = true;

  db.exec(`
    -- ── Portal de clientes ───────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS portal_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      password_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS portal_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (user_id) REFERENCES portal_users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_portal_sessions_expires
      ON portal_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_portal_sessions_user
      ON portal_sessions(user_id);

    -- ── Tipos de ticket (flujos) + campos dinámicos ──────────────────────
    CREATE TABLE IF NOT EXISTS ticket_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      letter_template TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS ticket_type_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_type_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      field_key TEXT NOT NULL,
      field_type TEXT NOT NULL,
      options TEXT,
      placeholder TEXT,
      required INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_ticket_type_fields_type
      ON ticket_type_fields(ticket_type_id, sort_order);

    -- ── Tickets ──────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folio TEXT NOT NULL UNIQUE,
      ticket_type_id INTEGER NOT NULL,
      portal_user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'nuevo',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id),
      FOREIGN KEY (portal_user_id) REFERENCES portal_users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(portal_user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status, created_at);

    -- ── Plantillas de notificación administrativa ────────────────────────
    CREATE TABLE IF NOT EXISTS notification_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      body TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_notification_templates_active
      ON notification_templates(active, sort_order);

    CREATE TABLE IF NOT EXISTS ticket_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      field_key TEXT NOT NULL,
      label TEXT NOT NULL,
      value TEXT,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_ticket_values_ticket ON ticket_values(ticket_id);

    CREATE TABLE IF NOT EXISTS ticket_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      author_type TEXT NOT NULL,
      author_name TEXT,
      body TEXT NOT NULL,
      internal INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket
      ON ticket_comments(ticket_id, created_at);

    CREATE TABLE IF NOT EXISTS ticket_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      changed_by TEXT,
      note TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_ticket_status_history_ticket
      ON ticket_status_history(ticket_id, created_at);

    CREATE TABLE IF NOT EXISTS ticket_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      kind TEXT NOT NULL DEFAULT 'authorization_letter',
      filename TEXT NOT NULL,
      path TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_ticket_documents_ticket
      ON ticket_documents(ticket_id);

    -- ── Adjuntos subidos por cliente/admin (archivos seguros) ────────────
    CREATE TABLE IF NOT EXISTS ticket_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      comment_id INTEGER,
      uploader_type TEXT NOT NULL,
      original_name TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      mime TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      scanned TEXT NOT NULL DEFAULT 'skipped',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket
      ON ticket_attachments(ticket_id, created_at);

    -- ── Finanzas (ingresos / egresos) ────────────────────────────────────
    CREATE TABLE IF NOT EXISTS finance_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(name, kind)
    );

    CREATE TABLE IF NOT EXISTS finance_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      category_id INTEGER,
      amount_cents INTEGER NOT NULL,
      description TEXT,
      occurred_on TEXT NOT NULL,
      method TEXT,
      reference TEXT,
      created_by TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (category_id) REFERENCES finance_categories(id)
    );

    CREATE INDEX IF NOT EXISTS idx_finance_entries_date
      ON finance_entries(occurred_on);
    CREATE INDEX IF NOT EXISTS idx_finance_entries_kind
      ON finance_entries(kind, occurred_on);

    -- ── Log de notificaciones ────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS notifications_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL,
      target TEXT NOT NULL,
      subject TEXT,
      body TEXT,
      ticket_id INTEGER,
      status TEXT NOT NULL DEFAULT 'sent',
      error TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_log_ticket
      ON notifications_log(ticket_id, created_at);
  `);

  migrateColumns();
  seedDefaults();
}

/**
 * Migraciones idempotentes de columnas nuevas (SQLite no soporta
 * "ADD COLUMN IF NOT EXISTS", así que verificamos con PRAGMA table_info).
 */
function migrateColumns(): void {
  const hasColumn = (table: string, column: string): boolean => {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name: string;
    }>;
    return rows.some((r) => r.name === column);
  };

  // Estado de "espera de respuesta del cliente" en el ticket (#6).
  if (!hasColumn("tickets", "awaiting_kind")) {
    db.exec(
      "ALTER TABLE tickets ADD COLUMN awaiting_kind TEXT NOT NULL DEFAULT 'none'"
    );
  }
  if (!hasColumn("tickets", "awaiting_note")) {
    db.exec("ALTER TABLE tickets ADD COLUMN awaiting_note TEXT");
  }
  // Enlace opcional del cliente del portal con un residente (#6).
  if (!hasColumn("portal_users", "residente_id")) {
    db.exec("ALTER TABLE portal_users ADD COLUMN residente_id INTEGER");
  }
  // Archivado (soft-delete) de tickets: los eliminados van al submenú "Archivo".
  if (!hasColumn("tickets", "deleted_at")) {
    db.exec("ALTER TABLE tickets ADD COLUMN deleted_at INTEGER");
  }
  // Origen del ticket: 'client' (solicitud del portal) o 'admin_notice'.
  if (!hasColumn("tickets", "origin")) {
    db.exec(
      "ALTER TABLE tickets ADD COLUMN origin TEXT NOT NULL DEFAULT 'client'"
    );
  }
  if (!hasColumn("tickets", "residente_id")) {
    db.exec("ALTER TABLE tickets ADD COLUMN residente_id INTEGER");
  }
  if (!hasColumn("tickets", "notification_template_id")) {
    db.exec("ALTER TABLE tickets ADD COLUMN notification_template_id INTEGER");
  }

  // Estatus retirados del panel: En proceso, Completado y Cerrado.
  db.prepare(
    "UPDATE tickets SET status = 'en_revision' WHERE status = 'en_proceso'"
  ).run();
  db.prepare(
    "UPDATE tickets SET status = 'cancelado' WHERE status IN ('completado', 'cerrado')"
  ).run();
}

/** Datos iniciales: categorías de finanzas y un tipo de ticket de ejemplo. */
function seedDefaults(): void {
  const catCount = db
    .prepare("SELECT COUNT(*) AS n FROM finance_categories")
    .get() as { n: number };

  if (catCount.n === 0) {
    const insertCat = db.prepare(
      "INSERT OR IGNORE INTO finance_categories (name, kind) VALUES (?, ?)"
    );
    const seedCats = db.transaction(() => {
      insertCat.run("Cuotas de mantenimiento", "income");
      insertCat.run("Pagos de servicios", "income");
      insertCat.run("Anticipos", "income");
      insertCat.run("Otros ingresos", "income");
      insertCat.run("Gastos administrativos", "expense");
      insertCat.run("Mantenimiento", "expense");
      insertCat.run("Servicios (agua/luz)", "expense");
      insertCat.run("Nómina", "expense");
      insertCat.run("Otros egresos", "expense");
    });
    seedCats();
  }

  const typeCount = db
    .prepare("SELECT COUNT(*) AS n FROM ticket_types")
    .get() as { n: number };

  if (typeCount.n === 0) {
    seedGasTankExample();
  }

  seedAdminNoticeTicketType();
  seedExampleNotificationTemplates();
}

const ADMIN_NOTICE_TYPE_SLUG = "notificacion-administrativa";

/** Tipo de sistema: INSERT OR IGNORE por slug (idempotente). Sin campos de formulario. */
function seedAdminNoticeTicketType(): void {
  db.prepare(
    `INSERT OR IGNORE INTO ticket_types (name, slug, description, active, sort_order)
     VALUES (?, ?, ?, 1, 90)`
  ).run(
    "Notificación administrativa",
    ADMIN_NOTICE_TYPE_SLUG,
    "Notificación enviada por administración al residente."
  );
}

/** Dos plantillas de ejemplo solo si la tabla está vacía. */
function seedExampleNotificationTemplates(): void {
  const count = db
    .prepare("SELECT COUNT(*) AS n FROM notification_templates")
    .get() as { n: number };
  if (count.n > 0) return;

  const insert = db.prepare(
    `INSERT INTO notification_templates (name, slug, body, active, sort_order)
     VALUES (?, ?, ?, 1, ?)`
  );
  insert.run(
    "Violación de reglamento",
    "violacion-de-reglamento",
    `Estimado/a {{nombre}}:

Le informamos que se ha detectado una violación al reglamento en su vivienda {{vivienda}} del condominio {{condominio}}.

Motivo: {{motivo}}

Folio de seguimiento: {{folio}}.

Le pedimos atender esta notificación a la brevedad. Puede consultar el detalle en su portal de clientes ARC.`,
    1
  );
  insert.run(
    "Modificación sin autorización",
    "modificacion-sin-autorizacion",
    `Estimado/a {{nombre}}:

Hemos identificado una modificación realizada sin autorización previa en su vivienda {{vivienda}} ({{condominio}}).

Motivo: {{motivo}}

Folio de seguimiento: {{folio}}.

Le solicitamos regularizar esta situación. Consulte los detalles en su portal de clientes ARC.`,
    2
  );
}

function seedGasTankExample(): void {
  const letter = `<h1>Carta de Autorización</h1>
<p>Folio: <strong>{{folio}}</strong> &middot; Fecha: {{fecha}}</p>
<p>Por medio de la presente se autoriza a <strong>{{cliente_nombre}}</strong>
(correo {{cliente_correo}}, teléfono {{cliente_telefono}}) la solicitud
"<strong>{{tipo}}</strong>".</p>
<h3>Detalles de la solicitud</h3>
<ul>
  <li>Ubicación / dirección: {{ubicacion}}</li>
  <li>Capacidad del tanque (L): {{capacidad_litros}}</li>
  <li>Empresa instaladora: {{empresa_instaladora}}</li>
  <li>Fecha propuesta de instalación: {{fecha_instalacion}}</li>
</ul>
<p>Esta autorización queda sujeta al cumplimiento de las normas de seguridad vigentes.</p>
<p style="margin-top:48px">_______________________________<br/>Administración ARC</p>`;

  const insertType = db.prepare(
    `INSERT INTO ticket_types (name, slug, description, letter_template, sort_order)
     VALUES (?, ?, ?, ?, ?)`
  );
  const insertField = db.prepare(
    `INSERT INTO ticket_type_fields
       (ticket_type_id, label, field_key, field_type, options, placeholder, required, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const tx = db.transaction(() => {
    const res = insertType.run(
      "Instalación de tanque de gas fijo",
      "instalacion-tanque-gas",
      "Solicitud para instalar un tanque de gas estacionario en la propiedad.",
      letter,
      1
    );
    const typeId = Number(res.lastInsertRowid);
    const fields: Array<
      [string, string, string, string | null, string | null, number]
    > = [
      ["Ubicación / dirección", "ubicacion", "text", null, "Calle y número", 1],
      [
        "Capacidad del tanque (litros)",
        "capacidad_litros",
        "number",
        null,
        "Ej. 300",
        1,
      ],
      [
        "Empresa instaladora",
        "empresa_instaladora",
        "text",
        null,
        "Nombre de la empresa",
        1,
      ],
      [
        "Fecha propuesta de instalación",
        "fecha_instalacion",
        "date",
        null,
        null,
        1,
      ],
      [
        "¿Cuenta con póliza de seguro?",
        "tiene_seguro",
        "boolean",
        null,
        null,
        0,
      ],
      [
        "Comentarios adicionales",
        "comentarios",
        "textarea",
        null,
        "Información relevante",
        0,
      ],
    ];
    fields.forEach((f, idx) => {
      insertField.run(typeId, f[0], f[1], f[2], f[3], f[4], f[5], idx + 1);
    });
  });
  tx();
}

initPhase2Schema();
