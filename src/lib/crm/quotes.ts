import db from "../db-connection";
import { broadcastDashboard } from "../ws-notify";
import { CrmError } from "./errors";
import { defaultValidUntil, lineTotal, nextQuoteNumber, quoteTotals } from "./quote-math";
import type { QuoteStatus } from "./quote-math";
import { getDeal, requireDeal } from "./pipelines";
import { getPriceList } from "./products";
import { requireProspecto } from "./prospectos";
import "./schema";
import type { Quote, QuoteInputLine, QuoteLine } from "./types";

function now(): number {
  return Math.floor(Date.now() / 1000);
}

interface QuoteRow {
  id: number;
  number: number;
  prospecto_id: number;
  prospecto_name: string;
  price_list_id: number | null;
  deal_id: number | null;
  status: QuoteStatus;
  valid_until: string | null;
  notes: string | null;
  currency: string;
  subtotal: number;
  discount_total: number;
  total: number;
  sent_at: number | null;
  pdf_path: string | null;
  created_at: number;
  updated_at: number;
}

interface LineRow {
  id: number;
  quote_id: number;
  product_id: number | null;
  name_snapshot: string;
  sku_snapshot: string | null;
  qty: number;
  unit_price: number;
  discount_pct: number;
  line_total: number;
  position: number;
}

function mapLine(row: LineRow): QuoteLine {
  return {
    id: row.id,
    quote_id: row.quote_id,
    product_id: row.product_id,
    name_snapshot: row.name_snapshot,
    sku_snapshot: row.sku_snapshot,
    qty: row.qty,
    unit_price: row.unit_price,
    discount_pct: row.discount_pct,
    line_total: row.line_total,
    position: row.position,
  };
}

function linesFor(quoteId: number): QuoteLine[] {
  return (
    db
      .prepare("SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY position, id")
      .all(quoteId) as LineRow[]
  ).map(mapLine);
}

function mapQuote(row: QuoteRow): Quote {
  return {
    id: row.id,
    number: row.number,
    prospecto_id: row.prospecto_id,
    prospecto_name: row.prospecto_name,
    price_list_id: row.price_list_id,
    deal_id: row.deal_id,
    status: row.status,
    valid_until: row.valid_until,
    notes: row.notes,
    currency: row.currency,
    subtotal: row.subtotal,
    discount_total: row.discount_total,
    total: row.total,
    sent_at: row.sent_at,
    pdf_path: row.pdf_path,
    created_at: row.created_at,
    updated_at: row.updated_at,
    lines: linesFor(row.id),
  };
}

const QUOTE_SELECT = `
  SELECT q.*, p.name AS prospecto_name
  FROM quotes q
  JOIN prospectos p ON p.id = q.prospecto_id
`;

export function getQuote(id: number): Quote | null {
  const row = db.prepare(`${QUOTE_SELECT} WHERE q.id = ?`).get(id) as
    | QuoteRow
    | undefined;
  return row ? mapQuote(row) : null;
}

export function requireQuote(id: number): Quote {
  const item = getQuote(id);
  if (!item) throw new CrmError("Cotización no encontrada", 404);
  return item;
}

function likeNeedle(search: string): string {
  return `%${search.replace(/[%_]/g, "")}%`;
}

