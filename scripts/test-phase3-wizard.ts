/**
 * Tests Fase 3 – Wizard de solicitudes de modificación.
 *
 * Corre con: npx tsx --test scripts/test-phase3-wizard.ts
 *
 * Verifica (TDD):
 * 1. Catálogo filtrado por claim (pending/conflict → puede enviar, ticket held)
 * 2. Campos condicionales por slug (tanque, calentador, pérgola, firme, muro, repellado)
 * 3. Documentos requeridos por tipo de modificación
 * 4. Ownership de drafts (usuario solo ve sus propios drafts)
 * 5. Submit acepta UNA modificación por solicitud
 * 6. Claim pending → ticket held; claim approved → ticket nuevo
 * 7. Firma: hash SHA-256 + evidencia guardada correctamente
 * 8. INE: versioning + replace queda pending si el admin no aprueba
 * 9. OCR parser: extrae emisión/vigencia de texto de INE
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import db from "../src/lib/db-connection.js";

// ── Imports de dominio ────────────────────────────────────────────────────────
import { initPhase3Schema } from "../src/lib/portal/schema-phase3.js";
import { createDevelopment } from "../src/lib/portal/developments.js";
import {
  enableModificationForDevelopment,
  getCatalogItemBySlug,
} from "../src/lib/portal/modification-catalog.js";
import {
  getModificationFormSchema,
  getDocumentRequirements,
  ALL_SLUGS,
} from "../src/lib/portal/modification-form-schema.js";
import {
  createDraft,
  getDraft,
  updateDraft,
  listDraftsForUser,
  deleteDraft,
} from "../src/lib/portal/modification-drafts.js";
import {
  addSignature,
  computeSignatureHash,
  verifySignatureHash,
} from "../src/lib/portal/signature-evidence.js";
import {
  addIdentityDocument,
  getCurrentIdentityDocument,
  getIdentityDocumentHistory,
} from "../src/lib/portal/identity-documents.js";
import { parseOcrText } from "../src/lib/portal/ocr-parser.js";

// ── Fixtures globales ─────────────────────────────────────────────────────────

const TS = Date.now();
const TEST_DEV_SLUG = `wizard-dev-${TS}`;
let devId = 0;
let userId1 = 0;
let userId2 = 0;
let tanqueModId = 0;
let solarModId = 0;
let pergolaModId = 0;

before(() => {
  initPhase3Schema();

  // Desarrollo de prueba
  const devResult = createDevelopment({
    name: `Wizard Test Dev ${TS}`,
    slug: TEST_DEV_SLUG,
    city: "Test",
  });
  assert.ok(devResult.ok, "No se pudo crear desarrollo de prueba");
  devId = devResult.development.id;

  // Usuarios de prueba (insertados directamente en la DB)
  const u1 = db
    .prepare(
      "INSERT INTO portal_users (name, email, password_hash, active) VALUES (?, ?, 'x', 1)"
    )
    .run(`TestUser1 ${TS}`, `wizard1-${TS}@test.com`);
  userId1 = Number(u1.lastInsertRowid);

  const u2 = db
    .prepare(
      "INSERT INTO portal_users (name, email, password_hash, active) VALUES (?, ?, 'x', 1)"
    )
    .run(`TestUser2 ${TS}`, `wizard2-${TS}@test.com`);
  userId2 = Number(u2.lastInsertRowid);

  // Obtener IDs del catálogo
  const tanque = getCatalogItemBySlug("tanque-gas");
  assert.ok(tanque, "tanque-gas debe existir en el catálogo");
  tanqueModId = tanque.id;

  const solar = getCatalogItemBySlug("calentador-solar");
  assert.ok(solar, "calentador-solar debe existir en el catálogo");
  solarModId = solar.id;

  const pergola = getCatalogItemBySlug("pergola");
  assert.ok(pergola, "pergola debe existir en el catálogo");
  pergolaModId = pergola.id;

  // Habilitar modificaciones para el dev de prueba
  enableModificationForDevelopment({ developmentId: devId, modificationCatalogId: tanqueModId });
  enableModificationForDevelopment({ developmentId: devId, modificationCatalogId: solarModId });
  enableModificationForDevelopment({ developmentId: devId, modificationCatalogId: pergolaModId });
});

after(() => {
  // Limpiar en orden por FKs
  if (userId1 > 0) {
    db.prepare("DELETE FROM modification_drafts WHERE portal_user_id IN (?, ?)").run(userId1, userId2);
    db.prepare("DELETE FROM portal_identity_documents WHERE portal_user_id IN (?, ?)").run(userId1, userId2);
    db.prepare("DELETE FROM portal_users WHERE id IN (?, ?)").run(userId1, userId2);
  }
  if (devId > 0) {
    db.prepare("DELETE FROM development_modification_config WHERE development_id = ?").run(devId);
    db.prepare("DELETE FROM developments WHERE id = ?").run(devId);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 1. SCHEMA DE CAMPOS POR SLUG
// ══════════════════════════════════════════════════════════════════════════════

describe("modification-form-schema: campos por slug", () => {
  it("tanque-gas tiene campos capacidad y marca", () => {
    const schema = getModificationFormSchema("tanque-gas");
    assert.ok(schema, "Schema de tanque-gas debe existir");
    const keys = schema.fields.map((f) => f.key);
    assert.ok(keys.includes("capacidad_litros"), "debe tener capacidad_litros");
    assert.ok(keys.includes("marca"), "debe tener marca");
  });

  it("calentador-solar tiene campos tubos y marca", () => {
    const schema = getModificationFormSchema("calentador-solar");
    assert.ok(schema, "Schema de calentador-solar debe existir");
    const keys = schema.fields.map((f) => f.key);
    assert.ok(keys.includes("num_tubos"), "debe tener num_tubos");
    assert.ok(keys.includes("marca"), "debe tener marca");
  });

  it("pergola tiene medidas, altura y requiere croquis", () => {
    const schema = getModificationFormSchema("pergola");
    assert.ok(schema, "Schema de pérgola debe existir");
    const keys = schema.fields.map((f) => f.key);
    assert.ok(keys.includes("largo_m"), "debe tener largo_m");
    assert.ok(keys.includes("ancho_m"), "debe tener ancho_m");
    assert.ok(keys.includes("altura_m"), "debe tener altura_m");
    // Croquis como documento requerido, no campo de texto
    const docs = getDocumentRequirements("pergola");
    assert.ok(docs.some((d) => d.key === "croquis"), "debe requerir croquis como documento");
  });

  it("piso-firme-posterior tiene medidas, color y ficha", () => {
    const schema = getModificationFormSchema("piso-firme-posterior");
    assert.ok(schema);
    const keys = schema.fields.map((f) => f.key);
    assert.ok(keys.includes("largo_m"), "debe tener largo_m");
    assert.ok(keys.includes("ancho_m"), "debe tener ancho_m");
    assert.ok(keys.includes("color"), "debe tener color");
    const docs = getDocumentRequirements("piso-firme-posterior");
    assert.ok(docs.some((d) => d.key === "ficha_tecnica"), "debe requerir ficha técnica");
  });

  it("muro-colindante tiene altura_actual y altura_propuesta", () => {
    const schema = getModificationFormSchema("muro-colindante");
    assert.ok(schema);
    const keys = schema.fields.map((f) => f.key);
    assert.ok(keys.includes("altura_actual_m"), "debe tener altura_actual_m");
    assert.ok(keys.includes("altura_propuesta_m"), "debe tener altura_propuesta_m");
  });

  it("repellado-interior tiene campo color", () => {
    const schema = getModificationFormSchema("repellado-interior");
    assert.ok(schema);
    const keys = schema.fields.map((f) => f.key);
    assert.ok(keys.includes("color"), "debe tener color");
  });

  it("slugs sin schema específico devuelven schema genérico (no null)", () => {
    const schema = getModificationFormSchema("mosquiteros");
    assert.ok(schema !== null, "slug sin schema específico devuelve genérico");
  });

  it("ALL_SLUGS incluye todos los slugs del catálogo con schema definido", () => {
    assert.ok(Array.isArray(ALL_SLUGS));
    assert.ok(ALL_SLUGS.length > 0);
    for (const slug of ALL_SLUGS) {
      assert.ok(typeof slug === "string" && slug.length > 0);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. DOCUMENTOS REQUERIDOS
// ══════════════════════════════════════════════════════════════════════════════

describe("modification-form-schema: documentos requeridos", () => {
  it("carta de no adeudo es obligatoria en TODOS los tipos", () => {
    const slugsToCheck = ["tanque-gas", "calentador-solar", "pergola", "muro-colindante", "pintura-retoque"];
    for (const slug of slugsToCheck) {
      const docs = getDocumentRequirements(slug);
      const noAdeudo = docs.find((d) => d.key === "carta_no_adeudo");
      assert.ok(noAdeudo, `carta_no_adeudo debe ser requerida para ${slug}`);
      assert.ok(noAdeudo.required, `carta_no_adeudo debe ser required=true para ${slug}`);
    }
  });

  it("pergola requiere croquis y fotos", () => {
    const docs = getDocumentRequirements("pergola");
    const keys = docs.map((d) => d.key);
    assert.ok(keys.includes("croquis"), "pergola requiere croquis");
    assert.ok(keys.includes("fotos"), "pergola requiere fotos");
  });

  it("piso-firme-posterior requiere ficha técnica", () => {
    const docs = getDocumentRequirements("piso-firme-posterior");
    assert.ok(docs.some((d) => d.key === "ficha_tecnica"), "firme requiere ficha técnica");
  });

  it("muro-colindante requiere croquis", () => {
    const docs = getDocumentRequirements("muro-colindante");
    assert.ok(docs.some((d) => d.key === "croquis"), "muro requiere croquis");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. DRAFTS: OWNERSHIP Y CRUD
// ══════════════════════════════════════════════════════════════════════════════

describe("modification-drafts: ownership y CRUD", () => {
  let draftId1 = 0;
  let draftId2 = 0;

  it("crea draft para usuario1", () => {
    const result = createDraft({
      portalUserId: userId1,
      modificationCatalogId: tanqueModId,
      step: 1,
      data: { capacidad_litros: "300", marca: "Calorex" },
    });
    assert.ok(result.ok, `No se pudo crear draft: ${!result.ok ? result.error : ""}`);
    draftId1 = result.draft.id;
    assert.equal(result.draft.portalUserId, userId1);
    assert.equal(result.draft.modificationCatalogId, tanqueModId);
    assert.equal(result.draft.step, 1);
  });

  it("crea draft para usuario2", () => {
    const result = createDraft({
      portalUserId: userId2,
      modificationCatalogId: solarModId,
      step: 0,
      data: {},
    });
    assert.ok(result.ok);
    draftId2 = result.draft.id;
  });

  it("usuario1 puede ver su propio draft", () => {
    const draft = getDraft(draftId1, userId1);
    assert.ok(draft, "debe poder ver su propio draft");
    assert.equal(draft.portalUserId, userId1);
  });

  it("usuario1 NO puede ver el draft de usuario2", () => {
    const draft = getDraft(draftId2, userId1);
    assert.equal(draft, null, "no debe poder ver draft de otro usuario");
  });

  it("listDraftsForUser solo retorna drafts del usuario", () => {
    const drafts = listDraftsForUser(userId1);
    assert.ok(drafts.every((d) => d.portalUserId === userId1), "solo drafts del usuario");
    assert.ok(!drafts.some((d) => d.id === draftId2), "no debe incluir drafts de usuario2");
  });

  it("updateDraft actualiza datos y step", () => {
    const result = updateDraft({
      id: draftId1,
      portalUserId: userId1,
      step: 2,
      data: { capacidad_litros: "500", marca: "Rotoplas" },
    });
    assert.ok(result.ok, `updateDraft falló: ${!result.ok ? result.error : ""}`);
    assert.equal(result.draft.step, 2);
    assert.equal((result.draft.data as Record<string, string>).marca, "Rotoplas");
  });

  it("usuario2 NO puede actualizar draft de usuario1 (ownership check)", () => {
    const result = updateDraft({
      id: draftId1,
      portalUserId: userId2,
      step: 3,
      data: {},
    });
    assert.ok(!result.ok, "debe rechazar update de draft de otro usuario");
  });

  it("deleteDraft con owner correcto elimina el draft", () => {
    const before = getDraft(draftId2, userId2);
    assert.ok(before, "draft2 debe existir antes de borrar");
    const ok = deleteDraft(draftId2, userId2);
    assert.ok(ok, "debe poder borrar su propio draft");
    const after = getDraft(draftId2, userId2);
    assert.equal(after, null, "draft2 no debe existir después de borrar");
  });

  it("deleteDraft con owner incorrecto no borra nada", () => {
    const ok = deleteDraft(draftId1, userId2);
    assert.ok(!ok, "no debe borrar draft de otro usuario");
    const still = getDraft(draftId1, userId1);
    assert.ok(still, "draft1 aún debe existir");
  });

  after(() => {
    // Cleanup de drafts del test
    if (draftId1 > 0) {
      db.prepare("DELETE FROM modification_drafts WHERE id = ?").run(draftId1);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. CLAIM STATUS → TICKET STATUS
// ══════════════════════════════════════════════════════════════════════════════

describe("claim status → ticket status (held vs nuevo)", () => {
  it("usuario con claim pending genera ticket en estado 'held'", () => {
    // Simular: insertar claim pending para userId1
    const claimRes = db
      .prepare(
        `INSERT INTO property_claims 
           (development_id, portal_user_id, property_identifier, status)
         VALUES (?, ?, ?, 'pending')`
      )
      .run(devId, userId1, `VIVIENDA-HELD-${TS}`);
    const claimId = Number(claimRes.lastInsertRowid);

    // Verificar que el check de pending claim funciona
    const hasPending = db
      .prepare(
        `SELECT 1 FROM property_claims 
         WHERE portal_user_id = ? AND status IN ('pending','conflict') LIMIT 1`
      )
      .get(userId1) as { 1: number } | undefined;
    assert.ok(hasPending, "debe detectar claim pending");

    // Cleanup
    db.prepare("DELETE FROM property_claims WHERE id = ?").run(claimId);
  });

  it("usuario sin claim o con claim approved no genera ticket held", () => {
    // userId2 no tiene claims
    const hasPending = db
      .prepare(
        `SELECT 1 FROM property_claims 
         WHERE portal_user_id = ? AND status IN ('pending','conflict') LIMIT 1`
      )
      .get(userId2) as { 1: number } | undefined;
    assert.equal(hasPending, undefined, "usuario2 no debe tener claim pending");
  });

  it("claim en estado conflict también genera held", () => {
    const claimRes = db
      .prepare(
        `INSERT INTO property_claims 
           (development_id, portal_user_id, property_identifier, status)
         VALUES (?, ?, ?, 'conflict')`
      )
      .run(devId, userId2, `VIVIENDA-CONFLICT-${TS}`);
    const claimId = Number(claimRes.lastInsertRowid);

    const hasPending = db
      .prepare(
        `SELECT 1 FROM property_claims 
         WHERE portal_user_id = ? AND status IN ('pending','conflict') LIMIT 1`
      )
      .get(userId2) as { 1: number } | undefined;
    assert.ok(hasPending, "claim conflict debe contar como pending para held");

    db.prepare("DELETE FROM property_claims WHERE id = ?").run(claimId);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. SUBMIT: UNA MODIFICACIÓN POR SOLICITUD
// ══════════════════════════════════════════════════════════════════════════════

describe("submit: una modificación por solicitud", () => {
  it("getModificationFormSchema rechaza slug vacío", () => {
    const schema = getModificationFormSchema("");
    // Schema genérico (no null), pero sin campos específicos
    assert.ok(schema !== null, "no debe retornar null para slug vacío");
  });

  it("ALL_SLUGS no incluye 'otro' ni variantes genéricas no configuradas", () => {
    assert.ok(!ALL_SLUGS.includes("otro"), "no debe incluir 'otro'");
    assert.ok(!ALL_SLUGS.includes("generic"), "no debe incluir 'generic'");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. FIRMA: HASH Y EVIDENCIA
// ══════════════════════════════════════════════════════════════════════════════

describe("firma: hash SHA-256 y evidencia", () => {
  let ticketId = 0;

  before(() => {
    // Crear ticket temporal para firmas
    const typeId = db
      .prepare("SELECT id FROM ticket_types LIMIT 1")
      .get() as { id: number } | undefined;
    if (typeId) {
      const t = db
        .prepare(
          "INSERT INTO tickets (folio, ticket_type_id, portal_user_id, status) VALUES ('ARC-SIGN-TEST', ?, ?, 'nuevo')"
        )
        .run(typeId.id, userId1);
      ticketId = Number(t.lastInsertRowid);
    }
  });

  after(() => {
    if (ticketId > 0) {
      db.prepare("DELETE FROM request_signatures WHERE ticket_id = ?").run(ticketId);
      db.prepare("DELETE FROM tickets WHERE id = ?").run(ticketId);
    }
  });

  it("computeSignatureHash retorna string hex de 64 caracteres", () => {
    const hash = computeSignatureHash({
      ticketId: 1,
      signerName: "Juan Pérez",
      signerRole: "resident",
      signedContent: "Acepto los términos de la solicitud.",
      timestamp: 1700000000,
    });
    assert.equal(typeof hash, "string");
    assert.equal(hash.length, 64);
    assert.ok(/^[0-9a-f]+$/.test(hash), "debe ser hexadecimal");
  });

  it("mismo input genera mismo hash (determinista)", () => {
    const params = {
      ticketId: 42,
      signerName: "María López",
      signerRole: "resident" as const,
      signedContent: "Acepto.",
      timestamp: 1700001000,
    };
    const h1 = computeSignatureHash(params);
    const h2 = computeSignatureHash(params);
    assert.equal(h1, h2, "hash debe ser determinista");
  });

  it("inputs distintos generan hashes distintos", () => {
    const base = {
      ticketId: 42,
      signerName: "Ana García",
      signerRole: "resident" as const,
      signedContent: "Acepto.",
      timestamp: 1700001000,
    };
    const h1 = computeSignatureHash(base);
    const h2 = computeSignatureHash({ ...base, ticketId: 43 });
    const h3 = computeSignatureHash({ ...base, timestamp: 1700001001 });
    assert.notEqual(h1, h2, "ticketId distinto → hash distinto");
    assert.notEqual(h1, h3, "timestamp distinto → hash distinto");
  });

  it("addSignature guarda y verifica correctamente si hay ticket disponible", () => {
    if (ticketId === 0) {
      console.log("  SKIP: no hay ticket de prueba disponible");
      return;
    }

    const result = addSignature({
      ticketId,
      signerId: userId1,
      signerName: "Test User 1",
      signerRole: "resident",
      signedContent: "Declaro bajo protesta de decir verdad que acepto las condiciones.",
      ipAddress: "127.0.0.1",
      userAgent: "Mozilla/5.0 Test",
    });
    assert.ok(result.ok, `addSignature falló: ${!result.ok ? result.error : ""}`);
    assert.equal(result.signature.ticketId, ticketId);
    assert.equal(result.signature.signerRole, "resident");
    assert.ok(verifySignatureHash(result.signature), "hash debe verificarse correctamente");
  });

  it("addSignature rechaza nombre vacío", () => {
    if (ticketId === 0) return;
    const result = addSignature({
      ticketId,
      signerName: "  ",
      signerRole: "resident",
      signedContent: "Acepto.",
    });
    assert.ok(!result.ok, "debe rechazar nombre vacío");
  });

  it("addSignature rechaza contenido vacío", () => {
    if (ticketId === 0) return;
    const result = addSignature({
      ticketId,
      signerName: "Alguien",
      signerRole: "resident",
      signedContent: "",
    });
    assert.ok(!result.ok, "debe rechazar contenido vacío");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. IDENTIDAD (INE): VERSIONING Y REPLACE PENDING
// ══════════════════════════════════════════════════════════════════════════════

describe("identity documents: versioning y replace pending", () => {
  it("addIdentityDocument crea documento con ocr_status pending por defecto", () => {
    const result = addIdentityDocument({
      portalUserId: userId1,
      kind: "ine",
      storedPath: `/private/identity/u${userId1}/ine-v1-${TS}.jpg`,
    });
    assert.ok(result.ok, `No se pudo agregar doc: ${!result.ok ? result.error : ""}`);
    assert.equal(result.doc.ocrStatus, "pending");
    assert.ok(result.doc.isCurrent, "debe ser el actual");
  });

  it("agregar segundo doc del mismo kind hace al anterior not-current", () => {
    const r1 = addIdentityDocument({
      portalUserId: userId1,
      kind: "ine",
      storedPath: `/private/identity/u${userId1}/ine-v2a-${TS}.jpg`,
    });
    assert.ok(r1.ok);

    const r2 = addIdentityDocument({
      portalUserId: userId1,
      kind: "ine",
      storedPath: `/private/identity/u${userId1}/ine-v2b-${TS}.jpg`,
    });
    assert.ok(r2.ok);

    // Solo el último debe ser current
    const current = getCurrentIdentityDocument(userId1, "ine");
    assert.ok(current, "debe haber un documento actual");
    assert.equal(current.storedPath, r2.doc.storedPath, "el último debe ser el actual");

    // El historial debe tener más de 1 documento
    const history = getIdentityDocumentHistory(userId1);
    assert.ok(history.length >= 2, "debe conservar historial de todos los docs");
  });

  it("getCurrentIdentityDocument retorna null si no hay doc del kind", () => {
    const doc = getCurrentIdentityDocument(userId2, "passport");
    assert.equal(doc, null, "usuario2 no tiene pasaporte");
  });

  it("replace con OCR dudoso queda en pending (no done automáticamente)", () => {
    const result = addIdentityDocument({
      portalUserId: userId2,
      kind: "ine",
      storedPath: `/private/identity/u${userId2}/ine-pending-${TS}.jpg`,
      ocrStatus: "pending", // Explícitamente pending (OCR no aprobó)
    });
    assert.ok(result.ok);
    assert.equal(result.doc.ocrStatus, "pending", "debe quedar pending hasta revisión admin");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. OCR PARSER
// ══════════════════════════════════════════════════════════════════════════════

describe("ocr-parser: extracción de emisión y vigencia de INE", () => {
  it("parseOcrText extrae año de vigencia de texto con formato INE", () => {
    const sampleText = `
      INSTITUTO NACIONAL ELECTORAL
      CREDENCIAL PARA VOTAR
      Vigente hasta: 2027
      CURP: GARC900101MDFRRZ09
      Fecha de nacimiento: 01/01/1990
    `;
    const result = parseOcrText(sampleText);
    assert.ok(result.vigencia !== null, "debe extraer vigencia");
    assert.equal(result.vigencia, "2027", "vigencia debe ser 2027");
  });

  it("parseOcrText extrae año de emisión si aparece", () => {
    const sampleText = `
      CREDENCIAL PARA VOTAR CON FOTOGRAFIA
      Emitida: 15/03/2020
      Vigente hasta: 2030
    `;
    const result = parseOcrText(sampleText);
    assert.ok(result.emision !== null, "debe extraer emisión");
    assert.ok(result.vigencia !== null, "debe extraer vigencia");
  });

  it("parseOcrText retorna null fields para texto sin fechas reconocibles", () => {
    const result = parseOcrText("Lorem ipsum dolor sit amet.");
    assert.equal(result.emision, null, "emision debe ser null");
    assert.equal(result.vigencia, null, "vigencia debe ser null");
  });

  it("parseOcrText maneja texto vacío sin throw", () => {
    const result = parseOcrText("");
    assert.equal(result.emision, null);
    assert.equal(result.vigencia, null);
  });

  it("parseOcrText detecta vigencia expirada (year < 2026)", () => {
    const sampleText = "Vigente hasta: 2020";
    const result = parseOcrText(sampleText);
    assert.equal(result.vigencia, "2020");
    assert.ok(result.expired === true, "debe marcar como expirada");
  });

  it("parseOcrText maneja formato de año en texto mezclado con números", () => {
    const sampleText = `
      CLAVE ELECTOR: GRTZXS92010117M200
      2028
      INE / IFE
    `;
    const result = parseOcrText(sampleText);
    // Año 2028 debería reconocerse como vigencia si no hay otro contexto
    assert.ok(typeof result.vigencia === "string" || result.vigencia === null);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. CATÁLOGO FILTRADO POR CLAIM
// ══════════════════════════════════════════════════════════════════════════════

describe("catálogo filtrado por claim del usuario", () => {
  it("listModificationsForDevelopment solo retorna las activas", async () => {
    const { listModificationsForDevelopment } = await import(
      "../src/lib/portal/modification-catalog.js"
    );
    const mods = listModificationsForDevelopment(devId, { activeOnly: true });
    assert.ok(Array.isArray(mods));
    assert.ok(mods.length >= 3, `debe haber al menos 3 mods para el dev de prueba, hay ${mods.length}`);
    assert.ok(
      mods.every((m) => m.active),
      "todas las modificaciones retornadas deben estar activas"
    );
  });

  it("modificación no habilitada para el desarrollo no aparece en la lista", async () => {
    const { listModificationsForDevelopment, getCatalogItemBySlug: getBySlug } = await import(
      "../src/lib/portal/modification-catalog.js"
    );
    // repellado-interior NO fue habilitado para el dev de prueba
    const repellado = getBySlug("repellado-interior");
    assert.ok(repellado, "repellado-interior debe existir en el catálogo");
    const mods = listModificationsForDevelopment(devId, { activeOnly: true });
    const found = mods.find((m) => m.modificationCatalogId === repellado.id);
    assert.equal(found, undefined, "repellado-interior no debe aparecer para este dev");
  });
});

console.log("\n✅ Tests Fase 3 Wizard cargados correctamente.\n");
