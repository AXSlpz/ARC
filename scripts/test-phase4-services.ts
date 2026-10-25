/**
 * Tests Fase 4 – Servicios ARC (Portal)
 *
 * Corre con: npx tsx --test scripts/test-phase4-services.ts
 *
 * Cubre (TDD):
 * 1. Catálogo solo muestra productos activos del CRM
 * 2. Producto inactivo NO aparece en el catálogo
 * 3. Sin precio en lista → priceMode='custom_quote', unitPrice=null
 * 4. Con precio en lista default → priceMode='priced', unitPrice=N
 * 5. Lista de precio configurable por admin (portal_service_config)
 * 6. Precio cliente ignorado (servidor re-carga precio)
 * 7. Snapshot correcto en ticket_values (product_id, sku, name, currency, amount, mode)
 * 8. Sin precio → snapshot indica custom_quote
 * 9. Claim pending/conflict → ticket 'held'
 * 10. Claim approved → ticket 'nuevo'
 * 11. Producto inactivo → submit rechazado
 * 12. request_kind='service_arc' persistido en tickets
 * 13. Tipo de ticket 'servicio-arc' existe y está activo
 * 14. Búsqueda filtra por nombre/descripción
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import db from "../src/lib/db-connection.js";

// ── Imports de dominio ────────────────────────────────────────────────────────
import { initPhase4Schema } from "../src/lib/portal/schema-phase4.js";
import {
  listServicesForPortal,
  getPortalPriceListId,
  setPortalPriceListId,
  type ServiceCatalogItem,
} from "../src/lib/portal/services-catalog.js";
import {
  createServiceTicket,
  type ServiceTicketInput,
} from "../src/lib/portal/service-submit.js";

// ── Fixtures globales ─────────────────────────────────────────────────────────

const TS = Date.now();
let userId1 = 0; // usuario con claim approved
let userId2 = 0; // usuario con claim pending
let userId3 = 0; // usuario sin claim

let productActiveId = 0;
let productInactiveId = 0;
let productNoPriceId = 0;

let priceListDefaultId = 0;
let priceListAltId = 0;

let ticketTypeServiceId = 0;

// ── Setup ─────────────────────────────────────────────────────────────────────

before(() => {
  initPhase4Schema();

  // Usuarios de prueba
  const u1 = db
    .prepare(
      "INSERT INTO portal_users (name, email, password_hash, active) VALUES (?, ?, 'x', 1)"
    )
    .run(`Residente Aprobado ${TS}`, `approved-${TS}@arc.test`);
  userId1 = Number(u1.lastInsertRowid);

  const u2 = db
    .prepare(
      "INSERT INTO portal_users (name, email, password_hash, active) VALUES (?, ?, 'x', 1)"
    )
    .run(`Residente Pendiente ${TS}`, `pending-${TS}@arc.test`);
  userId2 = Number(u2.lastInsertRowid);

  const u3 = db
    .prepare(
      "INSERT INTO portal_users (name, email, password_hash, active) VALUES (?, ?, 'x', 1)"
    )
    .run(`Sin Claim ${TS}`, `noclaim-${TS}@arc.test`);
  userId3 = Number(u3.lastInsertRowid);

  // Desarrollo de prueba
  const devRow = db
    .prepare(
      "INSERT INTO developments (name, slug, city, active) VALUES (?, ?, NULL, 1)"
    )
    .run(`TestDev ${TS}`, `testdev-p4-${TS}`);
  const devId = Number(devRow.lastInsertRowid);

  // Claim APPROVED para userId1
  db.prepare(
    `INSERT INTO property_claims
       (development_id, portal_user_id, property_identifier, status)
     VALUES (?, ?, 'B-202', 'approved')`
  ).run(devId, userId1);

  // Claim PENDING para userId2
  db.prepare(
    `INSERT INTO property_claims
       (development_id, portal_user_id, property_identifier, status)
     VALUES (?, ?, 'C-303', 'pending')`
  ).run(devId, userId2);

  // Productos CRM
  const now = Math.floor(Date.now() / 1000);

  const pActive = db
    .prepare(
      `INSERT INTO products (sku, name, description, unit, status, active, created_at, updated_at)
       VALUES (?, ?, ?, 'servicio', 'active', 1, ?, ?)`
    )
    .run(`SRV-ACTIVE-${TS}`, `Servicio Activo ${TS}`, "Descripción del servicio activo", now, now);
  productActiveId = Number(pActive.lastInsertRowid);

  const pInactive = db
    .prepare(
      `INSERT INTO products (sku, name, description, unit, status, active, created_at, updated_at)
       VALUES (?, ?, ?, 'servicio', 'inactive', 0, ?, ?)`
    )
    .run(`SRV-INACTIVE-${TS}`, `Servicio Inactivo ${TS}`, "No debe aparecer", now, now);
  productInactiveId = Number(pInactive.lastInsertRowid);

  const pNoPrice = db
    .prepare(
      `INSERT INTO products (sku, name, description, unit, status, active, created_at, updated_at)
       VALUES (?, ?, ?, 'proyecto', 'active', 1, ?, ?)`
    )
    .run(`SRV-NOPRICE-${TS}`, `Servicio Sin Precio ${TS}`, "Bajo proyecto", now, now);
  productNoPriceId = Number(pNoPrice.lastInsertRowid);

  // Lista de precios DEFAULT
  const listDefault = db
    .prepare(
      `INSERT INTO price_lists (name, currency, is_default, created_at, updated_at)
       VALUES ('Lista Test Default ${TS}', 'MXN', 0, ?, ?)`
    )
    .run(now, now);
  priceListDefaultId = Number(listDefault.lastInsertRowid);

  // Precio para productActive en lista default: $1,500
  db.prepare(
    `INSERT INTO price_list_items (price_list_id, product_id, unit_price)
     VALUES (?, ?, ?)`
  ).run(priceListDefaultId, productActiveId, 1500.0);

  // Lista alternativa (para test de config)
  const listAlt = db
    .prepare(
      `INSERT INTO price_lists (name, currency, is_default, created_at, updated_at)
       VALUES ('Lista Alt ${TS}', 'USD', 0, ?, ?)`
    )
    .run(now, now);
  priceListAltId = Number(listAlt.lastInsertRowid);

  // Precio para productActive en lista alt: $75
  db.prepare(
    `INSERT INTO price_list_items (price_list_id, product_id, unit_price)
     VALUES (?, ?, ?)`
  ).run(priceListAltId, productActiveId, 75.0);

  // Ticket type servicio-arc (seed via schema)
  const ttRow = db
    .prepare("SELECT id FROM ticket_types WHERE slug = 'servicio-arc'")
    .get() as { id: number } | undefined;
  assert.ok(ttRow, "El seed de ticket_type 'servicio-arc' debe existir tras initPhase4Schema");
  ticketTypeServiceId = ttRow.id;
});

after(() => {
  // Limpieza: borrar usuarios de prueba (cascade borrará claims y tickets)
  db.prepare("DELETE FROM portal_users WHERE id IN (?, ?, ?)").run(
    userId1,
    userId2,
    userId3
  );
  // Limpiar productos de prueba
  db.prepare("DELETE FROM products WHERE id IN (?, ?, ?)").run(
    productActiveId,
    productInactiveId,
    productNoPriceId
  );
  // Limpiar listas de prueba
  db.prepare("DELETE FROM price_lists WHERE id IN (?, ?)").run(
    priceListDefaultId,
    priceListAltId
  );
  // Resetear config portal si fue modificada por tests
  db.prepare(
    "DELETE FROM portal_service_config WHERE key = 'portal_price_list_id'"
  ).run();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Ticket type seed
// ─────────────────────────────────────────────────────────────────────────────

describe("1. Seed ticket_type 'servicio-arc'", () => {
  it("existe en DB con active=1", () => {
    const row = db
      .prepare("SELECT * FROM ticket_types WHERE slug = 'servicio-arc'")
      .get() as { id: number; active: number; name: string } | undefined;
    assert.ok(row, "Debe existir el tipo de ticket 'servicio-arc'");
    assert.equal(row.active, 1, "Debe estar activo");
    assert.ok(row.name.length > 0, "Debe tener nombre");
  });

  it("tiene campos amigables definidos", () => {
    const fields = db
      .prepare(
        "SELECT field_key, label FROM ticket_type_fields WHERE ticket_type_id = (SELECT id FROM ticket_types WHERE slug = 'servicio-arc') ORDER BY sort_order"
      )
      .all() as Array<{ field_key: string; label: string }>;
    assert.ok(fields.length >= 3, `Debe tener al menos 3 campos, tiene ${fields.length}`);
    // campos mínimos esperados
    const keys = fields.map((f) => f.field_key);
    assert.ok(
      keys.includes("descripcion_necesidad"),
      "Falta campo 'descripcion_necesidad'"
    );
    assert.ok(
      keys.includes("preferencia_contacto"),
      "Falta campo 'preferencia_contacto'"
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Catálogo de servicios
// ─────────────────────────────────────────────────────────────────────────────

describe("2. Catálogo — listServicesForPortal", () => {
  it("retorna solo productos activos (productInactive NO aparece)", () => {
    const items = listServicesForPortal(priceListDefaultId);
    const ids = items.map((i) => i.productId);
    assert.ok(!ids.includes(productInactiveId), "Producto inactivo NO debe aparecer");
  });

  it("retorna productActive con priceMode='priced'", () => {
    const items = listServicesForPortal(priceListDefaultId);
    const found = items.find((i) => i.productId === productActiveId);
    assert.ok(found, "Producto activo debe aparecer");
    assert.equal(found.priceMode, "priced");
    assert.equal(found.unitPrice, 1500.0);
    assert.equal(found.currency, "MXN");
  });

  it("retorna productNoPrice con priceMode='custom_quote'", () => {
    const items = listServicesForPortal(priceListDefaultId);
    const found = items.find((i) => i.productId === productNoPriceId);
    assert.ok(found, "Producto sin precio debe aparecer");
    assert.equal(found.priceMode, "custom_quote");
    assert.equal(found.unitPrice, null);
  });

  it("con lista alternativa retorna precio en USD $75", () => {
    const items = listServicesForPortal(priceListAltId);
    const found = items.find((i) => i.productId === productActiveId);
    assert.ok(found, "Producto activo debe aparecer en lista alt");
    assert.equal(found.priceMode, "priced");
    assert.equal(found.unitPrice, 75.0);
    assert.equal(found.currency, "USD");
  });

  it("incluye nombre, descripción y unidad del producto", () => {
    const items = listServicesForPortal(priceListDefaultId);
    const found = items.find((i) => i.productId === productActiveId);
    assert.ok(found);
    assert.ok(found.name.includes(`${TS}`), "name debe coincidir con producto");
    assert.ok(found.description !== undefined);
    assert.ok(found.unit.length > 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Configuración de lista de precio portal
// ─────────────────────────────────────────────────────────────────────────────

describe("3. Configuración lista de precio portal", () => {
  it("getPortalPriceListId con config explícita retorna el ID configurado", () => {
    setPortalPriceListId(priceListAltId);
    const id = getPortalPriceListId(priceListDefaultId);
    assert.equal(id, priceListAltId, "Debe retornar el ID configurado");
    // limpiar para no afectar otros tests
    db.prepare("DELETE FROM portal_service_config WHERE key = 'portal_price_list_id'").run();
  });

  it("getPortalPriceListId sin config retorna fallback", () => {
    db.prepare("DELETE FROM portal_service_config WHERE key = 'portal_price_list_id'").run();
    const id = getPortalPriceListId(priceListDefaultId);
    assert.equal(id, priceListDefaultId, "Debe retornar el fallback cuando no hay config");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Submit de servicio
// ─────────────────────────────────────────────────────────────────────────────

describe("4. createServiceTicket", () => {
  const makeInput = (overrides: Partial<ServiceTicketInput> = {}): ServiceTicketInput => ({
    ticketTypeId: ticketTypeServiceId,
    portalUserId: userId1,
    productId: productActiveId,
    qty: 1,
    descripcionNecesidad: "Necesito instalar servicio de prueba",
    preferenciaContacto: "whatsapp",
    priceListId: priceListDefaultId,
    ...overrides,
  });

  it("claim approved → ticket status='nuevo', request_kind='service_arc'", () => {
    const result = createServiceTicket(makeInput());
    assert.ok(result.ok, `Error: ${!result.ok ? result.error : ""}`);
    if (!result.ok) return;

    const ticket = result.ticket;
    assert.equal(ticket.status, "nuevo");

    // Verificar request_kind en DB
    const row = db
      .prepare("SELECT request_kind FROM tickets WHERE id = ?")
      .get(ticket.id) as { request_kind: string } | undefined;
    assert.ok(row, "Ticket debe existir en DB");
    assert.equal(row.request_kind, "service_arc");
  });

  it("claim pending → ticket status='held'", () => {
    const result = createServiceTicket(makeInput({ portalUserId: userId2 }));
    assert.ok(result.ok, `Error: ${!result.ok ? result.error : ""}`);
    if (!result.ok) return;
    assert.equal(result.ticket.status, "held");
  });

  it("sin claim → ticket status='nuevo'", () => {
    const result = createServiceTicket(makeInput({ portalUserId: userId3 }));
    assert.ok(result.ok, `Error: ${!result.ok ? result.error : ""}`);
    if (!result.ok) return;
    assert.equal(result.ticket.status, "nuevo");
  });

  it("precio del servidor ignorando el del cliente (servidor relee precio)", () => {
    // El cliente podría enviar cualquier productId y priceListId;
    // el servidor SIEMPRE re-lee el precio real del CRM.
    // Aquí verificamos que el snapshot sea el precio CRM, no uno arbitrario.
    const result = createServiceTicket(makeInput());
    assert.ok(result.ok);
    if (!result.ok) return;

    const snapshot = result.priceSnapshot;
    assert.equal(snapshot.mode, "priced");
    assert.equal(snapshot.unitPrice, 1500.0);
    assert.equal(snapshot.currency, "MXN");
    assert.equal(snapshot.productId, productActiveId);
  });

  it("snapshot correcto en ticket_values", () => {
    const result = createServiceTicket(makeInput());
    assert.ok(result.ok);
    if (!result.ok) return;

    const values = db
      .prepare("SELECT field_key, value FROM ticket_values WHERE ticket_id = ?")
      .all(result.ticket.id) as Array<{ field_key: string; value: string | null }>;

    const byKey = new Map(values.map((v) => [v.field_key, v.value]));

    assert.equal(byKey.get("price_product_id"), String(productActiveId));
    assert.equal(byKey.get("price_sku"), `SRV-ACTIVE-${TS}`);
    assert.equal(byKey.get("price_mode"), "priced");
    assert.equal(byKey.get("price_amount"), "1500");
    assert.equal(byKey.get("price_currency"), "MXN");
    assert.ok(byKey.has("descripcion_necesidad"), "Falta descripcion_necesidad");
    assert.ok(byKey.has("preferencia_contacto"), "Falta preferencia_contacto");
  });

  it("sin precio → snapshot price_mode='custom_quote', price_amount=null", () => {
    const result = createServiceTicket(
      makeInput({ productId: productNoPriceId })
    );
    assert.ok(result.ok, `Error: ${!result.ok ? result.error : ""}`);
    if (!result.ok) return;

    const snapshot = result.priceSnapshot;
    assert.equal(snapshot.mode, "custom_quote");
    assert.equal(snapshot.unitPrice, null);

    const values = db
      .prepare("SELECT field_key, value FROM ticket_values WHERE ticket_id = ?")
      .all(result.ticket.id) as Array<{ field_key: string; value: string | null }>;

    const byKey = new Map(values.map((v) => [v.field_key, v.value]));
    assert.equal(byKey.get("price_mode"), "custom_quote");
    assert.equal(byKey.get("price_amount"), null);
  });

  it("producto inactivo → submit rechazado (error)", () => {
    const result = createServiceTicket(
      makeInput({ productId: productInactiveId })
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.error.length > 0, "Debe devolver mensaje de error");
  });

  it("folio generado tiene formato ARC-XXXXX", () => {
    const result = createServiceTicket(makeInput());
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.match(result.ticket.folio, /^ARC-\d{5}$/);
  });

  it("ticket_type_id inválido → rechazado", () => {
    const result = createServiceTicket(makeInput({ ticketTypeId: 999999 }));
    assert.equal(result.ok, false);
  });

  it("descripcionNecesidad vacía → rechazado", () => {
    const result = createServiceTicket(
      makeInput({ descripcionNecesidad: "   " })
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(/descripci/i.test(result.error), "Mensaje debe mencionar 'descripción'");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. portal_service_config table
// ─────────────────────────────────────────────────────────────────────────────

describe("5. portal_service_config table", () => {
  it("existe la tabla portal_service_config", () => {
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='portal_service_config'"
      )
      .get();
    assert.ok(row, "La tabla portal_service_config debe existir");
  });

  it("setPortalPriceListId persiste en DB", () => {
    setPortalPriceListId(priceListAltId);
    const row = db
      .prepare(
        "SELECT value FROM portal_service_config WHERE key = 'portal_price_list_id'"
      )
      .get() as { value: string } | undefined;
    assert.ok(row, "Debe haber registro en DB");
    assert.equal(Number(row.value), priceListAltId);
    // limpiar
    db.prepare("DELETE FROM portal_service_config WHERE key = 'portal_price_list_id'").run();
  });
});
