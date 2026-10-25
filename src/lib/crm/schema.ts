import db from "../db-connection";

let initialized = false;

export const DEFAULT_PIPELINE_NAME = "Embudo de ventas";

export const DEFAULT_PIPELINE_STAGES: Array<{
  name: string;
  position: number;
  color: string;
}> = [
  { name: "Lead nuevo", position: 0, color: "#3b82f6" },
  { name: "Calificado", position: 1, color: "#eab308" },
  { name: "Propuesta enviada", position: 2, color: "#f97316" },
  { name: "Negociación", position: 3, color: "#8b5cf6" },
  { name: "Ganado", position: 4, color: "#22c55e" },
];

function tableExists(table: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as { name: string } | undefined;
  return Boolean(row);
}

function columnExists(table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  return rows.some((row) => row.name === column);
}

function insertDefaultStages(pipelineId: number): void {
  const insertStage = db.prepare(
    "INSERT INTO pipeline_stages (pipeline_id, name, position, color) VALUES (?, ?, ?, ?)",
  );
  for (const stage of DEFAULT_PIPELINE_STAGES) {
    insertStage.run(pipelineId, stage.name, stage.position, stage.color);
  }
}

function migrateLegacyLabels(): void {
  db.prepare("UPDATE pipelines SET name = ? WHERE name = ?").run(
    DEFAULT_PIPELINE_NAME,
    "Ventas",
  );
  const stageRenames: Array<[string, string]> = [
    ["Nuevo lead", "Lead nuevo"],
    ["Propuesta", "Propuesta enviada"],
  ];
  for (const [from, to] of stageRenames) {
    db.prepare("UPDATE pipeline_stages SET name = ? WHERE name = ?").run(to, from);
  }
}

function seedDefaults(): void {
  const pipelineCount = db
    .prepare("SELECT COUNT(*) AS n FROM pipelines")
    .get() as { n: number };
  if (pipelineCount.n === 0) {
    const now = Math.floor(Date.now() / 1000);
    const result = db
      .prepare(
        "INSERT INTO pipelines (name, created_at, updated_at) VALUES (?, ?, ?)",
      )
      .run(DEFAULT_PIPELINE_NAME, now, now);
    insertDefaultStages(Number(result.lastInsertRowid));
  } else {
    migrateLegacyLabels();
  }

  const listCount = db
    .prepare("SELECT COUNT(*) AS n FROM price_lists")
    .get() as { n: number };
  if (listCount.n === 0) {
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `INSERT INTO price_lists (name, currency, is_default, created_at, updated_at)
       VALUES (?, 'MXN', 1, ?, ?)`,
    ).run("Lista general", now, now);
  }
}

export function initCrmSchema(): void {
  if (initialized) return;
  initialized = true;

  db.exec(`
    CREATE TABLE IF NOT EXISTS prospectos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      phone_normalized TEXT NOT NULL UNIQUE,
      email TEXT,
      company TEXT,
      notes TEXT,
      tags_json TEXT DEFAULT '[]',
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      unit TEXT NOT NULL DEFAULT 'pza',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','discontinued')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS price_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'MXN',
      is_default INTEGER NOT NULL DEFAULT 0,
      valid_from TEXT,
      valid_until TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS price_list_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      price_list_id INTEGER NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      unit_price REAL NOT NULL CHECK (unit_price >= 0),
      UNIQUE(price_list_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS pipelines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS pipeline_stages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pipeline_id INTEGER NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER NOT NULL,
      color TEXT NOT NULL DEFAULT '#3b82f6'
    );

    CREATE TABLE IF NOT EXISTS deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pipeline_id INTEGER NOT NULL,
      stage_id INTEGER NOT NULL,
      prospecto_id INTEGER NOT NULL REFERENCES prospectos(id),
      assigned_to_user_id INTEGER,
      title TEXT NOT NULL,
      value REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'MXN',
      notes TEXT,
      expected_close_date TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost')),
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number INTEGER NOT NULL UNIQUE,
      prospecto_id INTEGER NOT NULL,
      price_list_id INTEGER,
      deal_id INTEGER,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','expired')),
      valid_until TEXT,
      notes TEXT,
      currency TEXT NOT NULL DEFAULT 'MXN',
      subtotal REAL NOT NULL DEFAULT 0,
      discount_total REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      sent_at INTEGER,
      pdf_path TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS quote_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      product_id INTEGER,
      name_snapshot TEXT NOT NULL,
      sku_snapshot TEXT,
      qty REAL NOT NULL CHECK (qty > 0),
      unit_price REAL NOT NULL,
      discount_pct REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL,
      position INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_crm_prospectos_name ON prospectos(name);
    CREATE INDEX IF NOT EXISTS idx_crm_deals_pipeline ON deals(pipeline_id);
    CREATE INDEX IF NOT EXISTS idx_crm_deals_stage ON deals(stage_id);
    CREATE INDEX IF NOT EXISTS idx_crm_quotes_prospecto ON quotes(prospecto_id);
    CREATE INDEX IF NOT EXISTS idx_crm_quotes_status ON quotes(status);
    CREATE INDEX IF NOT EXISTS idx_crm_quote_lines_quote ON quote_lines(quote_id);
    CREATE INDEX IF NOT EXISTS idx_crm_quote_lines_product ON quote_lines(product_id);
  `);

  if (tableExists("deals") && !columnExists("deals", "assigned_to_user_id")) {
    db.exec("ALTER TABLE deals ADD COLUMN assigned_to_user_id INTEGER");
  }
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_crm_deals_assignee ON deals(assigned_to_user_id)",
  );

  seedDefaults();
}

export { insertDefaultStages };

initCrmSchema();
