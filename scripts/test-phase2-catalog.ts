/**
 * Tests Fase 2 – Catálogo público (sin PII).
 *
 * Cubre:
 *  A) Catálogo público de desarrollos → solo id, name, slug (sin PII).
 *  B) Mapeado development → condominios (tabla development_condominios).
 *  C) Viviendas por condominio → solo num_vivienda (sin nombre/email/celular).
 *  D) Relación dev-condo administrable: agregar y quitar.
 *
 * Corre con: npx tsx --test scripts/test-phase2-catalog.ts
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import db from "../src/lib/db-connection.js";
import { initPortalSchema } from "../src/lib/portal/init-portal.js";
import { initRegistrationAdminSchema } from "../src/lib/portal/schema-registration-admin.js";

// Importaciones de dominio que deben existir para pasar
import {
  listPublicDevelopments,
  listPublicCondominiosForDevelopment,
  listPublicViviendasForCondominio,
  linkCondominioToDevelopment,
  unlinkCondominioFromDevelopment,
  listCondominiosLinkedToDevelopment,
  setCondominioDevelopment,
  getDevelopmentForCondominio,
  resolveDevelopmentAssignment,
} from "../src/lib/portal/catalog.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

let testDevId = 0;
let testCondoId = 0;
let testResId1 = 0;
let testResId2 = 0;

before(() => {
  initPortalSchema();
  initRegistrationAdminSchema();
  initRegistrationAdminSchema(); // Prueba idempotencia

  // Crear un desarrollo de prueba
  const devRes = db
    .prepare(
      "INSERT OR IGNORE INTO developments (name, slug, active) VALUES (?, ?, 1)"
    )
    .run(`Dev Catalog Test ${Date.now()}`, `dev-cat-${Date.now()}`);
  testDevId = Number(devRes.lastInsertRowid);

  // Crear un condominio de prueba
  const condoRes = db
    .prepare("INSERT INTO condominios (name, prefijo) VALUES (?, ?)")
    .run(`Condo Cat Test ${Date.now()}`, `CC${Date.now()}`);
  testCondoId = Number(condoRes.lastInsertRowid);

  // Crear residentes (con PII) en ese condominio
  const r1 = db
    .prepare(
      "INSERT INTO residentes (condominio_id, nombre, num_vivienda, email, celular) VALUES (?, ?, ?, ?, ?)"
    )
    .run(testCondoId, "Juan Pérez Secret", 101, "juan@secret.com", 6641234567);
  testResId1 = Number(r1.lastInsertRowid);

  const r2 = db
    .prepare(
      "INSERT INTO residentes (condominio_id, nombre, num_vivienda, email, celular) VALUES (?, ?, ?, ?, ?)"
    )
    .run(testCondoId, "María López Secret", 102, "maria@secret.com", 6647654321);
  testResId2 = Number(r2.lastInsertRowid);
});

after(() => {
  if (testResId1) db.prepare("DELETE FROM residentes WHERE id = ?").run(testResId1);
  if (testResId2) db.prepare("DELETE FROM residentes WHERE id = ?").run(testResId2);
  if (testCondoId) {
    db.prepare("DELETE FROM development_condominios WHERE condominio_id = ?").run(testCondoId);
    db.prepare("DELETE FROM condominios WHERE id = ?").run(testCondoId);
  }
  if (testDevId) db.prepare("DELETE FROM developments WHERE id = ?").run(testDevId);
});

// ── A) Catálogo de desarrollos (sin PII) ─────────────────────────────────────

describe("catálogo público de desarrollos", () => {
  it("listPublicDevelopments retorna Capital Sur y Terrasoles", () => {
    const devs = listPublicDevelopments();
    assert.ok(Array.isArray(devs), "Debe ser un array");
    const slugs = devs.map((d) => d.slug);
    assert.ok(slugs.includes("capital-sur"), "Debe incluir capital-sur");
    assert.ok(slugs.includes("terrasoles"), "Debe incluir terrasoles");
  });

  it("listPublicDevelopments solo expone id, name, slug (sin PII)", () => {
    const devs = listPublicDevelopments();
    for (const d of devs) {
      const keys = Object.keys(d);
      assert.ok(keys.includes("id"), "Debe tener id");
      assert.ok(keys.includes("name"), "Debe tener name");
      assert.ok(keys.includes("slug"), "Debe tener slug");
      // NO debe exponer campos sensibles
      assert.ok(!keys.includes("city"), "No debe exponer city");
      assert.ok(!keys.includes("createdAt"), "No debe exponer createdAt");
    }
  });

  it("listPublicDevelopments oculta fixtures de prueba (sec-dev, testdev)", () => {
    const junk = db
      .prepare(
        "INSERT INTO developments (name, slug, active) VALUES (?, ?, 1)"
      )
      .run("SecDev hidden", `sec-dev-${Date.now()}`);
    const junkId = Number(junk.lastInsertRowid);
    try {
      const slugs = listPublicDevelopments().map((d) => d.slug);
      assert.ok(!slugs.some((s) => s.startsWith("sec-dev-")), "No debe listar sec-dev");
    } finally {
      db.prepare("DELETE FROM developments WHERE id = ?").run(junkId);
    }
  });

  it("listPublicDevelopments solo retorna desarrollos activos", () => {
    // El dev de prueba está activo, debe aparecer
    const devs = listPublicDevelopments();
    const found = devs.find((d) => d.id === testDevId);
    assert.ok(found, "El desarrollo de prueba debe aparecer");

    // Desactivar y verificar que desaparece
    db.prepare("UPDATE developments SET active = 0 WHERE id = ?").run(testDevId);
    const devs2 = listPublicDevelopments();
    const found2 = devs2.find((d) => d.id === testDevId);
    assert.equal(found2, undefined, "No debe aparecer si está inactivo");

    // Reactivar
    db.prepare("UPDATE developments SET active = 1 WHERE id = ?").run(testDevId);
  });
});

// ── B) Mapeo development → condominios ───────────────────────────────────────

describe("mapeo development_condominios", () => {
  it("linkCondominioToDevelopment vincula y listCondominiosLinkedToDevelopment lo refleja", () => {
    linkCondominioToDevelopment(testDevId, testCondoId);
    const condos = listCondominiosLinkedToDevelopment(testDevId);
    const found = condos.find((c) => c.id === testCondoId);
    assert.ok(found, "El condominio debe estar vinculado al desarrollo");
  });

  it("linkCondominioToDevelopment es idempotente (no lanza en duplicado)", () => {
    // Segunda llamada no debe lanzar
    assert.doesNotThrow(() => linkCondominioToDevelopment(testDevId, testCondoId));
  });

  it("unlinkCondominioFromDevelopment lo elimina del mapeo", () => {
    unlinkCondominioFromDevelopment(testDevId, testCondoId);
    const condos = listCondominiosLinkedToDevelopment(testDevId);
    const found = condos.find((c) => c.id === testCondoId);
    assert.equal(found, undefined, "El condominio no debe estar vinculado después de desvincularlo");

    // Re-vincular para tests posteriores
    linkCondominioToDevelopment(testDevId, testCondoId);
  });

  it("setCondominioDevelopment asigna un solo desarrollo y reemplaza el anterior", () => {
    setCondominioDevelopment(testCondoId, testDevId);
    const assigned = getDevelopmentForCondominio(testCondoId);
    assert.equal(assigned?.id, testDevId);

    setCondominioDevelopment(testCondoId, null);
    assert.equal(getDevelopmentForCondominio(testCondoId), null);

    setCondominioDevelopment(testCondoId, testDevId);
  });

  it("resolveDevelopmentAssignment crea un desarrollo nuevo por nombre", () => {
    const name = `Dev Nuevo ${Date.now()}`;
    const id = resolveDevelopmentAssignment({ newDevelopmentName: name });
    assert.ok(id && id > 0, "Debe devolver un id de desarrollo");
    const again = resolveDevelopmentAssignment({ newDevelopmentName: name });
    assert.equal(again, id, "El mismo nombre reutiliza el desarrollo");
    db.prepare("DELETE FROM developments WHERE id = ?").run(id);
  });

  it("listPublicCondominiosForDevelopment retorna condominios vinculados", () => {
    const condos = listPublicCondominiosForDevelopment(testDevId);
    assert.ok(Array.isArray(condos), "Debe ser array");
    const found = condos.find((c) => c.id === testCondoId);
    assert.ok(found, "Condominio vinculado debe aparecer");
  });

  it("listPublicCondominiosForDevelopment NO expone PII", () => {
    const condos = listPublicCondominiosForDevelopment(testDevId);
    for (const c of condos) {
      const keys = Object.keys(c);
      assert.ok(keys.includes("id"), "Debe tener id");
      assert.ok(keys.includes("name"), "Debe tener name");
      // No debe exponer campos con PII de residentes
      assert.ok(!keys.includes("nombre"), "No debe tener nombre de residente");
      assert.ok(!keys.includes("email"), "No debe tener email");
      assert.ok(!keys.includes("celular"), "No debe tener celular");
    }
  });
});

// ── C) Viviendas por condominio (sin PII) ─────────────────────────────────────

describe("listPublicViviendasForCondominio (sin PII)", () => {
  it("retorna viviendas del condominio con num_vivienda", () => {
    const viviendas = listPublicViviendasForCondominio(testCondoId);
    assert.ok(Array.isArray(viviendas), "Debe ser array");
    const nums = viviendas.map((v) => v.numVivienda);
    assert.ok(nums.includes(101), "Debe incluir vivienda 101");
    assert.ok(nums.includes(102), "Debe incluir vivienda 102");
  });

  it("listPublicViviendasForCondominio NO expone PII (nombre, email, celular)", () => {
    const viviendas = listPublicViviendasForCondominio(testCondoId);
    for (const v of viviendas) {
      const keys = Object.keys(v);
      // Solo debe exponer id de residente y num_vivienda
      assert.ok(!keys.includes("nombre"), "No debe exponer nombre");
      assert.ok(!keys.includes("email"), "No debe exponer email");
      assert.ok(!keys.includes("celular"), "No debe exponer celular");
      assert.ok(!keys.includes("nombre_contacto1"), "No debe exponer contactos");
      assert.ok(keys.includes("numVivienda"), "Debe exponer numVivienda");
    }
  });

  it("retorna array vacío para condominio sin residentes", () => {
    // ID que no existe
    const viviendas = listPublicViviendasForCondominio(999999);
    assert.deepEqual(viviendas, []);
  });
});
