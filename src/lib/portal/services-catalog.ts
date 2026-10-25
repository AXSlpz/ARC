/**
 * Catálogo de servicios ARC para el portal de residentes.
 *
 * Lee productos CRM activos y los cruza con la lista de precios configurada
 * para el portal. Nunca expone costos internos ni PII.
 *
 * Lógica de selección de lista de precios (determinista):
 *   1. Si hay una fila en portal_service_config con key='portal_price_list_id' → usa ese ID.
 *   2. Si no, usa el fallback que el llamador provee (típicamente la lista is_default=1).
 *
 * Si el producto está activo pero no tiene precio en la lista seleccionada
 * → priceMode='custom_quote', unitPrice=null ("Cotización personalizada").
 */

import db from "../db-connection";
import { initPhase4Schema } from "./schema-phase4";

initPhase4Schema();

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type PriceMode = "priced" | "custom_quote";

export interface ServiceCatalogItem {
  productId: number;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  priceMode: PriceMode;
  /** null cuando priceMode='custom_quote' */
  unitPrice: number | null;
  currency: string;
}

// ── Config de lista de precio ─────────────────────────────────────────────────

/**
 * Retorna el ID de la lista de precios configurada para el portal.
 * Si no hay config explícita, retorna `defaultFallback`.
 */
export function getPortalPriceListId(defaultFallback: number): number {
  const row = db
    .prepare(
      "SELECT value FROM portal_service_config WHERE key = 'portal_price_list_id'"
    )
    .get() as { value: string } | undefined;

  if (row) {
    const parsed = Number(row.value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }

  return defaultFallback;
}

/**
 * Persiste la lista de precio a usar en el portal (configurable por admin).
 */
export function setPortalPriceListId(priceListId: number): void {
  db.prepare(
    `INSERT INTO portal_service_config (key, value, updated_at)
     VALUES ('portal_price_list_id', ?, unixepoch())
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(String(priceListId));
}

/**
 * Retorna el ID de la lista de precios is_default=1, o null si no existe.
 */
export function getDefaultPriceListId(): number | null {
  const row = db
    .prepare("SELECT id FROM price_lists WHERE is_default = 1 LIMIT 1")
    .get() as { id: number } | undefined;
  return row?.id ?? null;
}

// ── Catálogo ──────────────────────────────────────────────────────────────────

interface CatalogRow {
  product_id: number;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  unit_price: number | null;
  currency: string;
}

/**
 * Lista todos los productos activos con su precio en la lista especificada.
 *
 * @param priceListId  ID de la price_list a usar (puede ser la default o una configurada).
 * @param search       Filtro opcional de texto (nombre, SKU, descripción).
 */
export function listServicesForPortal(
  priceListId: number,
  search?: string
): ServiceCatalogItem[] {
  let where = "WHERE p.status = 'active' AND p.active = 1";
  const params: (string | number)[] = [priceListId];

  if (search?.trim()) {
    const needle = `%${search.trim().replace(/[%_]/g, "")}%`;
    where += " AND (p.name LIKE ? OR p.sku LIKE ? OR IFNULL(p.description,'') LIKE ?)";
    params.push(needle, needle, needle);
  }

  const rows = db
    .prepare(
      `SELECT
         p.id          AS product_id,
         p.sku,
         p.name,
         p.description,
         p.unit,
         pli.unit_price,
         COALESCE(pl.currency, 'MXN') AS currency
       FROM products p
       LEFT JOIN price_list_items pli
         ON pli.product_id = p.id
         AND pli.price_list_id = ?
       LEFT JOIN price_lists pl
         ON pl.id = pli.price_list_id
       ${where}
       ORDER BY p.name COLLATE NOCASE, p.id`
    )
    .all(...params) as CatalogRow[];

  return rows.map((r): ServiceCatalogItem => {
    const hasPrice =
      r.unit_price !== null &&
      r.unit_price !== undefined &&
      Number.isFinite(r.unit_price);

    return {
      productId: r.product_id,
      sku: r.sku,
      name: r.name,
      description: r.description,
      unit: r.unit,
      priceMode: hasPrice ? "priced" : "custom_quote",
      unitPrice: hasPrice ? r.unit_price : null,
      currency: r.currency,
    };
  });
}

/**
 * Obtiene UN servicio del catálogo por productId.
 * Retorna null si el producto no existe o no está activo.
 */
export function getServiceForPortal(
  productId: number,
  priceListId: number
): ServiceCatalogItem | null {
  const row = db
    .prepare(
      `SELECT
         p.id          AS product_id,
         p.sku,
         p.name,
         p.description,
         p.unit,
         pli.unit_price,
         COALESCE(pl.currency, 'MXN') AS currency
       FROM products p
       LEFT JOIN price_list_items pli
         ON pli.product_id = p.id
         AND pli.price_list_id = ?
       LEFT JOIN price_lists pl
         ON pl.id = pli.price_list_id
       WHERE p.id = ? AND p.status = 'active' AND p.active = 1`
    )
    .get(priceListId, productId) as CatalogRow | undefined;

  if (!row) return null;

  const hasPrice =
    row.unit_price !== null &&
    row.unit_price !== undefined &&
    Number.isFinite(row.unit_price);

  return {
    productId: row.product_id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    unit: row.unit,
    priceMode: hasPrice ? "priced" : "custom_quote",
    unitPrice: hasPrice ? row.unit_price : null,
    currency: row.currency,
  };
}
