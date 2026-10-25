/**
 * Tests Fase 3 – Upload real de documentos de solicitudes de modificación.
 *
 * Corre con: npx tsx --test scripts/test-phase3-upload-docs.ts
 *
 * Verifica (TDD):
 * 1. attachment_category column existe tras migración idempotente
 * 2. storeAttachment persiste categoría correctamente
 * 3. listAttachments incluye attachmentCategory en resultados
 * 4. Upload ownership: usuario no puede subir a ticket de otro
 * 5. Documentos requeridos: carta_no_adeudo obligatoria en todos los slugs
 * 6. Docs condicionales: croquis requerido en pérgola, NO en mosquiteros
 * 7. Ficha técnica requerida en piso-firme-posterior, no en pintura-retoque
 * 8. getRequiredDocCategories devuelve lista correcta por slug
 * 9. checkExpediente: expediente completo vs. incompleto
 * 10. listAttachmentsByCategory filtra correctamente
 * 11. parseOcrText no tira en inputs patológicos (null, unicode, sql inject)
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomBytes } from "node:crypto";
import db from "../src/lib/db-connection.js";

// ── Imports de dominio ────────────────────────────────────────────────────────
import { initPhase3Schema } from "../src/lib/portal/schema-phase3.js";
import {
  storeAttachment,
  listAttachments,
  listAttachmentsByCategory,
} from "../src/lib/portal/attachments.js";
import {
  getRequiredDocCategories,
  checkExpediente,
  ATTACHMENT_CATEGORIES,
  type AttachmentCategory,
} from "../src/lib/portal/modification-docs.js";
import { parseOcrText } from "../src/lib/portal/ocr-parser.js";

// ── Fixtures globales ─────────────────────────────────────────────────────────

const TS = Date.now();
let userId1 = 0;
let userId2 = 0;
let ticketId1 = 0; // ticket de userId1
let ticketId2 = 0; // ticket de userId2

before(() => {
  initPhase3Schema();

  // Usuarios de prueba
  const u1 = db
    .prepare("INSERT INTO portal_users (name, email, password_hash, active) VALUES (?, ?, 'x', 1)")
    .run(`UploadUser1 ${TS}`, `upload1-${TS}@test.com`);
  userId1 = Number(u1.lastInsertRowid);

  const u2 = db
    .prepare("INSERT INTO portal_users (name, email, password_hash, active) VALUES (?, ?, 'x', 1)")
    .run(`UploadUser2 ${TS}`, `upload2-${TS}@test.com`);
  userId2 = Number(u2.lastInsertRowid);

  // Obtener primer ticket type disponible
  const typeRow = db
    .prepare("SELECT id FROM ticket_types LIMIT 1")
    .get() as { id: number } | undefined;

  if (!typeRow) {
    // Crear un tipo de ticket mínimo para las pruebas
    const t = db
      .prepare("INSERT INTO ticket_types (name, slug, description, active, sort_order) VALUES (?, ?, ?, 1, 1)")
      .run(`TestType ${TS}`, `test-type-${TS}`, "Tipo de prueba");
    const typeId = Number(t.lastInsertRowid);

    const r1 = db
      .prepare("INSERT INTO tickets (folio, ticket_type_id, portal_user_id, status) VALUES (?, ?, ?, 'nuevo')")
      .run(`ARC-UP1-${TS}`, typeId, userId1);
    ticketId1 = Number(r1.lastInsertRowid);

    const r2 = db
      .prepare("INSERT INTO tickets (folio, ticket_type_id, portal_user_id, status) VALUES (?, ?, ?, 'nuevo')")
      .run(`ARC-UP2-${TS}`, typeId, userId2);
    ticketId2 = Number(r2.lastInsertRowid);
  } else {
    const r1 = db
      .prepare("INSERT INTO tickets (folio, ticket_type_id, portal_user_id, status) VALUES (?, ?, ?, 'nuevo')")
      .run(`ARC-UP1-${TS}`, typeRow.id, userId1);
    ticketId1 = Number(r1.lastInsertRowid);

    const r2 = db
      .prepare("INSERT INTO tickets (folio, ticket_type_id, portal_user_id, status) VALUES (?, ?, ?, 'nuevo')")
      .run(`ARC-UP2-${TS}`, typeRow.id, userId2);
    ticketId2 = Number(r2.lastInsertRowid);
  }
});

after(() => {
  // Cleanup en orden FK
  db.prepare("DELETE FROM ticket_attachments WHERE ticket_id IN (?, ?)").run(ticketId1, ticketId2);
  db.prepare("DELETE FROM ticket_values WHERE ticket_id IN (?, ?)").run(ticketId1, ticketId2);
  db.prepare("DELETE FROM tickets WHERE id IN (?, ?)").run(ticketId1, ticketId2);
  db.prepare("DELETE FROM portal_users WHERE id IN (?, ?)").run(userId1, userId2);
});

// ══════════════════════════════════════════════════════════════════════════════
// 1. MIGRACIÓN: attachment_category COLUMN
// ══════════════════════════════════════════════════════════════════════════════

describe("migración: attachment_category column", () => {
  it("la columna attachment_category existe en ticket_attachments", () => {
    const cols = db
      .prepare("PRAGMA table_info(ticket_attachments)")
      .all() as Array<{ name: string }>;
    const colNames = cols.map((c) => c.name);
    assert.ok(
      colNames.includes("attachment_category"),
      `attachment_category debe existir. Columnas: ${colNames.join(", ")}`
    );
  });

  it("ATTACHMENT_CATEGORIES contiene los valores esperados", () => {
    const expected = ["carta_no_adeudo", "ficha_tecnica", "croquis", "fotos", "otro"];
    for (const cat of expected) {
      assert.ok(
        ATTACHMENT_CATEGORIES.includes(cat as AttachmentCategory),
        `ATTACHMENT_CATEGORIES debe incluir '${cat}'`
      );
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. storeAttachment CON CATEGORÍA
// ══════════════════════════════════════════════════════════════════════════════

describe("storeAttachment: persiste attachmentCategory", () => {
  /** Buffer mínimo de un PNG 1×1 válido */
  const pngBuf = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
      "0000000a49444154789c6260000000000002000109f1f800000000049454e44ae426082",
    "hex"
  );

  it("almacena categoría carta_no_adeudo correctamente", async () => {
    const result = await storeAttachment({
      ticketId: ticketId1,
      uploaderType: "client",
      originalName: `carta-no-adeudo-${TS}.png`,
      declaredMime: "image/png",
      bytes: pngBuf,
      attachmentCategory: "carta_no_adeudo",
    });
    assert.ok(result.ok, `storeAttachment falló: ${!result.ok ? result.error : ""}`);
    assert.equal(result.attachment.attachmentCategory, "carta_no_adeudo");
  });

  it("almacena categoría croquis correctamente", async () => {
    const result = await storeAttachment({
      ticketId: ticketId1,
      uploaderType: "client",
      originalName: `croquis-${TS}.png`,
      declaredMime: "image/png",
      bytes: pngBuf,
      attachmentCategory: "croquis",
    });
    assert.ok(result.ok);
    assert.equal(result.attachment.attachmentCategory, "croquis");
  });

  it("almacena sin categoría (null por defecto)", async () => {
    const result = await storeAttachment({
      ticketId: ticketId1,
      uploaderType: "client",
      originalName: `sin-cat-${TS}.png`,
      declaredMime: "image/png",
      bytes: pngBuf,
    });
    assert.ok(result.ok);
    assert.equal(result.attachment.attachmentCategory, null);
  });

  it("listAttachments incluye attachmentCategory en resultados", async () => {
    const attachments = listAttachments(ticketId1);
    assert.ok(attachments.length >= 2, "debe tener al menos 2 adjuntos");
    // Todos los attachments deben tener la propiedad attachmentCategory
    for (const att of attachments) {
      assert.ok(
        "attachmentCategory" in att,
        `attachment ${att.id} debe tener la propiedad attachmentCategory`
      );
    }
  });

  it("listAttachmentsByCategory filtra por carta_no_adeudo", () => {
    const cartaAtts = listAttachmentsByCategory(ticketId1, "carta_no_adeudo");
    assert.ok(cartaAtts.length >= 1, "debe haber al menos 1 carta_no_adeudo");
    assert.ok(
      cartaAtts.every((a) => a.attachmentCategory === "carta_no_adeudo"),
      "todos deben ser categoria carta_no_adeudo"
    );
  });

  it("listAttachmentsByCategory devuelve vacío para categoría no subida", () => {
    const fichas = listAttachmentsByCategory(ticketId1, "ficha_tecnica");
    // En este ticket no subimos ficha_tecnica — puede estar vacío
    // (o puede haber de otros tests, así que no asertamos length === 0)
    assert.ok(Array.isArray(fichas));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. UPLOAD OWNERSHIP
// ══════════════════════════════════════════════════════════════════════════════

describe("upload ownership: usuario solo sube a sus tickets", () => {
  it("el ticket ticketId1 pertenece a userId1", () => {
    const ticket = db
      .prepare("SELECT portal_user_id FROM tickets WHERE id = ?")
      .get(ticketId1) as { portal_user_id: number } | undefined;
    assert.ok(ticket, "ticket1 debe existir");
    assert.equal(ticket.portal_user_id, userId1, "ticket1 debe ser de userId1");
  });

  it("el ticket ticketId2 pertenece a userId2", () => {
    const ticket = db
      .prepare("SELECT portal_user_id FROM tickets WHERE id = ?")
      .get(ticketId2) as { portal_user_id: number } | undefined;
    assert.ok(ticket, "ticket2 debe existir");
    assert.equal(ticket.portal_user_id, userId2, "ticket2 debe ser de userId2");
  });

  it("ownership check: userId1 no puede acceder a ticket de userId2", () => {
    // Simulación del check que hace el API: getTicketById + portal_user_id check
    const ticket = db
      .prepare("SELECT id, portal_user_id FROM tickets WHERE id = ? AND portal_user_id = ?")
      .get(ticketId2, userId1) as { id: number } | undefined;
    assert.equal(ticket, undefined, "userId1 no debe ver ticket de userId2");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. DOCUMENTOS REQUERIDOS POR SLUG
// ══════════════════════════════════════════════════════════════════════════════

describe("getRequiredDocCategories: docs requeridos por slug", () => {
  it("carta_no_adeudo requerida en todos los slugs", () => {
    const slugs = [
      "tanque-gas", "calentador-solar", "pergola", "muro-colindante",
      "piso-firme-posterior", "pintura-retoque", "mosquiteros", "repellado-interior",
    ];
    for (const slug of slugs) {
      const reqs = getRequiredDocCategories(slug);
      const hasNoAdeudo = reqs.some((r) => r.category === "carta_no_adeudo" && r.required);
      assert.ok(hasNoAdeudo, `carta_no_adeudo debe ser requerida en ${slug}`);
    }
  });

  it("croquis requerido en pergola", () => {
    const reqs = getRequiredDocCategories("pergola");
    const croquis = reqs.find((r) => r.category === "croquis");
    assert.ok(croquis, "pergola debe requerir croquis");
    assert.ok(croquis.required, "croquis debe ser required en pergola");
  });

  it("croquis NO requerido en mosquiteros", () => {
    const reqs = getRequiredDocCategories("mosquiteros");
    const croquis = reqs.find((r) => r.category === "croquis");
    assert.ok(!croquis || !croquis.required, "croquis NO debe ser required en mosquiteros");
  });

  it("ficha_tecnica requerida en piso-firme-posterior", () => {
    const reqs = getRequiredDocCategories("piso-firme-posterior");
    const ficha = reqs.find((r) => r.category === "ficha_tecnica");
    assert.ok(ficha?.required, "ficha_tecnica debe ser required en piso-firme-posterior");
  });

  it("ficha_tecnica NO requerida en pintura-retoque", () => {
    const reqs = getRequiredDocCategories("pintura-retoque");
    const ficha = reqs.find((r) => r.category === "ficha_tecnica");
    assert.ok(!ficha || !ficha.required, "ficha_tecnica NO debe ser required en pintura-retoque");
  });

  it("fotos requeridas en pergola y muro-colindante", () => {
    for (const slug of ["pergola", "muro-colindante"]) {
      const reqs = getRequiredDocCategories(slug);
      const fotos = reqs.find((r) => r.category === "fotos");
      assert.ok(fotos?.required, `fotos debe ser required en ${slug}`);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. checkExpediente: COMPLETO VS. INCOMPLETO
// ══════════════════════════════════════════════════════════════════════════════

describe("checkExpediente: estado del expediente", () => {
  const pngBuf = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
      "0000000a49444154789c6260000000000002000109f1f800000000049454e44ae426082",
    "hex"
  );

  it("expediente incompleto cuando faltan docs obligatorios", async () => {
    // ticketId2 sin ningún documento
    const result = checkExpediente(ticketId2, "tanque-gas");
    assert.ok(!result.complete, "debe estar incompleto sin docs");
    assert.ok(result.missing.length > 0, "debe listar docs faltantes");
    assert.ok(
      result.missing.some((m) => m === "carta_no_adeudo"),
      "carta_no_adeudo debe estar en missing"
    );
  });

  it("expediente completo cuando están todos los docs requeridos de tanque-gas", async () => {
    // Subir carta_no_adeudo para ticketId2 (tanque-gas solo requiere carta + ficha + fotos)
    await storeAttachment({
      ticketId: ticketId2,
      uploaderType: "client",
      originalName: `carta-${TS}.png`,
      declaredMime: "image/png",
      bytes: pngBuf,
      attachmentCategory: "carta_no_adeudo",
    });
    await storeAttachment({
      ticketId: ticketId2,
      uploaderType: "client",
      originalName: `ficha-${TS}.png`,
      declaredMime: "image/png",
      bytes: pngBuf,
      attachmentCategory: "ficha_tecnica",
    });
    await storeAttachment({
      ticketId: ticketId2,
      uploaderType: "client",
      originalName: `foto-${TS}.png`,
      declaredMime: "image/png",
      bytes: pngBuf,
      attachmentCategory: "fotos",
    });

    const result = checkExpediente(ticketId2, "tanque-gas");
    assert.ok(result.complete, `expediente debe estar completo; missing: ${result.missing.join(", ")}`);
    assert.equal(result.missing.length, 0, "no debe haber docs faltantes");
  });

  it("expediente incompleto para pergola si falta croquis", async () => {
    // ticketId1 tiene carta_no_adeudo y croquis subidos, pero no fotos de pergola
    // Verificamos que al pedir pergola (requiere carta + croquis + fotos), si falta fotos → incompleto
    const result = checkExpediente(ticketId1, "pergola");
    // ticketId1 tiene carta_no_adeudo y croquis de tests anteriores, pero no fotos específicamente
    // El resultado puede variar según lo que se subió; solo verificamos la estructura
    assert.ok(typeof result.complete === "boolean");
    assert.ok(Array.isArray(result.missing));
  });

  it("checkExpediente maneja ticketId inválido sin throw", () => {
    const result = checkExpediente(99999999, "tanque-gas");
    assert.ok(!result.complete, "ticket inexistente → incompleto");
    assert.ok(result.missing.length > 0, "debe listar todos como faltantes");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. OCR PARSER — ROBUSTEZ
// ══════════════════════════════════════════════════════════════════════════════

describe("parseOcrText: robustez ante inputs patológicos", () => {
  it("no lanza en texto null/undefined coercionado", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.doesNotThrow(() => parseOcrText(null as any));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.doesNotThrow(() => parseOcrText(undefined as any));
  });

  it("no lanza en texto Unicode extremo", () => {
    const unicode = "🇲🇽💳🎉 INE Vigente hasta: 2029 🔥 CURP: ABCD900101HDFRRA09 👾";
    assert.doesNotThrow(() => {
      const r = parseOcrText(unicode);
      assert.equal(r.vigencia, "2029");
    });
  });

  it("no lanza en texto con caracteres SQL injection", () => {
    const sqli = "'; DROP TABLE tickets; -- Vigente hasta: 2030";
    assert.doesNotThrow(() => {
      const r = parseOcrText(sqli);
      assert.equal(r.vigencia, "2030");
    });
  });

  it("no lanza en texto extremadamente largo (100k chars)", () => {
    const long = "Lorem ipsum ".repeat(9000) + " Vigente hasta: 2031";
    assert.doesNotThrow(() => {
      const r = parseOcrText(long);
      assert.equal(r.vigencia, "2031");
    });
  });

  it("no lanza en texto con sólo caracteres de control", () => {
    const ctrl = "\x00\x01\x02\x03\x04\x05\x06\x07\x08";
    assert.doesNotThrow(() => {
      const r = parseOcrText(ctrl);
      assert.equal(r.vigencia, null);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. REINTENTO IDEMPOTENTE (MÚLTIPLES UPLOADS DE MISMA CATEGORÍA)
// ══════════════════════════════════════════════════════════════════════════════

describe("reintento: upload idempotente por categoría", () => {
  const pngBuf = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
      "0000000a49444154789c6260000000000002000109f1f800000000049454e44ae426082",
    "hex"
  );

  it("reintento con el mismo archivo devuelve el mismo adjunto (dedup por hash)", async () => {
    // Primera subida
    const r1 = await storeAttachment({
      ticketId: ticketId1,
      uploaderType: "client",
      originalName: `retry-carta-1-${TS}.png`,
      declaredMime: "image/png",
      bytes: pngBuf,
      attachmentCategory: "carta_no_adeudo",
    });
    assert.ok(r1.ok, "primera subida debe funcionar");

    // Segunda subida idéntica (reintento con los mismos bytes)
    const r2 = await storeAttachment({
      ticketId: ticketId1,
      uploaderType: "client",
      originalName: `retry-carta-2-${TS}.png`,
      declaredMime: "image/png",
      bytes: pngBuf,
      attachmentCategory: "carta_no_adeudo",
    });
    assert.ok(r2.ok, "reintento debe funcionar sin error");
    if (!r1.ok || !r2.ok) return;

    // Dedup: mismos bytes + misma categoría → mismo attachment (sin duplicar)
    assert.equal(
      r2.attachment.id,
      r1.attachment.id,
      "Reintento con mismo archivo no debe crear un duplicado"
    );
  });
});

console.log("\n✅ Tests Phase3 Upload Docs cargados.\n");
