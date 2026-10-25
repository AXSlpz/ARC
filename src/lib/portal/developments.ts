/**
 * Servicio de dominios: Desarrollos (developments).
 *
 * Un "desarrollo" es una etapa o unidad de vivienda (ej. Capital Sur, Terrasoles).
 * Cada desarrollo puede tener su propio catálogo de modificaciones habilitadas.
 */
import db from "../db-connection";
import { initPhase3Schema } from "./schema-phase3";

initPhase3Schema();

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface Development {
  id: number;
  name: string;
  slug: string;
  city: string | null;
  active: boolean;
  createdAt: number;
}

interface DevRow {
  id: number;
  name: string;
  slug: string;
  city: string | null;
  active: number;
  created_at: number;
}

function mapDev(row: DevRow): Development {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    city: row.city,
    active: Boolean(row.active),
    createdAt: row.created_at,
  };
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function listDevelopments(opts: { activeOnly?: boolean } = {}): Development[] {
  const where = opts.activeOnly ? "WHERE active = 1" : "";
  const rows = db
    .prepare(`SELECT * FROM developments ${where} ORDER BY name`)
    .all() as DevRow[];
  return rows.map(mapDev);
}

export function getDevelopment(id: number): Development | null {
  const row = db
    .prepare("SELECT * FROM developments WHERE id = ?")
    .get(id) as DevRow | undefined;
  return row ? mapDev(row) : null;
}

export function getDevelopmentBySlug(slug: string): Development | null {
  const row = db
    .prepare("SELECT * FROM developments WHERE slug = ?")
    .get(slug) as DevRow | undefined;
  return row ? mapDev(row) : null;
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export interface CreateDevelopmentInput {
  name: string;
  slug?: string;
  city?: string | null;
  active?: boolean;
}

export type CreateDevelopmentResult =
  | { ok: true; development: Development }
  | { ok: false; error: string };

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export function createDevelopment(
  input: CreateDevelopmentInput
): CreateDevelopmentResult {
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "El nombre es requerido." };

  const slug = input.slug?.trim() || slugify(name);
  if (!slug) return { ok: false, error: "Slug inválido." };

  const exists = db
    .prepare("SELECT id FROM developments WHERE slug = ?")
    .get(slug) as { id: number } | undefined;
  if (exists) {
    return { ok: false, error: `Ya existe un desarrollo con un nombre similar.` };
  }

  const sameName = db
    .prepare("SELECT id FROM developments WHERE lower(name) = lower(?)")
    .get(name) as { id: number } | undefined;
  if (sameName) {
    return { ok: false, error: `Ya existe un desarrollo llamado '${name}'.` };
  }

  const res = db
    .prepare(
      "INSERT INTO developments (name, slug, city, active) VALUES (?, ?, ?, ?)"
    )
    .run(
      name,
      slug,
      input.city?.trim() || null,
      input.active === false ? 0 : 1
    );

  const dev = getDevelopment(Number(res.lastInsertRowid));
  return dev
    ? { ok: true, development: dev }
    : { ok: false, error: "Error al crear el desarrollo." };
}

/** Reutiliza un desarrollo existente por nombre o slug; si no existe, lo crea. */
export function findOrCreateDevelopment(
  name: string
): CreateDevelopmentResult {
  const trimmed = name?.trim();
  if (!trimmed) return { ok: false, error: "El nombre es requerido." };

  const byName = db
    .prepare("SELECT * FROM developments WHERE lower(name) = lower(?)")
    .get(trimmed) as DevRow | undefined;
  if (byName) return { ok: true, development: mapDev(byName) };

  const bySlug = getDevelopmentBySlug(slugify(trimmed));
  if (bySlug) return { ok: true, development: bySlug };

  return createDevelopment({ name: trimmed });
}

export function updateDevelopment(
  id: number,
  input: Partial<Pick<CreateDevelopmentInput, "name" | "city" | "active">>
): Development | null {
  const current = getDevelopment(id);
  if (!current) return null;

  const name = input.name?.trim() ?? current.name;
  const city =
    input.city !== undefined ? (input.city?.trim() || null) : current.city;
  const active = input.active !== undefined ? (input.active ? 1 : 0) : (current.active ? 1 : 0);

  db.prepare(
    "UPDATE developments SET name = ?, city = ?, active = ? WHERE id = ?"
  ).run(name, city, active, id);

  return getDevelopment(id);
}
