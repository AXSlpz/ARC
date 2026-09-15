import db from "./db-connection";
import { normalizeSpanishText } from "./text-normalize";

export interface Prototipo {
  id: number;
  condominio_id: number;
  name: string;
  active: boolean;
  created_at: number;
  updated_at: number;
}

export interface PrototipoInput {
  name: string;
  active?: boolean;
}

type PrototipoRow = {
  id: number;
  condominio_id: number;
  name: string;
  active: number;
  created_at: number;
  updated_at: number;
};

function columnExists(table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

export function initPrototiposSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS prototipos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      condominio_id INTEGER NOT NULL REFERENCES condominios(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(condominio_id, name)
    );

    CREATE INDEX IF NOT EXISTS idx_prototipos_condo ON prototipos(condominio_id);
    CREATE INDEX IF NOT EXISTS idx_prototipos_active ON prototipos(active);
  `);

  if (!columnExists("residentes", "prototipo_id")) {
    try {
      db.exec(`ALTER TABLE residentes ADD COLUMN prototipo_id INTEGER REFERENCES prototipos(id) ON DELETE SET NULL`);
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_residentes_prototipo ON residentes(prototipo_id)`
      );
    } catch {
      // Ignorar carrera entre workers
    }
  }
}

initPrototiposSchema();

function mapRow(row: PrototipoRow): Prototipo {
  return {
    id: row.id,
    condominio_id: row.condominio_id,
    name: row.name,
    active: row.active === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeName(name: string): string {
  return (normalizeSpanishText(name) ?? name.trim()).trim();
}

export function listPrototipos(
  condominioId: number,
  activeOnly = true
): Prototipo[] {
  const rows = activeOnly
    ? (db
        .prepare(
          `SELECT * FROM prototipos WHERE condominio_id = ? AND active = 1 ORDER BY name COLLATE NOCASE ASC`
        )
        .all(condominioId) as PrototipoRow[])
    : (db
        .prepare(
          `SELECT * FROM prototipos WHERE condominio_id = ? ORDER BY active DESC, name COLLATE NOCASE ASC`
        )
        .all(condominioId) as PrototipoRow[]);
  return rows.map(mapRow);
}

export function getPrototipo(id: number): Prototipo | null {
  const row = db
    .prepare(`SELECT * FROM prototipos WHERE id = ?`)
    .get(id) as PrototipoRow | undefined;
  return row ? mapRow(row) : null;
}

export function createPrototipo(
  condominioId: number,
  input: PrototipoInput
): Prototipo {
  const condo = db
    .prepare(`SELECT id FROM condominios WHERE id = ?`)
    .get(condominioId) as { id: number } | undefined;
  if (!condo) {
    throw new Error("Condominio no encontrado");
  }
  const name = normalizeName(input.name);
  if (!name) throw new Error("El nombre del prototipo es obligatorio");

  try {
    const result = db
      .prepare(
        `INSERT INTO prototipos (condominio_id, name, active)
         VALUES (?, ?, ?)`
      )
      .run(condominioId, name, input.active === false ? 0 : 1);
    return getPrototipo(Number(result.lastInsertRowid))!;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("UNIQUE")) {
      throw new Error("Ya existe un prototipo con ese nombre en el condominio");
    }
    throw err;
  }
}

export function updatePrototipo(
  id: number,
  input: Partial<PrototipoInput>
): Prototipo | null {
  const existing = getPrototipo(id);
  if (!existing) return null;

  const name =
    input.name !== undefined ? normalizeName(input.name) : existing.name;
  if (!name) throw new Error("El nombre del prototipo es obligatorio");
  const active =
    input.active !== undefined ? (input.active ? 1 : 0) : existing.active ? 1 : 0;

  try {
    db.prepare(
      `UPDATE prototipos
       SET name = ?, active = ?, updated_at = unixepoch()
       WHERE id = ?`
    ).run(name, active, id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("UNIQUE")) {
      throw new Error("Ya existe un prototipo con ese nombre en el condominio");
    }
    throw err;
  }
  return getPrototipo(id);
}

export function deletePrototipo(id: number): {
  deleted: boolean;
  deactivated: boolean;
} {
  const existing = getPrototipo(id);
  if (!existing) return { deleted: false, deactivated: false };

  const inUse = db
    .prepare(
      `SELECT COUNT(*) as c FROM residentes WHERE prototipo_id = ? AND active = 1`
    )
    .get(id) as { c: number };

  if (inUse.c > 0) {
    db.prepare(
      `UPDATE prototipos SET active = 0, updated_at = unixepoch() WHERE id = ?`
    ).run(id);
    return { deleted: false, deactivated: true };
  }

  db.prepare(`UPDATE residentes SET prototipo_id = NULL WHERE prototipo_id = ?`).run(
    id
  );
  db.prepare(`DELETE FROM prototipos WHERE id = ?`).run(id);
  return { deleted: true, deactivated: false };
}

export function findPrototipoByName(
  condominioId: number,
  name: string
): Prototipo | null {
  const normalized = normalizeName(name);
  if (!normalized) return null;
  const row = db
    .prepare(
      `SELECT * FROM prototipos
       WHERE condominio_id = ? AND lower(name) = lower(?)`
    )
    .get(condominioId, normalized) as PrototipoRow | undefined;
  return row ? mapRow(row) : null;
}

export function getOrCreatePrototipo(
  condominioId: number,
  name: string
): Prototipo {
  const existing = findPrototipoByName(condominioId, name);
  if (existing) {
    if (!existing.active) {
      return updatePrototipo(existing.id, { active: true })!;
    }
    return existing;
  }
  return createPrototipo(condominioId, { name });
}
