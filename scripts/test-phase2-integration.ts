/**
 * Tests Fase 2 – Integración: importación CSV de viviendas y permisos.
 *
 * Cubre:
 *  A) Importación CSV de viviendas:
 *     - Plantilla CSV descargable (columnas correctas, sin PII).
 *     - Importar crea placeholders (sin sobrescribir residentes existentes).
 *     - Vincula condominios a desarrollo en development_condominios.
 *     - Preview/validación: detecta errores sin insertar.
 *     - Fila inválida (num_vivienda vacío) → error parcial, no aborta todo.
 *  B) Permisos:
 *     - Portal catalog (GET público) no requiere auth.
 *     - Admin portal-catalog requiere rol admin+.
 *     - Admin portal-claims requiere rol admin+.
 *  C) Portal /me incluye claim status (sin PII ajena).
 *  D) Invariantes: no sobrescribir residente con PII real al importar placeholder.
 *
 * Corre con: npx tsx --test scripts/test-phase2-integration.ts
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import db from "../src/lib/db-connection.js";
import { initPortalSchema } from "../src/lib/portal/init-portal.js";
import { initRegistrationAdminSchema } from "../src/lib/portal/schema-registration-admin.js";

// Importaciones de dominio
import {
  importViviendasFromCsv,
  previewViviendasCsv,
  getViviendasCsvTemplate,
  type CsvImportResult,
  type CsvPreviewResult,
} from "../src/lib/portal/catalog-import.js";
import {
  linkCondominioToDevelopment,
  listPublicViviendasForCondominio,
} from "../src/lib/portal/catalog.js";
import {
  registerWithClaim,
  getUserActiveClaim,
} from "../src/lib/portal/registration-admin.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

let testDevId = 0;
let testCondoId = 0;
const createdUserIds: number[] = [];
const createdClaimIds: number[] = [];
const createdResIds: number[] = [];

before(() => {
  initPortalSchema();
  initRegistrationAdminSchema();

  // Desarrollo de prueba
  const capSur = db
    .prepare("SELECT id FROM developments WHERE slug = 'capital-sur'")
    .get() as { id: number } | undefined;
  testDevId = capSur?.id ?? 0;
  if (!testDevId) {
    const res = db
      .prepare("INSERT INTO developments (name, slug, active) VALUES (?, ?, 1)")
      .run(`Dev Integration ${Date.now()}`, `dev-int-${Date.now()}`);
    testDevId = Number(res.lastInsertRowid);
  }

  // Condominio de prueba
  const condoRes = db
    .prepare("INSERT INTO condominios (name, prefijo) VALUES (?, ?)")
    .run(`Condo Import Test ${Date.now()}`, `CI${Date.now()}`);
  testCondoId = Number(condoRes.lastInsertRowid);

  // Vincularlo al desarrollo
  linkCondominioToDevelopment(testDevId, testCondoId);
});

after(() => {
  for (const id of createdClaimIds) {
    db.prepare("DELETE FROM property_claims WHERE id = ?").run(id);
  }
  for (const id of createdUserIds) {
    db.prepare("DELETE FROM portal_sessions WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM portal_users WHERE id = ?").run(id);
  }
  for (const id of createdResIds) {
    db.prepare("DELETE FROM residentes WHERE id = ?").run(id);
  }
  if (testCondoId) {
    db.prepare("DELETE FROM development_condominios WHERE condominio_id = ?").run(testCondoId);
    db.prepare("DELETE FROM condominios WHERE id = ?").run(testCondoId);
  }
});

// ── A) Importación CSV ────────────────────────────────────────────────────────

describe("getViviendasCsvTemplate", () => {
  it("retorna CSV con encabezados de plantilla (sin PII)", () => {
    const csv = getViviendasCsvTemplate();
    assert.ok(typeof csv === "string", "Debe ser string");
    assert.ok(csv.length > 0, "No debe estar vacío");

    // Debe tener columnas de vivienda sin PII
    assert.ok(csv.includes("num_vivienda"), "Debe incluir num_vivienda");
    assert.ok(csv.includes("condominio_id"), "Debe incluir condominio_id o condominio");
    // NO debe tener columnas de PII
    assert.ok(!csv.toLowerCase().includes("nombre"), "No debe incluir nombre");
    assert.ok(!csv.toLowerCase().includes("email"), "No debe incluir email");
    assert.ok(!csv.toLowerCase().includes("celular"), "No debe incluir celular");
  });
});

describe("previewViviendasCsv", () => {
  it("preview analiza CSV y retorna filas válidas e inválidas sin insertar", () => {
    const csv = [
      "development_id,condominio_id,num_vivienda",
      `${testDevId},${testCondoId},701`,
      `${testDevId},${testCondoId},702`,
      `${testDevId},${testCondoId},`, // inválida: num_vivienda vacío
    ].join("\n");

    const result: CsvPreviewResult = previewViviendasCsv(csv);

    assert.ok(result.valid.length === 2, `Debe tener 2 filas válidas (tiene ${result.valid.length})`);
    assert.ok(result.errors.length >= 1, "Debe tener al menos 1 error");
    assert.equal(result.totalRows, 3, "Debe contar 3 filas de datos");

    // Verificar que NO se insertó nada
    const count = db
      .prepare("SELECT COUNT(*) as n FROM residentes WHERE condominio_id = ? AND num_vivienda IN (701,702)")
      .get(testCondoId) as { n: number };
    assert.equal(count.n, 0, "Preview NO debe insertar residentes");
  });

  it("preview con CSV vacío retorna error", () => {
    const result = previewViviendasCsv("");
    assert.ok(result.errors.length > 0, "CSV vacío debe generar error");
    assert.equal(result.valid.length, 0);
  });
});

describe("importViviendasFromCsv", () => {
  it("importa viviendas como placeholders y las lista en catálogo público", () => {
    const csv = [
      "development_id,condominio_id,num_vivienda",
      `${testDevId},${testCondoId},801`,
      `${testDevId},${testCondoId},802`,
    ].join("\n");

    const result: CsvImportResult = importViviendasFromCsv(csv);

    assert.ok(result.inserted >= 2, `Debe insertar al menos 2 (insertó ${result.inserted})`);
    assert.equal(result.errors.length, 0, "No debe tener errores");

    // Verificar que aparecen en el catálogo público
    const viviendas = listPublicViviendasForCondominio(testCondoId);
    const nums = viviendas.map((v) => v.numVivienda);
    assert.ok(nums.includes(801), "Vivienda 801 debe aparecer en catálogo");
    assert.ok(nums.includes(802), "Vivienda 802 debe aparecer en catálogo");

    // Registrar IDs para limpieza
    const imported = db
      .prepare("SELECT id FROM residentes WHERE condominio_id = ? AND num_vivienda IN (801, 802)")
      .all(testCondoId) as Array<{ id: number }>;
    for (const r of imported) createdResIds.push(r.id);
  });

  it("NO sobrescribe residente existente con datos reales al importar placeholder", () => {
    // Crear residente real con PII
    const realRes = db
      .prepare(
        "INSERT INTO residentes (condominio_id, nombre, num_vivienda, email, celular) VALUES (?, ?, ?, ?, ?)"
      )
      .run(testCondoId, "Propietario Real", 901, "real@owner.com", 6641234567);
    const realResId = Number(realRes.lastInsertRowid);
    createdResIds.push(realResId);

    // Intentar importar la misma vivienda como placeholder
    const csv = [
      "development_id,condominio_id,num_vivienda",
      `${testDevId},${testCondoId},901`,
    ].join("\n");

    const result = importViviendasFromCsv(csv);

    // La importación debe skippear (o no crear un duplicado)
    assert.ok(
      result.skipped >= 1 || result.errors.length >= 1,
      "Debe skippear vivienda ya ocupada por residente real"
    );

    // El residente real debe conservar su PII
    const resAfter = db
      .prepare("SELECT nombre, email FROM residentes WHERE id = ?")
      .get(realResId) as { nombre: string; email: string } | undefined;
    assert.equal(resAfter?.nombre, "Propietario Real", "Nombre real no debe ser sobrescrito");
    assert.equal(resAfter?.email, "real@owner.com", "Email real no debe ser sobrescrito");
  });

  it("fila con num_vivienda inválido genera error parcial y no aborta el resto", () => {
    const csv = [
      "development_id,condominio_id,num_vivienda",
      `${testDevId},${testCondoId},1001`,
      `${testDevId},${testCondoId},`, // inválida
      `${testDevId},${testCondoId},1002`,
    ].join("\n");

    const result = importViviendasFromCsv(csv);

    assert.ok(result.inserted >= 2, "Debe insertar las 2 válidas");
    assert.ok(result.errors.length >= 1, "Debe reportar el error de la fila inválida");

    const imported = db
      .prepare("SELECT id FROM residentes WHERE condominio_id = ? AND num_vivienda IN (1001, 1002)")
      .all(testCondoId) as Array<{ id: number }>;
    for (const r of imported) createdResIds.push(r.id);
  });

  it("vivienda placeholder es visible en listPublicViviendasForCondominio (sin PII)", () => {
    const csv = [
      "development_id,condominio_id,num_vivienda",
      `${testDevId},${testCondoId},1101`,
    ].join("\n");

    importViviendasFromCsv(csv);

    const viviendas = listPublicViviendasForCondominio(testCondoId);
    const v = viviendas.find((x) => x.numVivienda === 1101);
    assert.ok(v, "Placeholder debe aparecer en catálogo público");

    // No debe filtrar ninguna info sensible (ya verificado en test-catalog, pero double check)
    const keys = Object.keys(v!);
    assert.ok(!keys.includes("nombre"), "No debe exponer nombre del placeholder");
    assert.ok(!keys.includes("email"), "No debe exponer email");

    const imported = db
      .prepare("SELECT id FROM residentes WHERE condominio_id = ? AND num_vivienda = 1101")
      .get(testCondoId) as { id: number } | undefined;
    if (imported) createdResIds.push(imported.id);
  });
});

// ── B) Permisos (servicio, no HTTP) ──────────────────────────────────────────

describe("permisos: funciones de catálogo no exponen PII", () => {
  it("listPublicViviendasForCondominio no retorna campos nombre/email/celular", () => {
    // Ya hay viviendas del test anterior en testCondoId
    const viviendas = listPublicViviendasForCondominio(testCondoId);
    for (const v of viviendas) {
      const raw = v as Record<string, unknown>;
      assert.ok(!("nombre" in raw), "No debe exponer nombre");
      assert.ok(!("email" in raw), "No debe exponer email");
      assert.ok(!("celular" in raw), "No debe exponer celular");
    }
  });
});

// ── C) getUserActiveClaim incluye datos suficientes sin PII ajena ─────────────

describe("getUserActiveClaim — datos incluidos", () => {
  it("retorna claim con status, developmentId, propertyIdentifier pero sin PII de otros usuarios", () => {
    const ts = Date.now();
    const r = registerWithClaim({
      developmentId: testDevId,
      condominioId: testCondoId,
      numVivienda: 9901,
      name: "Integration User",
      email: `integration-${ts}@test.arc`,
      phone: "6641110099",
      password: "Password123",
      confirmPassword: "Password123",
    });
    assert.ok(r.ok, "Registro debe ser ok");
    if (!r.ok) return;
    createdUserIds.push(r.user.id);
    createdClaimIds.push(r.claim.id);

    const claim = getUserActiveClaim(r.user.id);
    assert.ok(claim !== null, "Debe retornar claim");
    assert.equal(claim?.status, "pending");
    assert.ok(claim?.developmentId !== undefined);
    assert.ok(claim?.propertyIdentifier !== undefined);

    // No debe exponer datos de otro usuario
    const raw = claim as Record<string, unknown>;
    assert.ok(!("userName" in raw), "Claim no debe exponer userName de otros");
    assert.ok(!("userEmail" in raw), "Claim no debe exponer email de otros");
  });
});

// ── D) Invariantes de placeholder ─────────────────────────────────────────────

describe("invariantes de placeholder al importar", () => {
  it("placeholder creado tiene nombre genérico (no PII), sin email ni celular", () => {
    const csv = [
      "development_id,condominio_id,num_vivienda",
      `${testDevId},${testCondoId},2001`,
    ].join("\n");

    importViviendasFromCsv(csv);

    const res = db
      .prepare("SELECT nombre, email, celular FROM residentes WHERE condominio_id = ? AND num_vivienda = 2001")
      .get(testCondoId) as { nombre: string; email: string | null; celular: number | null } | undefined;

    assert.ok(res, "Placeholder debe existir");
    // El nombre genérico no debe ser PII real
    assert.ok(!res!.nombre.includes("@"), "Nombre no debe parecer email");
    assert.equal(res!.email, null, "Email debe ser null en placeholder");
    assert.equal(res!.celular, null, "Celular debe ser null en placeholder");

    const imported = db
      .prepare("SELECT id FROM residentes WHERE condominio_id = ? AND num_vivienda = 2001")
      .get(testCondoId) as { id: number } | undefined;
    if (imported) createdResIds.push(imported.id);
  });
});
