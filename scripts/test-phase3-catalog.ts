/**
 * Tests Fase 3: Catálogo de modificaciones por desarrollo.
 *
 * Corre con: npx tsx --test scripts/test-phase3-catalog.ts
 *
 * Verifica:
 * - Seeds de Capital Sur / Terrasoles
 * - Catálogo base (calentador solar, pérgola, repellado)
 * - Habilitar/deshabilitar modificación por desarrollo
 * - No activo globalmente por default
 * - isModificationActiveForDevelopment logic
 * - Migración idempotente (puede ejecutarse dos veces)
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import db from "../src/lib/db-connection.js";

// ── Importaciones de dominio (deben existir para pasar) ──────────────────────
import { initPhase3Schema } from "../src/lib/portal/schema-phase3.js";
import {
  listDevelopments,
  getDevelopmentBySlug,
  createDevelopment,
} from "../src/lib/portal/developments.js";
import {
  listCatalog,
  getCatalogItemBySlug,
  listModificationsForDevelopment,
  enableModificationForDevelopment,
  disableModificationForDevelopment,
  isModificationActiveForDevelopment,
} from "../src/lib/portal/modification-catalog.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TEST_DEV_SLUG = `test-dev-${Date.now()}`;
let testDevId = 0;
let solarCatalogId = 0;
let pergolaId = 0;

before(() => {
  // Segunda inicialización (prueba idempotencia)
  initPhase3Schema();
  initPhase3Schema();

  // Crear un desarrollo de prueba aislado
  const result = createDevelopment({
    name: `Desarrollo Test ${Date.now()}`,
    slug: TEST_DEV_SLUG,
    city: "Test City",
  });
  assert.ok(result.ok, `No se pudo crear desarrollo de prueba: ${!result.ok ? result.error : ""}`);
  testDevId = result.development.id;

  // Obtener IDs del catálogo para usarlos en tests
  const solar = getCatalogItemBySlug("calentador-solar");
  assert.ok(solar, "El catálogo debe tener 'calentador-solar'");
  solarCatalogId = solar.id;

  const pergola = getCatalogItemBySlug("pergola");
  assert.ok(pergola, "El catálogo debe tener 'pergola'");
  pergolaId = pergola.id;
});

after(() => {
  // Limpiar desarrollo de prueba y sus configs
  if (testDevId > 0) {
    db.prepare(
      "DELETE FROM development_modification_config WHERE development_id = ?"
    ).run(testDevId);
    db.prepare("DELETE FROM developments WHERE id = ?").run(testDevId);
  }
});

// ── Tests de Seeds ────────────────────────────────────────────────────────────

describe("seeds de desarrollos", () => {
  it("Capital Sur existe en la base", () => {
    const dev = getDevelopmentBySlug("capital-sur");
    assert.ok(dev, "Capital Sur debe existir");
    assert.equal(dev.name, "Capital Sur");
    assert.ok(dev.active);
  });

  it("Terrasoles existe en la base", () => {
    const dev = getDevelopmentBySlug("terrasoles");
    assert.ok(dev, "Terrasoles debe existir");
    assert.equal(dev.name, "Terrasoles");
    assert.ok(dev.active);
  });

  it("listDevelopments retorna al menos Capital Sur y Terrasoles", () => {
    const devs = listDevelopments({ activeOnly: true });
    const slugs = devs.map((d) => d.slug);
    assert.ok(slugs.includes("capital-sur"), "debe incluir capital-sur");
    assert.ok(slugs.includes("terrasoles"), "debe incluir terrasoles");
  });
});

// ── Tests de Catálogo base ────────────────────────────────────────────────────

describe("catálogo de modificaciones base", () => {
  it("calentador-solar existe en el catálogo", () => {
    const item = getCatalogItemBySlug("calentador-solar");
    assert.ok(item, "calentador-solar debe existir");
    assert.equal(item.slug, "calentador-solar");
  });

  it("pergola existe en el catálogo", () => {
    const item = getCatalogItemBySlug("pergola");
    assert.ok(item, "pergola debe existir");
    assert.equal(item.slug, "pergola");
  });

  it("repellado-interior existe en el catálogo (slug correcto desde PDFs)", () => {
    const item = getCatalogItemBySlug("repellado-interior");
    assert.ok(item, "repellado-interior debe existir");
    assert.equal(item.slug, "repellado-interior");
  });

  it("ninguno de los tres está activo globalmente por default", () => {
    const slugs = ["calentador-solar", "pergola", "repellado-interior"];
    for (const slug of slugs) {
      const item = getCatalogItemBySlug(slug);
      assert.ok(item, `${slug} debe existir`);
      assert.equal(
        item.globalActive,
        false,
        `${slug} no debe ser global_active por default`
      );
    }
  });

  it("listCatalog retorna al menos 3 ítems", () => {
    const all = listCatalog();
    assert.ok(all.length >= 3, `Se esperan al menos 3 ítems, hay ${all.length}`);
  });

  it("listCatalog con globalActiveOnly vacío (ninguno activo globalmente)", () => {
    const globalOnes = listCatalog({ globalActiveOnly: true });
    // Por diseño, ninguno está activo globalmente en la seed
    assert.equal(
      globalOnes.length,
      0,
      "No debe haber modificaciones activas globalmente en el seed base"
    );
  });
});

// ── Tests de configuración por desarrollo ─────────────────────────────────────

describe("configuración de modificaciones por desarrollo", () => {
  it("listModificationsForDevelopment vacío antes de habilitar", () => {
    const mods = listModificationsForDevelopment(testDevId);
    assert.equal(
      mods.length,
      0,
      "No deben haber modificaciones habilitadas en el dev de prueba"
    );
  });

  it("habilitar calentador-solar en el desarrollo de prueba", () => {
    const result = enableModificationForDevelopment({
      developmentId: testDevId,
      modificationCatalogId: solarCatalogId,
    });
    assert.ok(result.ok, `Error: ${!result.ok ? result.error : ""}`);
    assert.equal(result.config.developmentId, testDevId);
    assert.equal(result.config.modificationCatalogId, solarCatalogId);
    assert.ok(result.config.active);
  });

  it("listModificationsForDevelopment incluye calentador-solar después de habilitar", () => {
    const mods = listModificationsForDevelopment(testDevId);
    assert.ok(mods.length >= 1, "Debe haber al menos 1 modificación habilitada");
    const solar = mods.find((m) => m.modificationCatalogId === solarCatalogId);
    assert.ok(solar, "calentador-solar debe estar en la lista");
    assert.ok(solar.modification, "debe incluir datos del catálogo");
    assert.equal(solar.modification?.slug, "calentador-solar");
  });

  it("isModificationActiveForDevelopment true para calentador-solar", () => {
    const active = isModificationActiveForDevelopment(testDevId, solarCatalogId);
    assert.equal(active, true);
  });

  it("isModificationActiveForDevelopment false para pérgola (no habilitada aún)", () => {
    const active = isModificationActiveForDevelopment(testDevId, pergolaId);
    assert.equal(active, false);
  });

  it("habilitar es idempotente (re-habilitar no lanza error)", () => {
    const r1 = enableModificationForDevelopment({
      developmentId: testDevId,
      modificationCatalogId: solarCatalogId,
    });
    const r2 = enableModificationForDevelopment({
      developmentId: testDevId,
      modificationCatalogId: solarCatalogId,
      maxPerTicket: 2,
    });
    assert.ok(r1.ok && r2.ok);
    // Verifica que maxPerTicket se actualizó
    assert.equal(r2.config.maxPerTicket, 2);
  });

  it("deshabilitar calentador-solar del desarrollo de prueba", () => {
    const disabled = disableModificationForDevelopment(testDevId, solarCatalogId);
    assert.ok(disabled, "debe devolver true si se deshabilitó");
  });

  it("isModificationActiveForDevelopment false después de deshabilitar", () => {
    const active = isModificationActiveForDevelopment(testDevId, solarCatalogId);
    assert.equal(active, false);
  });

  it("deshabilitar es idempotente (segunda vez devuelve false changes)", () => {
    // Ya estaba deshabilitado, volver a deshabilitar
    const r = disableModificationForDevelopment(testDevId, solarCatalogId);
    // Puede devolver false porque changes=0
    assert.equal(typeof r, "boolean");
  });

  it("error al habilitar modificación inexistente", () => {
    const r = enableModificationForDevelopment({
      developmentId: testDevId,
      modificationCatalogId: 999999,
    });
    assert.ok(!r.ok, "debe devolver error para catalog_id inexistente");
  });

  it("error al habilitar en desarrollo inexistente", () => {
    const r = enableModificationForDevelopment({
      developmentId: 999999,
      modificationCatalogId: solarCatalogId,
    });
    assert.ok(!r.ok, "debe devolver error para desarrollo inexistente");
  });
});

// ── Test de idempotencia del schema ──────────────────────────────────────────

describe("idempotencia del schema", () => {
  it("initPhase3Schema puede ejecutarse múltiples veces sin error", () => {
    // No debe lanzar excepción
    assert.doesNotThrow(() => {
      initPhase3Schema();
      initPhase3Schema();
      initPhase3Schema();
    });
  });

  it("los datos previos siguen legibles después de re-init", () => {
    initPhase3Schema();
    const capitalSur = getDevelopmentBySlug("capital-sur");
    assert.ok(capitalSur, "Capital Sur debe seguir existiendo");
    const catalog = listCatalog();
    assert.ok(catalog.length >= 3, "El catálogo debe seguir intacto");
  });
});

// ── Test de createDevelopment ─────────────────────────────────────────────────

describe("createDevelopment", () => {
  const slugExtra = `dev-extra-${Date.now()}`;
  let extraDevId = 0;

  after(() => {
    if (extraDevId > 0) {
      db.prepare("DELETE FROM developments WHERE id = ?").run(extraDevId);
    }
  });

  it("crea un desarrollo correctamente", () => {
    const r = createDevelopment({ name: "Dev Extra Test", slug: slugExtra });
    assert.ok(r.ok);
    extraDevId = r.development.id;
    assert.equal(r.development.slug, slugExtra);
    assert.ok(r.development.active);
  });

  it("error al crear desarrollo con slug duplicado", () => {
    const r = createDevelopment({ name: "Dup", slug: slugExtra });
    assert.ok(!r.ok, "debe rechazar slug duplicado");
    assert.match(r.error, /slug/i);
  });

  it("error al crear con nombre vacío", () => {
    const r = createDevelopment({ name: "" });
    assert.ok(!r.ok, "debe rechazar nombre vacío");
  });
});
