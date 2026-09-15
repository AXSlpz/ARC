import db from "../db";
import { initPhase2Schema } from "./schema";
import type { NotificationTemplate } from "./types";

initPhase2Schema();

interface TemplateRow {
  id: number;
  name: string;
  slug: string;
  body: string;
  active: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

function mapTemplate(row: TemplateRow): NotificationTemplate {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    body: row.body,
    active: Boolean(row.active),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function uniqueSlug(base: string, excludeId?: number): string {
  let slug = base || "plantilla";
  let n = 1;
  while (true) {
    const row = excludeId
      ? (db
          .prepare(
            "SELECT id FROM notification_templates WHERE slug = ? AND id <> ?"
          )
          .get(slug, excludeId) as { id: number } | undefined)
      : (db
          .prepare("SELECT id FROM notification_templates WHERE slug = ?")
          .get(slug) as { id: number } | undefined);
    if (!row) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

export function renderTemplateBody(
  body: string,
  vars: Record<string, string>
): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] ?? "" : "";
  });
}

export function listTemplates(
  opts: { activeOnly?: boolean } = {}
): NotificationTemplate[] {
  const where = opts.activeOnly ? "WHERE active = 1" : "";
  const rows = db
    .prepare(
      `SELECT * FROM notification_templates ${where} ORDER BY sort_order, name`
    )
    .all() as TemplateRow[];
  return rows.map(mapTemplate);
}

export function getTemplate(id: number): NotificationTemplate | null {
  const row = db
    .prepare("SELECT * FROM notification_templates WHERE id = ?")
    .get(id) as TemplateRow | undefined;
  return row ? mapTemplate(row) : null;
}

export interface NotificationTemplateInput {
  name: string;
  body: string;
  active?: boolean;
  sortOrder?: number;
}

export function createTemplate(
  input: NotificationTemplateInput
): NotificationTemplate {
  const name = input.name.trim();
  const slug = uniqueSlug(slugify(name));
  const sortOrder =
    input.sortOrder ??
    ((
      db
        .prepare(
          "SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM notification_templates"
        )
        .get() as { n: number }
    ).n);
  const res = db
    .prepare(
      `INSERT INTO notification_templates (name, slug, body, active, sort_order)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      name,
      slug,
      input.body,
      input.active === false ? 0 : 1,
      sortOrder
    );
  return getTemplate(Number(res.lastInsertRowid))!;
}

export function updateTemplate(
  id: number,
  input: NotificationTemplateInput
): NotificationTemplate | null {
  const existing = getTemplate(id);
  if (!existing) return null;
  db.prepare(
    `UPDATE notification_templates
     SET name = ?, body = ?, active = ?, sort_order = ?, updated_at = unixepoch()
     WHERE id = ?`
  ).run(
    input.name.trim(),
    input.body,
    input.active === false ? 0 : 1,
    input.sortOrder ?? existing.sortOrder,
    id
  );
  return getTemplate(id);
}

/** Soft-delete: desactiva la plantilla (`active = 0`). */
export function deleteTemplate(id: number): boolean {
  const res = db
    .prepare(
      "UPDATE notification_templates SET active = 0, updated_at = unixepoch() WHERE id = ?"
    )
    .run(id);
  return res.changes > 0;
}

export const deactivateTemplate = deleteTemplate;
