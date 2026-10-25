import db from "../db-connection";
import { broadcastDashboard } from "../ws-notify";
import {
  normalizeSku,
  parseProductStatus,
  parseProductUnit,
  statusToActive,
  type ProductStatus,
} from "./catalog";
import { CrmError, isSqliteUniqueViolation } from "./errors";
import "./schema";
import type { PriceList, PriceListItem, Product } from "./types";

function now(): number {
  return Math.floor(Date.now() / 1000);
}

interface ProductRow {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  status: string;
  active: number;
  created_at: number;
  updated_at: number;
}

function mapProduct(row: ProductRow): Product {
  const status = parseProductStatus(row.status, Boolean(row.active));
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    unit: row.unit,
    status,
    active: Boolean(row.active),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function likeNeedle(search: string): string {
  return `%${search.replace(/[%_]/g, "")}%`;
}

export function getProduct(id: number): Product | null {
  const row = db
    .prepare("SELECT * FROM products WHERE id = ?")
    .get(id) as ProductRow | undefined;
  return row ? mapProduct(row) : null;
}

export function requireProduct(id: number): Product {
  const item = getProduct(id);
  if (!item) throw new CrmError("Producto no encontrado", 404);
  return item;
}

export function listProducts(opts: { search?: string; status?: string } = {}): Product[] {
  const clauses: string[] = [];
  const params: string[] = [];
  const search = (opts.search ?? "").trim();
  if (search) {
    const needle = likeNeedle(search);
    clauses.push("(name LIKE ? OR sku LIKE ? OR IFNULL(description,'') LIKE ?)");
    params.push(needle, needle, needle);
  }
  if (opts.status) {
    const status = parseProductStatus(opts.status);
    clauses.push("status = ?");
    params.push(status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT * FROM products ${where} ORDER BY name COLLATE NOCASE, id`)
    .all(...params) as ProductRow[];
  return rows.map(mapProduct);
}

export function createProduct(input: {
  sku: string;
  name: string;
  description?: string | null;
  unit?: string;
  status?: ProductStatus;
}): Product {
  const sku = normalizeSku(input.sku);
  if (!sku) throw new CrmError("El SKU es obligatorio");
  const status = parseProductStatus(input.status);
  const active = statusToActive(status) ? 1 : 0;
  const ts = now();
  try {
    const result = db
      .prepare(
        `INSERT INTO products (sku, name, description, unit, status, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        sku,
        input.name.trim(),
        input.description?.trim() || null,
        parseProductUnit(input.unit),
        status,
        active,
        ts,
        ts,
      );
    broadcastDashboard("crm");
    return requireProduct(Number(result.lastInsertRowid));
  } catch (err) {
    if (isSqliteUniqueViolation(err)) {
      throw new CrmError("Ya existe un producto con ese SKU", 409);
    }
    throw err;
  }
}

export function updateProduct(
  id: number,
  input: Partial<{
    sku: string;
    name: string;
    description: string | null;
    unit: string;
    status: ProductStatus;
  }>,
): Product {
  const current = requireProduct(id);
  const sku = input.sku !== undefined ? normalizeSku(input.sku) : current.sku;
  if (!sku) throw new CrmError("El SKU es obligatorio");
  const status =
    input.status !== undefined ? parseProductStatus(input.status) : current.status;
  const active = statusToActive(status) ? 1 : 0;
  try {
    db.prepare(
      `UPDATE products
       SET sku = ?, name = ?, description = ?, unit = ?, status = ?, active = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      sku,
      input.name !== undefined ? input.name.trim() : current.name,
      input.description !== undefined
        ? input.description?.trim() || null
        : current.description,
      input.unit !== undefined ? parseProductUnit(input.unit) : current.unit,
      status,
      active,
      now(),
      id,
    );
  } catch (err) {
    if (isSqliteUniqueViolation(err)) {
      throw new CrmError("Ya existe un producto con ese SKU", 409);
    }
    throw err;
  }
  broadcastDashboard("crm");
  return requireProduct(id);
}

export function deleteProduct(id: number): Product | void {
  requireProduct(id);
  const used = db
    .prepare("SELECT COUNT(*) AS n FROM quote_lines WHERE product_id = ?")
    .get(id) as { n: number };
  if (used.n > 0) {
    return updateProduct(id, { status: "inactive" });
  }
  db.prepare("DELETE FROM products WHERE id = ?").run(id);
  broadcastDashboard("crm");
}

interface PriceListRow {
  id: number;
  name: string;
  currency: string;
  is_default: number;
  valid_from: string | null;
  valid_until: string | null;
  created_at: number;
  updated_at: number;
}

function mapPriceList(row: PriceListRow, items: PriceListItem[]): PriceList {
  return {
    id: row.id,
    name: row.name,
    currency: row.currency,
    is_default: Boolean(row.is_default),
    valid_from: row.valid_from,
    valid_until: row.valid_until,
    created_at: row.created_at,
    updated_at: row.updated_at,
    items,
  };
}

function listItemsFor(priceListId: number): PriceListItem[] {
  return db
    .prepare(
      `SELECT i.product_id, i.unit_price, p.sku, p.name
       FROM price_list_items i
       JOIN products p ON p.id = i.product_id
       WHERE i.price_list_id = ?
       ORDER BY p.name COLLATE NOCASE`,
    )
    .all(priceListId) as PriceListItem[];
}

export function listPriceLists(): PriceList[] {
  const rows = db
    .prepare("SELECT * FROM price_lists ORDER BY is_default DESC, name COLLATE NOCASE")
    .all() as PriceListRow[];
  return rows.map((row) => mapPriceList(row, listItemsFor(row.id)));
}

export function getPriceList(id: number): PriceList | null {
  const row = db
    .prepare("SELECT * FROM price_lists WHERE id = ?")
    .get(id) as PriceListRow | undefined;
  return row ? mapPriceList(row, listItemsFor(row.id)) : null;
}

export function requirePriceList(id: number): PriceList {
  const item = getPriceList(id);
  if (!item) throw new CrmError("Lista de precios no encontrada", 404);
  return item;
}

function clearOtherDefaults(keepId?: number): void {
  if (keepId) {
    db.prepare("UPDATE price_lists SET is_default = 0 WHERE id != ?").run(keepId);
  } else {
    db.prepare("UPDATE price_lists SET is_default = 0").run();
  }
}

export function createPriceList(input: {
  name: string;
  currency?: string;
  is_default?: boolean;
  valid_from?: string | null;
  valid_until?: string | null;
}): PriceList {
  const ts = now();
  const isDefault = Boolean(input.is_default);
  const tx = db.transaction(() => {
    if (isDefault) clearOtherDefaults();
    const result = db
      .prepare(
        `INSERT INTO price_lists (name, currency, is_default, valid_from, valid_until, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.name.trim(),
        (input.currency ?? "MXN").trim().toUpperCase() || "MXN",
        isDefault ? 1 : 0,
        input.valid_from ?? null,
        input.valid_until ?? null,
        ts,
        ts,
      );
    return Number(result.lastInsertRowid);
  });
  const id = tx();
  broadcastDashboard("crm");
  return requirePriceList(id);
}

export function updatePriceList(
  id: number,
  input: Partial<{
    name: string;
    currency: string;
    is_default: boolean;
    valid_from: string | null;
    valid_until: string | null;
  }>,
): PriceList {
  const current = requirePriceList(id);
  const tx = db.transaction(() => {
    const isDefault =
      input.is_default !== undefined ? Boolean(input.is_default) : current.is_default;
    if (isDefault) clearOtherDefaults(id);
    db.prepare(
      `UPDATE price_lists
       SET name = ?, currency = ?, is_default = ?, valid_from = ?, valid_until = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      input.name !== undefined ? input.name.trim() : current.name,
      input.currency !== undefined
        ? input.currency.trim().toUpperCase() || "MXN"
        : current.currency,
      isDefault ? 1 : 0,
      input.valid_from !== undefined ? input.valid_from : current.valid_from,
      input.valid_until !== undefined ? input.valid_until : current.valid_until,
      now(),
      id,
    );
  });
  tx();
  broadcastDashboard("crm");
  return requirePriceList(id);
}

export function deletePriceList(id: number): void {
  requirePriceList(id);
  const used = db
    .prepare("SELECT COUNT(*) AS n FROM quotes WHERE price_list_id = ?")
    .get(id) as { n: number };
  if (used.n > 0) {
    throw new CrmError(
      "No se puede eliminar: la lista está usada en cotizaciones",
      409,
    );
  }
  db.prepare("DELETE FROM price_lists WHERE id = ?").run(id);
  broadcastDashboard("crm");
}

export function upsertPriceListItem(
  priceListId: number,
  productId: number,
  unitPrice: number,
): PriceList {
  requirePriceList(priceListId);
  requireProduct(productId);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new CrmError("El precio no puede ser negativo");
  }
  db.prepare(
    `INSERT INTO price_list_items (price_list_id, product_id, unit_price)
     VALUES (?, ?, ?)
     ON CONFLICT(price_list_id, product_id) DO UPDATE SET unit_price = excluded.unit_price`,
  ).run(priceListId, productId, unitPrice);
  broadcastDashboard("crm");
  return requirePriceList(priceListId);
}