export function listQuotes(opts: { status?: string; search?: string } = {}): Quote[] {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (opts.status) {
    clauses.push("q.status = ?");
    params.push(opts.status);
  }
  const search = (opts.search ?? "").trim();
  if (search) {
    const needle = likeNeedle(search);
    clauses.push(
      "(CAST(q.number AS TEXT) LIKE ? OR p.name LIKE ? OR IFNULL(q.notes,'') LIKE ?)",
    );
    params.push(needle, needle, needle);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(`${QUOTE_SELECT} ${where} ORDER BY q.created_at DESC, q.id DESC`)
    .all(...params) as QuoteRow[];
  return rows.map(mapQuote);
}

function computeLines(lines: QuoteInputLine[]) {
  const computed = lines.map((line, position) => {
    const qty = line.qty;
    const unitPrice = line.unit_price;
    const discountPct = line.discount_pct ?? 0;
    return {
      product_id: line.product_id ?? null,
      name_snapshot: line.name_snapshot.trim(),
      sku_snapshot: line.sku_snapshot?.trim() || null,
      qty,
      unit_price: unitPrice,
      discount_pct: discountPct,
      line_total: lineTotal(qty, unitPrice, discountPct),
      position,
    };
  });
  const totals = quoteTotals(
    computed.map((line) => ({
      qty: line.qty,
      unitPrice: line.unit_price,
      discountPct: line.discount_pct,
    })),
  );
  return { computed, totals };
}

function assertRefs(input: {
  prospecto_id: number;
  price_list_id?: number | null;
  deal_id?: number | null;
}): void {
  requireProspecto(input.prospecto_id);
  if (input.price_list_id) {
    if (!getPriceList(input.price_list_id)) {
      throw new CrmError("Lista de precios no encontrada", 404);
    }
  }
  if (input.deal_id) {
    const deal = getDeal(input.deal_id);
    if (!deal) throw new CrmError("Oportunidad no encontrada", 404);
    if (deal.prospecto_id !== input.prospecto_id) {
      throw new CrmError("La oportunidad no pertenece a ese prospecto", 400);
    }
  }
}

function replaceLines(
  quoteId: number,
  lines: ReturnType<typeof computeLines>["computed"],
): void {
  db.prepare("DELETE FROM quote_lines WHERE quote_id = ?").run(quoteId);
  const insert = db.prepare(
    `INSERT INTO quote_lines
      (quote_id, product_id, name_snapshot, sku_snapshot, qty, unit_price, discount_pct, line_total, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const line of lines) {
    insert.run(
      quoteId,
      line.product_id,
      line.name_snapshot,
      line.sku_snapshot,
      line.qty,
      line.unit_price,
      line.discount_pct,
      line.line_total,
      line.position,
    );
  }
}

export function createQuote(input: {
  prospecto_id: number;
  price_list_id?: number | null;
  deal_id?: number | null;
  valid_until?: string | null;
  notes?: string | null;
  currency?: string;
  lines: QuoteInputLine[];
}): Quote {
  assertRefs(input);
  const { computed, totals } = computeLines(input.lines);
  const maxNumber = db
    .prepare("SELECT MAX(number) AS n FROM quotes")
    .get() as { n: number | null };
  const number = nextQuoteNumber(maxNumber.n);
  const ts = now();
  const tx = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO quotes
          (number, prospecto_id, price_list_id, deal_id, status, valid_until, notes, currency,
           subtotal, discount_total, total, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        number,
        input.prospecto_id,
        input.price_list_id ?? null,
        input.deal_id ?? null,
        input.valid_until ?? defaultValidUntil(),
        input.notes?.trim() || null,
        (input.currency ?? "MXN").trim().toUpperCase() || "MXN",
        totals.subtotal,
        totals.discountTotal,
        totals.total,
        ts,
        ts,
      );
    const id = Number(result.lastInsertRowid);
    replaceLines(id, computed);
    return id;
  });
  const id = tx();
  broadcastDashboard("crm");
  return requireQuote(id);
}

export function updateQuote(
  id: number,
  input: Partial<{
    prospecto_id: number;
    price_list_id: number | null;
    deal_id: number | null;
    valid_until: string | null;
    notes: string | null;
    currency: string;
    lines: QuoteInputLine[];
  }>,
): Quote {
  const current = requireQuote(id);
  if (current.status !== "draft") {
    throw new CrmError("Solo se puede editar una cotización en borrador", 409);
  }
  const prospectoId = input.prospecto_id ?? current.prospecto_id;
  const priceListId =
    input.price_list_id !== undefined ? input.price_list_id : current.price_list_id;
  const dealId = input.deal_id !== undefined ? input.deal_id : current.deal_id;
  assertRefs({
    prospecto_id: prospectoId,
    price_list_id: priceListId,
    deal_id: dealId,
  });

  const lines = input.lines ?? current.lines;
  const { computed, totals } = computeLines(lines);

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE quotes
       SET prospecto_id = ?, price_list_id = ?, deal_id = ?, valid_until = ?, notes = ?,
           currency = ?, subtotal = ?, discount_total = ?, total = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      prospectoId,
      priceListId,
      dealId,
      input.valid_until !== undefined ? input.valid_until : current.valid_until,
      input.notes !== undefined ? input.notes?.trim() || null : current.notes,
      input.currency !== undefined
        ? input.currency.trim().toUpperCase() || "MXN"
        : current.currency,
      totals.subtotal,
      totals.discountTotal,
      totals.total,
      now(),
      id,
    );
    replaceLines(id, computed);
  });
  tx();
  broadcastDashboard("crm");
  return requireQuote(id);
}

export function changeQuoteStatus(id: number, status: QuoteStatus): Quote {
  const current = requireQuote(id);
  const allowed =
    (current.status === "sent" &&
      (status === "accepted" || status === "rejected" || status === "expired")) ||
    (current.status === "draft" && status === "expired");
  if (!allowed) {
    throw new CrmError("Transición de estado no permitida", 409);
  }

  const tx = db.transaction(() => {
    db.prepare("UPDATE quotes SET status = ?, updated_at = ? WHERE id = ?").run(
      status,
      now(),
      id,
    );
    if (status === "accepted" && current.deal_id) {
      requireDeal(current.deal_id);
      db.prepare(
        "UPDATE deals SET value = ?, updated_at = ? WHERE id = ?",
      ).run(current.total, now(), current.deal_id);
    }
  });
  tx();
  broadcastDashboard("crm");
  return requireQuote(id);
}

export function markQuoteSent(id: number, pdfPath: string): Quote {
  const current = requireQuote(id);
  if (current.status !== "draft") {
    throw new CrmError("Solo se puede enviar una cotización en borrador", 409);
  }
  const ts = now();
  db.prepare(
    `UPDATE quotes SET status = 'sent', sent_at = ?, pdf_path = ?, updated_at = ? WHERE id = ?`,
  ).run(ts, pdfPath, ts, id);
  broadcastDashboard("crm");
  return requireQuote(id);
}

export function setQuotePdfPath(id: number, pdfPath: string): Quote {
  requireQuote(id);
  db.prepare("UPDATE quotes SET pdf_path = ?, updated_at = ? WHERE id = ?").run(
    pdfPath,
    now(),
    id,
  );
  return requireQuote(id);
}
