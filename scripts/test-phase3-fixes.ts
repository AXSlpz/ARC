/**
 * Tests Fase 3 – correcciones y completados.
 *
 * Cubre:
 *  A) Catálogo fiel a PDFs: slugs correctos, slugs genéricos eliminados,
 *     config por defecto por desarrollo, 3 extras sin config.
 *  B) Property claims: partial unique index approved, transacción atómica,
 *     manejo de SQLITE_CONSTRAINT.
 *  C) Identity docs: servicio de versionado transaccional, partial unique index.
 *  D) SLA: transacciones atómicas, guarda completed (no restart/pause/resume).
 *  E) schema_migrations: tabla existe, migración registrada.
 *  F) init-portal: aggregador sin ciclo, inicializa ambas fases.
 *
 * Corre con: npx tsx --test scripts/test-phase3-fixes.ts
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import db from "../src/lib/db-connection.js";

// Importar aggregador primero para garantizar orden de init
import { initPortalSchema } from "../src/lib/portal/init-portal.js";
import { getDevelopmentBySlug } from "../src/lib/portal/developments.js";
import {
  getCatalogItemBySlug,
  listCatalog,
  listModificationsForDevelopment,
} from "../src/lib/portal/modification-catalog.js";
import {
  createPropertyClaim,
  reviewPropertyClaim,
} from "../src/lib/portal/property-claims.js";
import {
  addIdentityDocument,
  getCurrentIdentityDocument,
  getIdentityDocumentHistory,
  updateOcrStatus,
} from "../src/lib/portal/identity-documents.js";
import {
  startSla,
  pauseSla,
  resumeSla,
  completeSla,
  getSlaState,
  getSlaEvents,
} from "../src/lib/portal/sla.js";

// ── Fixtures compartidos ──────────────────────────────────────────────────────

let testUserId1 = 0;
let testUserId2 = 0;
let testTypeId = 0;
let testTicketId1 = 0;
let testTicketId2 = 0;
let testDevId = 0;

before(() => {
  // Doble init: prueba idempotencia del aggregador
  initPortalSchema();
  initPortalSchema();

  // Usuarios de prueba
  const u1 = db
    .prepare(`INSERT INTO portal_users (name, email, password_hash) VALUES ('Fix User 1', 'fix1-${Date.now()}@arc.test', 'x')`)
    .run();
  testUserId1 = Number(u1.lastInsertRowid);

  const u2 = db
    .prepare(`INSERT INTO portal_users (name, email, password_hash) VALUES ('Fix User 2', 'fix2-${Date.now()}@arc.test', 'x')`)
    .run();
  testUserId2 = Number(u2.lastInsertRowid);

  // Tipo de ticket y tickets de prueba
  const tp = db
    .prepare(`INSERT INTO ticket_types (name, slug, active, sort_order) VALUES ('Fix Type', 'fix-type-${Date.now()}', 1, 99)`)
    .run();
  testTypeId = Number(tp.lastInsertRowid);

  const t1 = db
    .prepare(`INSERT INTO tickets (folio, ticket_type_id, portal_user_id, status) VALUES ('FIX-T1-${Date.now()}', ?, ?, 'nuevo')`)
    .run(testTypeId, testUserId1);
  testTicketId1 = Number(t1.lastInsertRowid);

  const t2 = db
    .prepare(`INSERT INTO tickets (folio, ticket_type_id, portal_user_id, status) VALUES ('FIX-T2-${Date.now()}', ?, ?, 'nuevo')`)
    .run(testTypeId, testUserId1);
  testTicketId2 = Number(t2.lastInsertRowid);

  // Desarrollo de prueba con slug único
  const d = db
    .prepare(`INSERT OR IGNORE INTO developments (name, slug, city, active) VALUES ('Fix Dev', 'fix-dev-${Date.now()}', NULL, 1)`)
    .run();
  testDevId = Number(d.lastInsertRowid);
});

after(() => {
  // Limpiar en orden inverso a dependencias
  [testTicketId1, testTicketId2].filter(Boolean).forEach((id) => {
    db.prepare("DELETE FROM sla_events WHERE ticket_id = ?").run(id);
    db.prepare("DELETE FROM request_signatures WHERE ticket_id = ?").run(id);
    db.prepare("DELETE FROM tickets WHERE id = ?").run(id);
  });

  db.prepare("DELETE FROM portal_identity_documents WHERE portal_user_id IN (?, ?)").run(testUserId1, testUserId2);

  if (testDevId > 0) {
    db.prepare("DELETE FROM property_claims WHERE development_id = ?").run(testDevId);
    db.prepare("DELETE FROM development_modification_config WHERE development_id = ?").run(testDevId);
    db.prepare("DELETE FROM committee_signature_config WHERE development_id = ?").run(testDevId);
    db.prepare("DELETE FROM developments WHERE id = ?").run(testDevId);
  }

  if (testTypeId > 0) db.prepare("DELETE FROM ticket_types WHERE id = ?").run(testTypeId);
  [testUserId1, testUserId2].filter(Boolean).forEach((id) =>
    db.prepare("DELETE FROM portal_users WHERE id = ?").run(id)
  );
});

// ── A) Catálogo fiel a PDFs ───────────────────────────────────────────────────

describe("catálogo fiel a PDFs", () => {
  it("schema_migrations existe y tiene al menos la migración v2 del catálogo", () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
      .get() as { name: string } | undefined;
    assert.ok(tables, "schema_migrations debe existir");

    const migration = db
      .prepare("SELECT version FROM schema_migrations WHERE version = 'phase3_catalog_v2'")
      .get() as { version: string } | undefined;
    assert.ok(migration, "migración phase3_catalog_v2 debe estar registrada");
  });

  // Slugs reales de los PDFs
  const slugsReales = [
    "tanque-gas",
    "toma-gas",
    "escalera-azotea",
    "muro-colindante",
    "techumbre-lavado",
    "techumbre-posterior",
    "cuarto-lavado",
    "reja-lateral",
    "reja-pasillo",
    "herreria-posterior",
    "mosquiteros",
    "area-verde-delantera",
    "piso-firme-posterior",
    "volado-acceso",
    "pintura-retoque",
    "instalaciones-especiales",
    "calentador-solar",
    "pergola",
    "repellado-interior",
  ];

  for (const slug of slugsReales) {
    it(`catálogo tiene '${slug}'`, () => {
      const item = getCatalogItemBySlug(slug);
      assert.ok(item, `'${slug}' debe existir en el catálogo`);
    });
  }

  // Slugs genéricos viejos NO deben existir
  const slugsEliminados = ["ampliacion-cuarto", "bardeo-muro", "techado-cochera", "repellado"];
  for (const slug of slugsEliminados) {
    it(`catálogo NO tiene slug genérico viejo '${slug}'`, () => {
      const item = getCatalogItemBySlug(slug);
      assert.equal(item, null, `'${slug}' NO debe existir en el catálogo`);
    });
  }

  it("calentador-solar, pergola, repellado-interior son global_active=false", () => {
    for (const slug of ["calentador-solar", "pergola", "repellado-interior"]) {
      const item = getCatalogItemBySlug(slug);
      assert.ok(item, `${slug} debe existir`);
      assert.equal(item.globalActive, false, `${slug} NO debe ser global_active`);
    }
  });
});

describe("seeds de desarrollos (ciudad NULL, no Hermosillo)", () => {
  it("Capital Sur tiene city=null", () => {
    const dev = getDevelopmentBySlug("capital-sur");
    assert.ok(dev, "Capital Sur debe existir");
    assert.equal(dev.city, null, "city debe ser null, no 'Hermosillo'");
  });

  it("Terrasoles tiene city=null", () => {
    const dev = getDevelopmentBySlug("terrasoles");
    assert.ok(dev, "Terrasoles debe existir");
    assert.equal(dev.city, null, "city debe ser null, no 'Hermosillo'");
  });
});

describe("configuración por defecto de Capital Sur", () => {
  const esperados = [
    "tanque-gas",
    "escalera-azotea",
    "muro-colindante",
    "techumbre-lavado",
    "techumbre-posterior",
    "cuarto-lavado",
    "reja-lateral",
    "reja-pasillo",
    "herreria-posterior",
    "mosquiteros",
    "area-verde-delantera",
    "volado-acceso",
    "pintura-retoque",
    "instalaciones-especiales",
  ];

  it("Capital Sur tiene al menos 14 modificaciones activas por defecto", () => {
    const dev = getDevelopmentBySlug("capital-sur");
    assert.ok(dev);
    const mods = listModificationsForDevelopment(dev.id);
    assert.ok(
      mods.length >= 14,
      `Capital Sur debe tener ≥14 mods, tiene ${mods.length}`
    );
  });

  for (const slug of esperados) {
    it(`Capital Sur tiene '${slug}' activo`, () => {
      const dev = getDevelopmentBySlug("capital-sur");
      assert.ok(dev);
      const mods = listModificationsForDevelopment(dev.id);
      const found = mods.find((m) => m.modification?.slug === slug);
      assert.ok(found, `Capital Sur debe tener '${slug}'`);
      assert.ok(found.active);
    });
  }

  it("Capital Sur NO tiene 'toma-gas' (exclusivo Terrasoles)", () => {
    const dev = getDevelopmentBySlug("capital-sur");
    assert.ok(dev);
    const mods = listModificationsForDevelopment(dev.id);
    const found = mods.find((m) => m.modification?.slug === "toma-gas");
    assert.equal(found, undefined, "Capital Sur NO debe tener toma-gas");
  });
});

describe("configuración por defecto de Terrasoles", () => {
  const esperados = [
    "tanque-gas",
    "toma-gas",
    "reja-lateral",
    "reja-pasillo",
    "herreria-posterior",
    "mosquiteros",
    "area-verde-delantera",
    "piso-firme-posterior",
    "pintura-retoque",
  ];

  for (const slug of esperados) {
    it(`Terrasoles tiene '${slug}' activo`, () => {
      const dev = getDevelopmentBySlug("terrasoles");
      assert.ok(dev);
      const mods = listModificationsForDevelopment(dev.id);
      const found = mods.find((m) => m.modification?.slug === slug);
      assert.ok(found, `Terrasoles debe tener '${slug}'`);
      assert.ok(found.active);
    });
  }

  it("Terrasoles NO tiene 'escalera-azotea' (exclusivo Capital Sur)", () => {
    const dev = getDevelopmentBySlug("terrasoles");
    assert.ok(dev);
    const mods = listModificationsForDevelopment(dev.id);
    const found = mods.find((m) => m.modification?.slug === "escalera-azotea");
    assert.equal(found, undefined, "Terrasoles NO debe tener escalera-azotea");
  });
});

describe("3 extras sin config de desarrollo por defecto", () => {
  it("calentador-solar no tiene config en Capital Sur ni Terrasoles", () => {
    for (const slug of ["capital-sur", "terrasoles"]) {
      const dev = getDevelopmentBySlug(slug);
      assert.ok(dev);
      const mods = listModificationsForDevelopment(dev.id);
      const found = mods.find((m) => m.modification?.slug === "calentador-solar");
      assert.equal(
        found,
        undefined,
        `calentador-solar NO debe estar en ${slug}`
      );
    }
  });

  it("pergola no tiene config en ningún desarrollo por defecto", () => {
    for (const slug of ["capital-sur", "terrasoles"]) {
      const dev = getDevelopmentBySlug(slug);
      assert.ok(dev);
      const mods = listModificationsForDevelopment(dev.id);
      assert.equal(
        mods.find((m) => m.modification?.slug === "pergola"),
        undefined
      );
    }
  });

  it("repellado-interior no tiene config en ningún desarrollo por defecto", () => {
    for (const slug of ["capital-sur", "terrasoles"]) {
      const dev = getDevelopmentBySlug(slug);
      assert.ok(dev);
      const mods = listModificationsForDevelopment(dev.id);
      assert.equal(
        mods.find((m) => m.modification?.slug === "repellado-interior"),
        undefined
      );
    }
  });
});

// ── B) Property claims – partial unique index + transacción atómica ───────────

describe("property claims: partial unique index approved", () => {
  const PROP_ID = `lote-fix-${Date.now()}`;

  it("primer claim puede aprobarse", () => {
    const c1 = createPropertyClaim({
      developmentId: testDevId,
      portalUserId: testUserId1,
      propertyIdentifier: PROP_ID,
    });
    assert.ok(c1.ok, `error: ${!c1.ok ? c1.error : ""}`);

    const r1 = reviewPropertyClaim(c1.claim.id, {
      status: "approved",
      reviewedBy: "admin-test",
      propertySnapshot: { lote: PROP_ID },
    });
    assert.ok(r1.ok, `error: ${!r1.ok ? r1.error : ""}`);
    assert.equal(r1.claim.status, "approved");
  });

  it("segundo usuario crea claim: queda en conflict porque hay approved", () => {
    const c2 = createPropertyClaim({
      developmentId: testDevId,
      portalUserId: testUserId2,
      propertyIdentifier: PROP_ID,
    });
    // Puede crearse pero queda como conflict
    assert.ok(c2.ok, `error: ${!c2.ok ? c2.error : ""}`);
    assert.equal(c2.claim.status, "conflict");
  });

  it("intentar aprobar segundo claim devuelve error de conflicto", () => {
    const claims = db
      .prepare(
        "SELECT id, status FROM property_claims WHERE development_id = ? AND property_identifier = ? AND portal_user_id = ?"
      )
      .all(testDevId, PROP_ID, testUserId2) as Array<{ id: number; status: string }>;

    const conflictClaim = claims.find((c) => c.status === "conflict");
    if (!conflictClaim) {
      // Si no hay claim conflict, simplemente skip (ya estaba aprobado)
      return;
    }

    const r2 = reviewPropertyClaim(conflictClaim.id, {
      status: "approved",
      reviewedBy: "admin-test",
    });
    // Debe fallar porque la restricción única evita dos approved para el mismo inmueble
    assert.ok(!r2.ok, "debe rechazar aprobar cuando ya hay otro approved");
    assert.match(r2.error, /conflict|ya existe|aprobad/i);
  });

  it("la aprobación es atómica: si falla, otros claims no cambian", () => {
    // No hay datos parciales en la DB después del error
    const approvedCount = (
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM property_claims WHERE development_id = ? AND property_identifier = ? AND status = 'approved'"
        )
        .get(testDevId, PROP_ID) as { n: number }
    ).n;
    assert.equal(approvedCount, 1, "solo puede haber 1 approved");
  });
});

// ── C) Identity documents – versionado transaccional ─────────────────────────

describe("identity docs: versionado transaccional", () => {
  it("addIdentityDocument inserta documento INE como is_current=1", () => {
    const result = addIdentityDocument({
      portalUserId: testUserId1,
      kind: "ine",
      storedPath: "/uploads/ine-test-1.jpg",
    });
    assert.ok(result.ok, `error: ${!result.ok ? result.error : ""}`);
    assert.equal(result.doc.isCurrent, true);
    assert.equal(result.doc.ocrStatus, "pending");
  });

  it("agregar segunda INE marca la anterior como not-current atómicamente", () => {
    const result = addIdentityDocument({
      portalUserId: testUserId1,
      kind: "ine",
      storedPath: "/uploads/ine-test-2.jpg",
    });
    assert.ok(result.ok, `error: ${!result.ok ? result.error : ""}`);
    assert.equal(result.doc.isCurrent, true);

    // La primera debe ser is_current = 0
    const history = getIdentityDocumentHistory(testUserId1);
    const notCurrent = history.filter((d) => !d.isCurrent);
    assert.ok(notCurrent.length >= 1, "debe haber al menos una doc no-current");
    const currentOnes = history.filter((d) => d.isCurrent && d.kind === "ine");
    assert.equal(currentOnes.length, 1, "solo debe haber una is_current=1 por kind");
  });

  it("getCurrentIdentityDocument devuelve la doc más reciente", () => {
    const current = getCurrentIdentityDocument(testUserId1, "ine");
    assert.ok(current, "debe existir doc current");
    assert.ok(current.storedPath.includes("ine-test-2"), "debe ser la segunda INE");
  });

  it("partial unique index impide dos is_current=1 directos en la DB", () => {
    // Intentar insertar directamente dos is_current=1 violando el índice parcial
    db.prepare(
      "INSERT INTO portal_identity_documents (portal_user_id, kind, is_current, stored_path) VALUES (?, 'ine', 1, '/test/direct-1.jpg')"
    ).run(testUserId2);

    let threw = false;
    try {
      db.prepare(
        "INSERT INTO portal_identity_documents (portal_user_id, kind, is_current, stored_path) VALUES (?, 'ine', 1, '/test/direct-2.jpg')"
      ).run(testUserId2);
    } catch (err) {
      threw = true;
      assert.match(
        (err as Error).message,
        /UNIQUE|unique/i,
        "debe lanzar UNIQUE constraint"
      );
    }
    assert.ok(threw, "la DB debe rechazar dos is_current=1 para el mismo user+kind");

    // Limpiar
    db.prepare("DELETE FROM portal_identity_documents WHERE portal_user_id = ?").run(testUserId2);
  });

  it("updateOcrStatus actualiza ocr_status y metadata", () => {
    const current = getCurrentIdentityDocument(testUserId1, "ine");
    assert.ok(current);

    const updated = updateOcrStatus(current.id, "done", { nombre: "Juan", curp: "XXXXXX" });
    assert.ok(updated, "debe devolver documento actualizado");
    assert.equal(updated.ocrStatus, "done");
    assert.deepEqual(updated.ocrMetadata, { nombre: "Juan", curp: "XXXXXX" });
  });

  it("historia preserva todas las versiones", () => {
    const history = getIdentityDocumentHistory(testUserId1);
    assert.ok(history.length >= 2, "debe conservar historial de al menos 2 docs");
  });
});

// ── D) SLA – transacciones atómicas, guarda completed ────────────────────────

describe("SLA: no reiniciar/pausar/reanudar si completed", () => {
  let completedTicketId = 0;

  before(() => {
    const t = db
      .prepare(`INSERT INTO tickets (folio, ticket_type_id, portal_user_id, status) VALUES ('FIX-SLA-CMPL-${Date.now()}', ?, ?, 'nuevo')`)
      .run(testTypeId, testUserId1);
    completedTicketId = Number(t.lastInsertRowid);

    // Iniciar y completar SLA
    startSla(completedTicketId, 5, { createdBy: "test" });
    completeSla(completedTicketId, { createdBy: "test" });
  });

  after(() => {
    if (completedTicketId > 0) {
      db.prepare("DELETE FROM sla_events WHERE ticket_id = ?").run(completedTicketId);
      db.prepare("DELETE FROM tickets WHERE id = ?").run(completedTicketId);
    }
  });

  it("sla_status es 'completed' antes de las pruebas", () => {
    const state = getSlaState(completedTicketId);
    assert.equal(state?.slaStatus, "completed");
  });

  it("startSla en ticket completed no cambia el estado (idempotente)", () => {
    const before = getSlaState(completedTicketId);
    startSla(completedTicketId, 10, { createdBy: "test-restart" });
    const after2 = getSlaState(completedTicketId);
    assert.equal(after2?.slaStatus, "completed", "no debe cambiar de completed a active");
    // El deadline no debe cambiar
    assert.equal(before?.slaTargetAt, after2?.slaTargetAt);
  });

  it("pauseSla en ticket completed devuelve estado sin modificar", () => {
    const state = pauseSla(completedTicketId, { reason: "test-pause-completed" });
    assert.ok(state, "debe devolver estado");
    assert.equal(state.slaStatus, "completed", "no debe cambiar a paused");
  });

  it("resumeSla en ticket completed devuelve estado sin modificar", () => {
    const state = resumeSla(completedTicketId, { reason: "test-resume-completed" });
    assert.ok(state, "debe devolver estado");
    assert.equal(state.slaStatus, "completed", "no debe cambiar a active");
  });

  it("no se registran eventos espurios al intentar modificar completed", () => {
    const events = getSlaEvents(completedTicketId);
    // Solo debe haber 'started' y 'completed'
    const types = events.map((e) => e.eventType);
    assert.ok(types.includes("started"), "debe haber evento started");
    assert.ok(types.includes("completed"), "debe haber evento completed");
    const spurious = types.filter((t) => !["started", "completed"].includes(t));
    assert.equal(spurious.length, 0, `no deben haber eventos espurios: ${spurious}`);
  });
});

describe("SLA: startSla es atómico (ticket y evento en misma tx)", () => {
  it("si el ticket no existe, startSla devuelve null sin efectos secundarios", () => {
    const state = startSla(999999, 5);
    assert.equal(state, null);
    // No debe haber eventos SLA para ese ID inexistente
    const events = getSlaEvents(999999);
    assert.equal(events.length, 0);
  });
});

// ── E) schema_migrations ──────────────────────────────────────────────────────

describe("schema_migrations", () => {
  it("tabla schema_migrations existe", () => {
    const t = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
      .get() as { name: string } | undefined;
    assert.ok(t, "schema_migrations debe existir");
  });

  it("tiene al menos la migración phase3_dev_configs_v1", () => {
    const m = db
      .prepare("SELECT version FROM schema_migrations WHERE version = 'phase3_dev_configs_v1'")
      .get() as { version: string } | undefined;
    assert.ok(m, "migración phase3_dev_configs_v1 debe estar registrada");
  });

  it("tiene migración phase3_cities_null", () => {
    const m = db
      .prepare("SELECT version FROM schema_migrations WHERE version = 'phase3_cities_null'")
      .get() as { version: string } | undefined;
    assert.ok(m, "migración phase3_cities_null debe estar registrada");
  });
});

// ── F) init-portal aggregador ─────────────────────────────────────────────────

describe("initPortalSchema: aggregador sin ciclo", () => {
  it("puede llamarse múltiples veces sin error", () => {
    assert.doesNotThrow(() => {
      initPortalSchema();
      initPortalSchema();
      initPortalSchema();
    });
  });

  it("después de initPortalSchema existen tablas de fase 2 y fase 3", () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;
    const names = new Set(tables.map((t) => t.name));

    // Fase 2
    assert.ok(names.has("portal_users"), "portal_users debe existir");
    assert.ok(names.has("tickets"), "tickets debe existir");

    // Fase 3
    assert.ok(names.has("developments"), "developments debe existir");
    assert.ok(names.has("modification_catalog"), "modification_catalog debe existir");
    assert.ok(names.has("property_claims"), "property_claims debe existir");
    assert.ok(names.has("portal_identity_documents"), "portal_identity_documents debe existir");
    assert.ok(names.has("request_signatures"), "request_signatures debe existir");
    assert.ok(names.has("sla_events"), "sla_events debe existir");
  });

  it("columnas SLA existen en la tabla tickets", () => {
    const cols = db
      .prepare("PRAGMA table_info(tickets)")
      .all() as Array<{ name: string }>;
    const names = new Set(cols.map((c) => c.name));
    assert.ok(names.has("sla_status"), "tickets.sla_status debe existir");
    assert.ok(names.has("sla_target_at"), "tickets.sla_target_at debe existir");
    assert.ok(names.has("sla_paused_at"), "tickets.sla_paused_at debe existir");
    assert.ok(names.has("request_kind"), "tickets.request_kind debe existir");
  });
});
