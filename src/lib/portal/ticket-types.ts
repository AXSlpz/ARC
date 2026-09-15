import db from "../db";
import { initPhase2Schema } from "./schema";
import { FIELD_TYPES } from "./types";
import type { FieldType, TicketType, TicketTypeField } from "./types";

initPhase2Schema();

interface TypeRow {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  active: number;
  letter_template: string | null;
  sort_order: number;
  created_at: number;
}

interface FieldRow {
  id: number;
  ticket_type_id: number;
  label: string;
  field_key: string;
  field_type: string;
  options: string | null;
  placeholder: string | null;
  required: number;
  sort_order: number;
}

function mapField(row: FieldRow): TicketTypeField {
  let options: string[] | null = null;
  if (row.options) {
    try {
      const parsed = JSON.parse(row.options);
      if (Array.isArray(parsed)) options = parsed.map(String);
    } catch {
      options = null;
    }
  }
  return {
    id: row.id,
    ticketTypeId: row.ticket_type_id,
    label: row.label,
    fieldKey: row.field_key,
    fieldType: (FIELD_TYPES as string[]).includes(row.field_type)
      ? (row.field_type as FieldType)
      : "text",
    options,
    placeholder: row.placeholder,
    required: Boolean(row.required),
    sortOrder: row.sort_order,
  };
}

function mapType(row: TypeRow): TicketType {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    active: Boolean(row.active),
    letterTemplate: row.letter_template,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export function listFieldsForType(typeId: number): TicketTypeField[] {
  const rows = db
    .prepare(
      "SELECT * FROM ticket_type_fields WHERE ticket_type_id = ? ORDER BY sort_order, id"
    )
    .all(typeId) as FieldRow[];
  return rows.map(mapField);
}

export function listTicketTypes(opts: { activeOnly?: boolean } = {}): TicketType[] {
  const where = opts.activeOnly ? "WHERE active = 1" : "";
  const rows = db
    .prepare(`SELECT * FROM ticket_types ${where} ORDER BY sort_order, name`)
    .all() as TypeRow[];
  return rows.map((r) => {
    const type = mapType(r);
    type.fields = listFieldsForType(r.id);
    return type;
  });
}

export function getTicketType(id: number): TicketType | null {
  const row = db.prepare("SELECT * FROM ticket_types WHERE id = ?").get(id) as
    | TypeRow
    | undefined;
  if (!row) return null;
  const type = mapType(row);
  type.fields = listFieldsForType(row.id);
  return type;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function uniqueSlug(base: string): string {
  let slug = base || "tipo";
  let n = 1;
  while (
    db.prepare("SELECT id FROM ticket_types WHERE slug = ?").get(slug) as
      | { id: number }
      | undefined
  ) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

function normalizeKey(input: string, fallback: number): string {
  const key = slugify(input).replace(/-/g, "_");
  return key || `campo_${fallback}`;
}

export interface FieldInput {
  label: string;
  fieldKey?: string;
  fieldType: FieldType;
  options?: string[] | null;
  placeholder?: string | null;
  required?: boolean;
}

export interface TicketTypeInput {
  name: string;
  description?: string | null;
  active?: boolean;
  letterTemplate?: string | null;
  fields: FieldInput[];
}

function replaceFields(typeId: number, fields: FieldInput[]): void {
  db.prepare("DELETE FROM ticket_type_fields WHERE ticket_type_id = ?").run(typeId);
  const insert = db.prepare(
    `INSERT INTO ticket_type_fields
       (ticket_type_id, label, field_key, field_type, options, placeholder, required, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const seen = new Set<string>();
  fields.forEach((f, idx) => {
    let key = (f.fieldKey && slugify(f.fieldKey).replace(/-/g, "_")) ||
      normalizeKey(f.label, idx + 1);
    while (seen.has(key)) key = `${key}_${idx + 1}`;
    seen.add(key);
    const options =
      f.fieldType === "select" && f.options && f.options.length > 0
        ? JSON.stringify(f.options.map((o) => o.trim()).filter(Boolean))
        : null;
    insert.run(
      typeId,
      f.label.trim(),
      key,
      f.fieldType,
      options,
      f.placeholder?.trim() || null,
      f.required ? 1 : 0,
      idx + 1
    );
  });
}

export function createTicketType(input: TicketTypeInput): TicketType {
  const name = input.name.trim();
  const slug = uniqueSlug(slugify(name));
  const tx = db.transaction(() => {
    const res = db
      .prepare(
        `INSERT INTO ticket_types (name, slug, description, active, letter_template, sort_order)
         VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM ticket_types))`
      )
      .run(
        name,
        slug,
        input.description?.trim() || null,
        input.active === false ? 0 : 1,
        input.letterTemplate?.trim() || null
      );
    const typeId = Number(res.lastInsertRowid);
    replaceFields(typeId, input.fields ?? []);
    return typeId;
  });
  const id = tx();
  return getTicketType(id)!;
}

export function updateTicketType(
  id: number,
  input: TicketTypeInput
): TicketType | null {
  const existing = db.prepare("SELECT id FROM ticket_types WHERE id = ?").get(id);
  if (!existing) return null;
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE ticket_types
       SET name = ?, description = ?, active = ?, letter_template = ?
       WHERE id = ?`
    ).run(
      input.name.trim(),
      input.description?.trim() || null,
      input.active === false ? 0 : 1,
      input.letterTemplate?.trim() || null,
      id
    );
    replaceFields(id, input.fields ?? []);
  });
  tx();
  return getTicketType(id);
}

export function deleteTicketType(id: number): boolean {
  const used = db
    .prepare("SELECT COUNT(*) AS n FROM tickets WHERE ticket_type_id = ?")
    .get(id) as { n: number };
  if (used.n > 0) {
    // No borrar si tiene tickets: se desactiva.
    db.prepare("UPDATE ticket_types SET active = 0 WHERE id = ?").run(id);
    return false;
  }
  const res = db.prepare("DELETE FROM ticket_types WHERE id = ?").run(id);
  return res.changes > 0;
}
