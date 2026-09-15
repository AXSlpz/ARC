import db from "../db";
import { initPhase2Schema } from "./schema";
import type {
  FinanceCategory,
  FinanceEntry,
  FinanceKind,
  MonthlyReport,
} from "./types";

initPhase2Schema();

function mapCategory(row: {
  id: number;
  name: string;
  kind: string;
  active: number;
  created_at: number;
}): FinanceCategory {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind === "expense" ? "expense" : "income",
    active: Boolean(row.active),
    createdAt: row.created_at,
  };
}

export function listCategories(kind?: FinanceKind): FinanceCategory[] {
  const where = kind ? "WHERE kind = ?" : "";
  const rows = kind
    ? (db.prepare(`SELECT * FROM finance_categories ${where} ORDER BY name`).all(kind) as never[])
    : (db.prepare("SELECT * FROM finance_categories ORDER BY kind, name").all() as never[]);
  return (rows as Array<Parameters<typeof mapCategory>[0]>).map(mapCategory);
}

export function createCategory(name: string, kind: FinanceKind): FinanceCategory | null {
  const clean = name.trim();
  if (!clean) return null;
  try {
    const res = db
      .prepare("INSERT INTO finance_categories (name, kind) VALUES (?, ?)")
      .run(clean, kind);
    const row = db
      .prepare("SELECT * FROM finance_categories WHERE id = ?")
      .get(res.lastInsertRowid) as Parameters<typeof mapCategory>[0];
    return mapCategory(row);
  } catch {
    return null;
  }
}

export function deleteCategory(id: number): boolean {
  const used = db
    .prepare("SELECT COUNT(*) AS n FROM finance_entries WHERE category_id = ?")
    .get(id) as { n: number };
  if (used.n > 0) {
    db.prepare("UPDATE finance_categories SET active = 0 WHERE id = ?").run(id);
    return false;
  }
  const res = db.prepare("DELETE FROM finance_categories WHERE id = ?").run(id);
  return res.changes > 0;
}

interface EntryRow {
  id: number;
  kind: string;
  category_id: number | null;
  category_name: string | null;
  amount_cents: number;
  description: string | null;
  occurred_on: string;
  method: string | null;
  reference: string | null;
  created_by: string | null;
  created_at: number;
}

function mapEntry(row: EntryRow): FinanceEntry {
  return {
    id: row.id,
    kind: row.kind === "expense" ? "expense" : "income",
    categoryId: row.category_id,
    categoryName: row.category_name,
    amountCents: row.amount_cents,
    description: row.description,
    occurredOn: row.occurred_on,
    method: row.method,
    reference: row.reference,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

const ENTRY_SELECT = `
  SELECT e.*, c.name AS category_name
  FROM finance_entries e
  LEFT JOIN finance_categories c ON c.id = e.category_id
`;

export interface EntryFilters {
  month?: string; // YYYY-MM
  kind?: FinanceKind;
}

export function listEntries(filters: EntryFilters = {}): FinanceEntry[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters.month && /^\d{4}-\d{2}$/.test(filters.month)) {
    clauses.push("substr(e.occurred_on, 1, 7) = ?");
    params.push(filters.month);
  }
  if (filters.kind) {
    clauses.push("e.kind = ?");
    params.push(filters.kind);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(`${ENTRY_SELECT} ${where} ORDER BY e.occurred_on DESC, e.id DESC`)
    .all(...params) as EntryRow[];
  return rows.map(mapEntry);
}

export interface CreateEntryInput {
  kind: FinanceKind;
  categoryId?: number | null;
  amountCents: number;
  description?: string | null;
  occurredOn: string;
  method?: string | null;
  reference?: string | null;
  createdBy?: string | null;
}

export type CreateEntryResult =
  | { ok: true; entry: FinanceEntry }
  | { ok: false; error: string };

export function createEntry(input: CreateEntryInput): CreateEntryResult {
  if (input.kind !== "income" && input.kind !== "expense") {
    return { ok: false, error: "Tipo inválido." };
  }
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
    return { ok: false, error: "El monto debe ser mayor a 0." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn)) {
    return { ok: false, error: "Fecha inválida (usa YYYY-MM-DD)." };
  }
  const res = db
    .prepare(
      `INSERT INTO finance_entries
         (kind, category_id, amount_cents, description, occurred_on, method, reference, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.kind,
      input.categoryId ?? null,
      Math.round(input.amountCents),
      input.description?.trim() || null,
      input.occurredOn,
      input.method?.trim() || null,
      input.reference?.trim() || null,
      input.createdBy ?? null
    );
  const row = db
    .prepare(`${ENTRY_SELECT} WHERE e.id = ?`)
    .get(res.lastInsertRowid) as EntryRow;
  return { ok: true, entry: mapEntry(row) };
}

export function deleteEntry(id: number): boolean {
  const res = db.prepare("DELETE FROM finance_entries WHERE id = ?").run(id);
  return res.changes > 0;
}

export function monthlyReport(month: string): MonthlyReport {
  const safeMonth = /^\d{4}-\d{2}$/.test(month) ? month : currentMonth();
  const totals = db
    .prepare(
      `SELECT kind, COALESCE(SUM(amount_cents), 0) AS total
       FROM finance_entries WHERE substr(occurred_on, 1, 7) = ?
       GROUP BY kind`
    )
    .all(safeMonth) as Array<{ kind: string; total: number }>;

  let income = 0;
  let expense = 0;
  for (const t of totals) {
    if (t.kind === "income") income = t.total;
    else if (t.kind === "expense") expense = t.total;
  }

  const byCat = db
    .prepare(
      `SELECT e.category_id AS categoryId, e.kind AS kind,
              COALESCE(c.name, 'Sin categoría') AS categoryName,
              COALESCE(SUM(e.amount_cents), 0) AS totalCents
       FROM finance_entries e
       LEFT JOIN finance_categories c ON c.id = e.category_id
       WHERE substr(e.occurred_on, 1, 7) = ?
       GROUP BY e.category_id, e.kind
       ORDER BY e.kind, totalCents DESC`
    )
    .all(safeMonth) as Array<{
    categoryId: number | null;
    kind: string;
    categoryName: string;
    totalCents: number;
  }>;

  return {
    month: safeMonth,
    totalIncomeCents: income,
    totalExpenseCents: expense,
    balanceCents: income - expense,
    byCategory: byCat.map((r) => ({
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      kind: r.kind === "expense" ? "expense" : "income",
      totalCents: r.totalCents,
    })),
  };
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
