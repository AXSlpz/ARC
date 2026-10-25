import db from "../db-connection";
import { broadcastDashboard } from "../ws-notify";
import { CrmError, isSqliteUniqueViolation } from "./errors";
import { isValidProspectoPhone, normalizeProspectoPhone } from "./phone";
import "./schema";
import type { Prospecto, ProspectoList } from "./types";

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 20);
  } catch {
    return [];
  }
}

interface ProspectoRow {
  id: number;
  name: string;
  phone: string;
  phone_normalized: string;
  email: string | null;
  company: string | null;
  notes: string | null;
  tags_json: string | null;
  created_at: number;
  updated_at: number;
}

function mapProspecto(row: ProspectoRow): Prospecto {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    phone_normalized: row.phone_normalized,
    email: row.email,
    company: row.company,
    notes: row.notes,
    tags: parseTags(row.tags_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function likeNeedle(search: string): string {
  return `%${search.replace(/[%_]/g, "")}%`;
}

export function getProspecto(id: number): Prospecto | null {
  const row = db
    .prepare("SELECT * FROM prospectos WHERE id = ?")
    .get(id) as ProspectoRow | undefined;
  return row ? mapProspecto(row) : null;
}

export function requireProspecto(id: number): Prospecto {
  const item = getProspecto(id);
  if (!item) throw new CrmError("Prospecto no encontrado", 404);
  return item;
}

export function listProspectos(opts: {
  search?: string;
  page?: number;
  limit?: number;
}): ProspectoList {
  const page = Math.max(1, Math.trunc(opts.page ?? 1));
  const limit = Math.min(100, Math.max(1, Math.trunc(opts.limit ?? 20)));
  const offset = (page - 1) * limit;
  const search = (opts.search ?? "").trim();

  let where = "";
  const params: Array<string | number> = [];
  if (search) {
    const needle = likeNeedle(search);
    where =
      "WHERE name LIKE ? OR phone LIKE ? OR phone_normalized LIKE ? OR IFNULL(email,'') LIKE ? OR IFNULL(company,'') LIKE ?";
    params.push(needle, needle, needle, needle, needle);
  }

  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM prospectos ${where}`).get(...params) as {
      n: number;
    }
  ).n;

  const rows = db
    .prepare(
      `SELECT * FROM prospectos ${where} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as ProspectoRow[];

  return {
    data: rows.map(mapProspecto),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit) || 1),
  };
}

export function createProspecto(input: {
  name: string;
  phone: string;
  email?: string | null;
  company?: string | null;
  notes?: string | null;
  tags?: string[];
}): Prospecto {
  const phoneNormalized = normalizeProspectoPhone(input.phone);
  if (!isValidProspectoPhone(phoneNormalized)) {
    throw new CrmError("Teléfono inválido");
  }
  const ts = now();
  try {
    const result = db
      .prepare(
        `INSERT INTO prospectos
          (name, phone, phone_normalized, email, company, notes, tags_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.name.trim(),
        input.phone.trim(),
        phoneNormalized,
        input.email?.trim() || null,
        input.company?.trim() || null,
        input.notes?.trim() || null,
        JSON.stringify(input.tags ?? []),
        ts,
        ts,
      );
    broadcastDashboard("crm");
    return requireProspecto(Number(result.lastInsertRowid));
  } catch (err) {
    if (isSqliteUniqueViolation(err)) {
      throw new CrmError("Ya existe un prospecto con ese teléfono", 409);
    }
    throw err;
  }
}

export function updateProspecto(
  id: number,
  input: Partial<{
    name: string;
    phone: string;
    email: string | null;
    company: string | null;
    notes: string | null;
    tags: string[];
  }>,
): Prospecto {
  const current = requireProspecto(id);
  const name = input.name !== undefined ? input.name.trim() : current.name;
  const phone = input.phone !== undefined ? input.phone.trim() : current.phone;
  const phoneNormalized =
    input.phone !== undefined
      ? normalizeProspectoPhone(input.phone)
      : current.phone_normalized;
  if (input.phone !== undefined && !isValidProspectoPhone(phoneNormalized)) {
    throw new CrmError("Teléfono inválido");
  }
  const email =
    input.email !== undefined ? input.email?.trim() || null : current.email;
  const company =
    input.company !== undefined ? input.company?.trim() || null : current.company;
  const notes =
    input.notes !== undefined ? input.notes?.trim() || null : current.notes;
  const tags = input.tags !== undefined ? input.tags : current.tags;

  try {
    db.prepare(
      `UPDATE prospectos
       SET name = ?, phone = ?, phone_normalized = ?, email = ?, company = ?, notes = ?, tags_json = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      name,
      phone,
      phoneNormalized,
      email,
      company,
      notes,
      JSON.stringify(tags),
      now(),
      id,
    );
  } catch (err) {
    if (isSqliteUniqueViolation(err)) {
      throw new CrmError("Ya existe un prospecto con ese teléfono", 409);
    }
    throw err;
  }
  broadcastDashboard("crm");
  return requireProspecto(id);
}

export function deleteProspecto(id: number): void {
  requireProspecto(id);
  const deals = db
    .prepare("SELECT COUNT(*) AS n FROM deals WHERE prospecto_id = ?")
    .get(id) as { n: number };
  const quotes = db
    .prepare("SELECT COUNT(*) AS n FROM quotes WHERE prospecto_id = ?")
    .get(id) as { n: number };
  if (deals.n > 0 || quotes.n > 0) {
    throw new CrmError(
      "No se puede eliminar: el prospecto tiene oportunidades o cotizaciones",
      409,
    );
  }
  db.prepare("DELETE FROM prospectos WHERE id = ?").run(id);
  broadcastDashboard("crm");
}
