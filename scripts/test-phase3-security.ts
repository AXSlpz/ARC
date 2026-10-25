/**
 * Tests de seguridad y correcciones funcionales – Fase 3
 *
 * Corre con: npx tsx --test scripts/test-phase3-security.ts
 *
 * Cubre TODOS los hallazgos del análisis:
 *  1. Canonical consent text (server-side, no del cliente)
 *  2. createModificationTicket – atómico ticket+firma
 *  3. Ticket columnas request_kind / modification_catalog_id / property_claim_id
 *  4. Signature replay – unique constraint (ticket_id, signer_id, signer_role)
 *  5. canUserSubmitModification – excluye claim rejected
 *  6. sha256 dedup en storeAttachment (idempotente por hash+categoría+ticket)
 *  7. sha256 columna migrada
 *  8. OCR status "processing" antes del job
 *  9. IP helper – solo XFF si TRUSTED_PROXY=1
 * 10. Rate limiter – bloques después de N calls
 * 11. SLA inicia al completar expediente (solo si claim approved y no held)
 * 12. Draft count limit
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import db from "../src/lib/db-connection.js";

import { initPortalSchema } from "../src/lib/portal/init-portal.js";
import { initPhase3Schema } from "../src/lib/portal/schema-phase3.js";
import {
  buildConsentText,
  computeSignatureHash,
  listSignaturesForTicket,
} from "../src/lib/portal/signature-evidence.js";
import {
  createModificationTicket,
} from "../src/lib/portal/modification-submit.js";
import { getTicketById } from "../src/lib/portal/tickets.js";
import { canUserSubmitModification } from "../src/lib/portal/modification-catalog.js";
import {
  storeAttachment,
} from "../src/lib/portal/attachments.js";
import { getSlaState } from "../src/lib/portal/sla.js";
import {
  addIdentityDocument,
  updateOcrStatus,
  getIdentityDocument,
} from "../src/lib/portal/identity-documents.js";
import { getTrustedIp } from "../src/lib/portal/ip-helper.js";
import { RateLimiter } from "../src/lib/portal/rate-limiter.js";
import { createDraft, listDraftsForUser, MAX_DRAFTS_PER_USER } from "../src/lib/portal/modification-drafts.js";

// ── Shared fixtures ────────────────────────────────────────────────────────────

let userId = 0;
let userId2 = 0;
let typeId = 0;
let catalogId = 0;
let claimId = 0;
let claimPendingId = 0;
let devId = 0;
let ticketId = 0;
// Identificadores únicos para no colisionar con runs anteriores
const RUN_ID = Date.now();

before(() => {
  initPortalSchema();
  initPhase3Schema();

  const u1 = db
    .prepare(
      `INSERT INTO portal_users (name, email, password_hash) VALUES ('Security User', 'sec-${Date.now()}@arc.test', 'x')`
    )
    .run();
  userId = Number(u1.lastInsertRowid);

  const u2 = db
    .prepare(
      `INSERT INTO portal_users (name, email, password_hash) VALUES ('Other User', 'other-${Date.now()}@arc.test', 'x')`
    )
    .run();
  userId2 = Number(u2.lastInsertRowid);

  const t = db
    .prepare(
      `INSERT INTO ticket_types (name, slug, active, sort_order) VALUES ('Modificación', 'modificacion-${Date.now()}', 1, 99)`
    )
    .run();
  typeId = Number(t.lastInsertRowid);

  // Usar slug único por run para evitar conflictos de UNIQUE con runs anteriores
  const devSlug = `sec-dev-${RUN_ID}`;
  const dr = db
    .prepare("INSERT INTO developments (name, slug, city, active) VALUES ('SecDev', ?, NULL, 1)")
    .run(devSlug);
  devId = Number(dr.lastInsertRowid);

  const catSlug = `sec-cat-${RUN_ID}`;
  const cr = db
    .prepare(
      `INSERT INTO modification_catalog (name, slug, description, sort_order, global_active)
       VALUES ('Test Mod', ?, 'Test', 1, 0)`
    )
    .run(catSlug);
  catalogId = Number(cr.lastInsertRowid);

  // Claim approved para userId – propertyIdentifier único por run para evitar UNIQUE constraint
  const propId = `A-${RUN_ID}`;
  const propId2 = `B-${RUN_ID}`;

  const clm = db
    .prepare(
      `INSERT INTO property_claims (portal_user_id, development_id, property_identifier, status)
       VALUES (?, ?, ?, 'approved')`
    )
    .run(userId, devId, propId);
  claimId = Number(clm.lastInsertRowid);

  // Claim pending para userId2
  const clm2 = db
    .prepare(
      `INSERT INTO property_claims (portal_user_id, development_id, property_identifier, status)
       VALUES (?, ?, ?, 'pending')`
    )
    .run(userId2, devId, propId2);
  claimPendingId = Number(clm2.lastInsertRowid);

  // Ticket base para tests de firma y adjuntos
  const tRes = db
    .prepare(
      "INSERT INTO tickets (folio, ticket_type_id, portal_user_id, status) VALUES (?, ?, ?, 'nuevo')"
    )
    .run(`ARC-TEST-${RUN_ID}`, typeId, userId);
  ticketId = Number(tRes.lastInsertRowid);
});

after(() => {
  // No limpiar; tests son independientes por ID generado.
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1: buildConsentText – contenido canónico server-side
// ─────────────────────────────────────────────────────────────────────────────

describe("buildConsentText: texto canónico server-side", () => {
  it("contiene el nombre del firmante", () => {
    const text = buildConsentText({
      signerName: "María García",
      propertyIdentifier: "A-101",
      modificationName: "Tanque de gas",
      developmentName: "Capital Sur",
      date: "2026-10-01",
    });
    assert.ok(text.includes("María García"), `Falta nombre: ${text}`);
  });

  it("contiene el identificador de vivienda", () => {
    const text = buildConsentText({
      signerName: "X",
      propertyIdentifier: "A-101",
      modificationName: "Tanque de gas",
      developmentName: "Capital Sur",
      date: "2026-10-01",
    });
    assert.ok(text.includes("A-101"), `Falta vivienda: ${text}`);
  });

  it("contiene el nombre de la modificación", () => {
    const text = buildConsentText({
      signerName: "X",
      propertyIdentifier: "A-101",
      modificationName: "Pérgola de madera",
      developmentName: "Capital Sur",
      date: "2026-10-01",
    });
    assert.ok(text.includes("Pérgola de madera"), `Falta modificación: ${text}`);
  });

  it("es determinista (mismos parámetros → mismo texto)", () => {
    const params = {
      signerName: "Juan",
      propertyIdentifier: "B-2",
      modificationName: "Muro",
      developmentName: "Terrasoles",
      date: "2026-10-01",
    };
    assert.equal(buildConsentText(params), buildConsentText(params));
  });

  it("no retorna cadena vacía", () => {
    const text = buildConsentText({
      signerName: "A",
      propertyIdentifier: "X",
      modificationName: "Y",
      developmentName: "Z",
      date: "2026-01-01",
    });
    assert.ok(text.length > 20, "Texto demasiado corto");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2: createModificationTicket – atómico ticket + firma
// ─────────────────────────────────────────────────────────────────────────────

describe("createModificationTicket: atómico y columnas correctas", () => {
  let createdTicketId = 0;

  it("crea ticket con request_kind='modification'", async () => {
    const result = await createModificationTicket({
      ticketTypeId: typeId,
      portalUserId: userId,
      modificationCatalogId: catalogId,
      propertyClaimId: claimId,
      propertyIdentifier: `A-${RUN_ID}`,
      developmentName: "Capital Sur",
      modificationName: "Tanque de gas",
      formValues: [{ fieldKey: "marca", value: "Abastecedora" }],
      signerName: "Security User",
      signerId: userId,
      ipAddress: "10.0.0.1",
      userAgent: "test/1.0",
      signature: { method: "typed", typedName: "Security User" },
    });

    assert.ok(result.ok, `No ok: ${!result.ok ? result.error : ""}`);
    if (!result.ok) return;
    createdTicketId = result.ticket.id;

    const row = db
      .prepare("SELECT request_kind FROM tickets WHERE id = ?")
      .get(createdTicketId) as { request_kind: string } | undefined;
    assert.equal(row?.request_kind, "modification");
  });

  it("ticket tiene modification_catalog_id correcto", () => {
    const row = db
      .prepare("SELECT modification_catalog_id FROM tickets WHERE id = ?")
      .get(createdTicketId) as { modification_catalog_id: number } | undefined;
    assert.equal(row?.modification_catalog_id, catalogId);
  });

  it("ticket tiene property_claim_id correcto", () => {
    const row = db
      .prepare("SELECT property_claim_id FROM tickets WHERE id = ?")
      .get(createdTicketId) as { property_claim_id: number } | undefined;
    assert.equal(row?.property_claim_id, claimId);
  });

  it("firma registrada atómicamente (signedContent generado server-side)", () => {
    const sigs = listSignaturesForTicket(createdTicketId);
    assert.equal(sigs.length, 1, "Debe haber exactamente una firma");
    const sig = sigs[0]!;
    // El contenido debe contener info canónica, no texto arbitrario del cliente
    assert.ok(
      sig.signedContent.includes(`A-${RUN_ID}`),
      "Contenido debe incluir propertyIdentifier"
    );
    assert.ok(
      sig.signedContent.includes("Tanque de gas"),
      "Contenido debe incluir modificationName"
    );
  });

  it("ticket pending claim → status='held'", async () => {
    const result = await createModificationTicket({
      ticketTypeId: typeId,
      portalUserId: userId2, // user2 tiene claim pending
      modificationCatalogId: catalogId,
      propertyClaimId: claimPendingId,
      propertyIdentifier: `B-${RUN_ID}`,
      developmentName: "Capital Sur",
      modificationName: "Reja lateral",
      formValues: [],
      signerName: "Other User",
      signerId: userId2,
      ipAddress: null,
      userAgent: null,
      signature: { method: "typed", typedName: "Other User" },
    });
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.ticket.status, "held");
  });

  it("ticket approved claim → status='nuevo'", async () => {
    // userId tiene claim approved
    const result = await createModificationTicket({
      ticketTypeId: typeId,
      portalUserId: userId,
      modificationCatalogId: catalogId,
      propertyClaimId: claimId,
      propertyIdentifier: `A-${RUN_ID}`,
      developmentName: "Capital Sur",
      modificationName: "Mosquiteros",
      formValues: [],
      signerName: "Security User",
      signerId: userId,
      ipAddress: null,
      userAgent: null,
      signature: { method: "typed", typedName: "Security User" },
    });
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.ticket.status, "nuevo");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3: Unique constraint en request_signatures
// ─────────────────────────────────────────────────────────────────────────────

describe("request_signatures: unique constraint replay protection", () => {
  it("no permite segunda firma para mismo (ticket_id, signer_id, signer_role)", () => {
    // Crear un ticket limpio
    const t = db
      .prepare(
        `INSERT INTO tickets (folio, ticket_type_id, portal_user_id, status) VALUES ('ARC-S1-${RUN_ID}', ?, ?, 'nuevo')`
      )
      .run(typeId, userId);
    const tId = Number(t.lastInsertRowid);

    const ts = Math.floor(Date.now() / 1000);
    const hash1 = computeSignatureHash({
      ticketId: tId,
      signerName: "User",
      signerRole: "resident",
      signedContent: "first",
      timestamp: ts,
    });

    // Primera firma → debe funcionar
    db.prepare(
      `INSERT INTO request_signatures (ticket_id, signer_id, signer_name, signer_role, signature_hash, signed_content, signed_at)
       VALUES (?, ?, 'User', 'resident', ?, 'first', ?)`
    ).run(tId, userId, hash1, ts);

    // Segunda firma → debe lanzar error (UNIQUE constraint)
    const hash2 = computeSignatureHash({
      ticketId: tId,
      signerName: "User",
      signerRole: "resident",
      signedContent: "second attempt",
      timestamp: ts + 1,
    });

    assert.throws(
      () => {
        db.prepare(
          `INSERT INTO request_signatures (ticket_id, signer_id, signer_name, signer_role, signature_hash, signed_content, signed_at)
           VALUES (?, ?, 'User', 'resident', ?, 'second attempt', ?)`
        ).run(tId, userId, hash2, ts + 1);
      },
      /UNIQUE|constraint/i,
      "Debe lanzar error de UNIQUE constraint"
    );
  });

  it("permite firma de otro firmante en el mismo ticket (admin, committee)", () => {
    const t = db
      .prepare(
        `INSERT INTO tickets (folio, ticket_type_id, portal_user_id, status) VALUES ('ARC-S2-${RUN_ID}', ?, ?, 'nuevo')`
      )
      .run(typeId, userId);
    const tId = Number(t.lastInsertRowid);
    const ts = Math.floor(Date.now() / 1000);

    const h1 = computeSignatureHash({ ticketId: tId, signerName: "U1", signerRole: "resident", signedContent: "x", timestamp: ts });
    const h2 = computeSignatureHash({ ticketId: tId, signerName: "Admin", signerRole: "admin", signedContent: "y", timestamp: ts });

    db.prepare(
      `INSERT INTO request_signatures (ticket_id, signer_id, signer_name, signer_role, signature_hash, signed_content, signed_at)
       VALUES (?, ?, 'U1', 'resident', ?, 'x', ?)`
    ).run(tId, userId, h1, ts);

    // Admin diferente rol → OK
    assert.doesNotThrow(() => {
      db.prepare(
        `INSERT INTO request_signatures (ticket_id, signer_id, signer_name, signer_role, signature_hash, signed_content, signed_at)
         VALUES (?, ?, 'Admin', 'admin', ?, 'y', ?)`
      ).run(tId, userId2, h2, ts);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4: canUserSubmitModification – excluye rejected
// ─────────────────────────────────────────────────────────────────────────────

describe("canUserSubmitModification: solo activos", () => {
  it("retorna true para claim pending", () => {
    assert.equal(canUserSubmitModification("pending"), true);
  });
  it("retorna true para claim conflict", () => {
    assert.equal(canUserSubmitModification("conflict"), true);
  });
  it("retorna true para claim approved", () => {
    assert.equal(canUserSubmitModification("approved"), true);
  });
  it("retorna false para claim rejected", () => {
    assert.equal(canUserSubmitModification("rejected"), false);
  });
  it("retorna false para null (sin claim)", () => {
    assert.equal(canUserSubmitModification(null), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5: sha256 dedup en storeAttachment
// ─────────────────────────────────────────────────────────────────────────────

describe("storeAttachment: sha256 dedup idempotente", () => {
  const PNG_BYTES = Buffer.from(
    "89504e470d0a1a0a0000000d49484452",
    "hex"
  ); // comienzo de PNG real

  it("ticket_attachments tiene columna file_sha256", () => {
    const cols = db
      .pragma("table_info(ticket_attachments)") as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    assert.ok(names.includes("file_sha256"), `Columnas: ${names.join(", ")}`);
  });

  it("segunda subida del mismo archivo (misma categoría) devuelve el mismo attachment", async () => {
    // Crear ticket
    const tr = db
      .prepare(
        `INSERT INTO tickets (folio, ticket_type_id, portal_user_id, status) VALUES ('ARC-SH1-${RUN_ID}', ?, ?, 'nuevo')`
      )
      .run(typeId, userId);
    const tId = Number(tr.lastInsertRowid);

    // JPG bytes mínimos válidos
    const jpgBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

    const r1 = await storeAttachment({
      ticketId: tId,
      uploaderType: "client",
      originalName: "foto.jpg",
      declaredMime: "image/jpeg",
      bytes: jpgBytes,
      attachmentCategory: "fotos",
    });
    assert.ok(r1.ok, `Primera subida: ${!r1.ok ? r1.error : ""}`);

    // Segunda subida idéntica
    const r2 = await storeAttachment({
      ticketId: tId,
      uploaderType: "client",
      originalName: "foto.jpg",
      declaredMime: "image/jpeg",
      bytes: jpgBytes,
      attachmentCategory: "fotos",
    });
    assert.ok(r2.ok, `Segunda subida: ${!r2.ok ? r2.error : ""}`);
    if (!r1.ok || !r2.ok) return;

    // Mismo ID de adjunto
    assert.equal(
      r2.attachment.id,
      r1.attachment.id,
      "La segunda subida debe devolver el mismo attachment (dedup)"
    );
  });

  it("archivo diferente (distinto hash) sí genera nuevo attachment", async () => {
    const tr = db
      .prepare(
        `INSERT INTO tickets (folio, ticket_type_id, portal_user_id, status) VALUES ('ARC-SH2-${RUN_ID}', ?, ?, 'nuevo')`
      )
      .run(typeId, userId);
    const tId = Number(tr.lastInsertRowid);

    const jpg1 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01]);
    const jpg2 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x02]);

    const r1 = await storeAttachment({
      ticketId: tId,
      uploaderType: "client",
      originalName: "a.jpg",
      declaredMime: "image/jpeg",
      bytes: jpg1,
      attachmentCategory: "fotos",
    });
    const r2 = await storeAttachment({
      ticketId: tId,
      uploaderType: "client",
      originalName: "b.jpg",
      declaredMime: "image/jpeg",
      bytes: jpg2,
      attachmentCategory: "fotos",
    });

    assert.ok(r1.ok);
    assert.ok(r2.ok);
    if (!r1.ok || !r2.ok) return;
    assert.notEqual(r2.attachment.id, r1.attachment.id, "Archivos distintos → IDs distintos");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 6: OCR status "processing" antes del job
// ─────────────────────────────────────────────────────────────────────────────

describe("updateOcrStatus: acepta 'processing'", () => {
  it("puede actualizar a status='processing'", () => {
    const res = db
      .prepare(
        `INSERT INTO portal_identity_documents (portal_user_id, kind, is_current, stored_path, ocr_status)
         VALUES (?, 'ine', 1, '/tmp/test.jpg', 'pending')`
      )
      .run(userId);
    const docId = Number(res.lastInsertRowid);

    // No debe lanzar
    assert.doesNotThrow(() => {
      updateOcrStatus(docId, "processing", null);
    });

    const doc = getIdentityDocument(docId);
    assert.equal(doc?.ocrStatus, "processing");
  });

  it("puede actualizar de processing → done", () => {
    const res = db
      .prepare(
        `INSERT INTO portal_identity_documents (portal_user_id, kind, is_current, stored_path, ocr_status)
         VALUES (?, 'ine', 0, '/tmp/test2.jpg', 'processing')`
      )
      .run(userId);
    const docId = Number(res.lastInsertRowid);

    updateOcrStatus(docId, "done", { emision: "2020", vigencia: "2030", expired: false });
    const doc = getIdentityDocument(docId);
    assert.equal(doc?.ocrStatus, "done");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 7: getTrustedIp – solo XFF si TRUSTED_PROXY=1
// ─────────────────────────────────────────────────────────────────────────────

describe("getTrustedIp: IP de proxy confiable", () => {
  it("sin TRUSTED_PROXY → devuelve null aunque exista XFF", () => {
    const originalEnv = process.env.TRUSTED_PROXY;
    delete process.env.TRUSTED_PROXY;

    const ip = getTrustedIp({
      xff: "1.2.3.4, 10.0.0.1",
      realIp: null,
    });

    process.env.TRUSTED_PROXY = originalEnv;
    assert.equal(ip, null);
  });

  it("TRUSTED_PROXY=1 → extrae primer IP de XFF", () => {
    const orig = process.env.TRUSTED_PROXY;
    process.env.TRUSTED_PROXY = "1";

    const ip = getTrustedIp({ xff: "1.2.3.4, 10.0.0.1", realIp: null });

    process.env.TRUSTED_PROXY = orig;
    assert.equal(ip, "1.2.3.4");
  });

  it("TRUSTED_PROXY=1 pero sin XFF → usa x-real-ip", () => {
    const orig = process.env.TRUSTED_PROXY;
    process.env.TRUSTED_PROXY = "1";

    const ip = getTrustedIp({ xff: null, realIp: "5.6.7.8" });

    process.env.TRUSTED_PROXY = orig;
    assert.equal(ip, "5.6.7.8");
  });

  it("sin headers → null", () => {
    const orig = process.env.TRUSTED_PROXY;
    process.env.TRUSTED_PROXY = "1";
    const ip = getTrustedIp({ xff: null, realIp: null });
    process.env.TRUSTED_PROXY = orig;
    assert.equal(ip, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 8: RateLimiter
// ─────────────────────────────────────────────────────────────────────────────

describe("RateLimiter: bloqueo después de N requests", () => {
  it("primeras N solicitudes pasan", () => {
    const rl = new RateLimiter({ max: 3, windowMs: 60_000 });
    assert.ok(rl.check("user-a"));
    assert.ok(rl.check("user-a"));
    assert.ok(rl.check("user-a"));
  });

  it("N+1 solicitud es rechazada", () => {
    const rl = new RateLimiter({ max: 3, windowMs: 60_000 });
    rl.check("user-b");
    rl.check("user-b");
    rl.check("user-b");
    const blocked = !rl.check("user-b");
    assert.ok(blocked, "La 4ª solicitud debe ser rechazada");
  });

  it("usuarios distintos no comparten límite", () => {
    const rl = new RateLimiter({ max: 2, windowMs: 60_000 });
    rl.check("user-c");
    rl.check("user-c");
    // user-c bloqueado
    assert.equal(rl.check("user-c"), false);
    // user-d no afectado
    assert.equal(rl.check("user-d"), true);
  });

  it("reset() limpia el estado de un usuario", () => {
    const rl = new RateLimiter({ max: 1, windowMs: 60_000 });
    rl.check("user-e");
    assert.equal(rl.check("user-e"), false); // bloqueado

    rl.reset("user-e");
    assert.equal(rl.check("user-e"), true); // libre después de reset
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 9: SLA inicia al completar expediente (approved + no held)
// ─────────────────────────────────────────────────────────────────────────────

describe("SLA: inicia al completar expediente", () => {
  it("ticket 'nuevo' (claim approved) + expediente completo → SLA activo", async () => {
    // Crear ticket nuevo con claim approved
    const tr = db
      .prepare(
        `INSERT INTO tickets (folio, ticket_type_id, portal_user_id, status)
         VALUES ('ARC-SLA-${RUN_ID}', ?, ?, 'nuevo')`
      )
      .run(typeId, userId);
    const tId = Number(tr.lastInsertRowid);

    // Simular expediente completo: importar y llamar a la función
    const { triggerSlaIfExpedienteComplete } = await import(
      "../src/lib/portal/modification-docs.js"
    );

    // Sin subir documentos aún → NO inicia
    triggerSlaIfExpedienteComplete(tId, "mosquiteros"); // requiere solo carta_no_adeudo
    const stateEmpty = getSlaState(tId);
    assert.equal(
      stateEmpty?.slaTargetAt ?? null,
      null,
      "Sin expediente completo no debe arrancar SLA"
    );

    // Subir carta_no_adeudo (requerida para mosquiteros)
    const jpgBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    await storeAttachment({
      ticketId: tId,
      uploaderType: "client",
      originalName: "carta.jpg",
      declaredMime: "image/jpeg",
      bytes: jpgBytes,
      attachmentCategory: "carta_no_adeudo",
    });

    // Ahora expediente completo para 'mosquiteros' → SLA debe arrancar
    triggerSlaIfExpedienteComplete(tId, "mosquiteros");
    const stateFull = getSlaState(tId);
    assert.ok(
      stateFull?.slaTargetAt != null,
      "Con expediente completo y claim approved debe arrancar SLA"
    );
  });

  it("ticket 'held' (claim pending) → NO inicia SLA aunque expediente completo", async () => {
    const tr = db
      .prepare(
        `INSERT INTO tickets (folio, ticket_type_id, portal_user_id, status)
         VALUES ('ARC-HELD-${RUN_ID}', ?, ?, 'held')`
      )
      .run(typeId, userId2);
    const tId = Number(tr.lastInsertRowid);

    const { triggerSlaIfExpedienteComplete } = await import(
      "../src/lib/portal/modification-docs.js"
    );

    const jpgBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    await storeAttachment({
      ticketId: tId,
      uploaderType: "client",
      originalName: "carta.jpg",
      declaredMime: "image/jpeg",
      bytes: jpgBytes,
      attachmentCategory: "carta_no_adeudo",
    });

    triggerSlaIfExpedienteComplete(tId, "mosquiteros");
    const state = getSlaState(tId);
    assert.equal(
      state?.slaTargetAt ?? null,
      null,
      "Ticket held no debe arrancar SLA"
    );
  });

  it("triggerSlaIfExpedienteComplete es idempotente", async () => {
    const tr = db
      .prepare(
        `INSERT INTO tickets (folio, ticket_type_id, portal_user_id, status)
         VALUES ('ARC-IDMP-${RUN_ID}', ?, ?, 'nuevo')`
      )
      .run(typeId, userId);
    const tId = Number(tr.lastInsertRowid);

    const { triggerSlaIfExpedienteComplete } = await import(
      "../src/lib/portal/modification-docs.js"
    );

    const jpgBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    await storeAttachment({
      ticketId: tId,
      uploaderType: "client",
      originalName: "carta.jpg",
      declaredMime: "image/jpeg",
      bytes: jpgBytes,
      attachmentCategory: "carta_no_adeudo",
    });

    triggerSlaIfExpedienteComplete(tId, "mosquiteros");
    const firstTarget = getSlaState(tId)?.slaTargetAt;

    // Segunda llamada no debe cambiar el target
    triggerSlaIfExpedienteComplete(tId, "mosquiteros");
    const secondTarget = getSlaState(tId)?.slaTargetAt;

    assert.equal(firstTarget, secondTarget, "SLA idempotente: el target no debe cambiar");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 10: Draft limits
// ─────────────────────────────────────────────────────────────────────────────

describe("Draft count limit por usuario", () => {
  it(`MAX_DRAFTS_PER_USER está definido (${MAX_DRAFTS_PER_USER})`, () => {
    assert.ok(typeof MAX_DRAFTS_PER_USER === "number" && MAX_DRAFTS_PER_USER > 0);
  });

  it("crear más de MAX_DRAFTS_PER_USER drafts retorna error", () => {
    // Crear usuario fresco para este test
    const ur = db
      .prepare(
        `INSERT INTO portal_users (name, email, password_hash) VALUES ('Draft Limit User', 'draft-limit-${Date.now()}@arc.test', 'x')`
      )
      .run();
    const uid = Number(ur.lastInsertRowid);

    // Llenar hasta el límite
    for (let i = 0; i < MAX_DRAFTS_PER_USER; i++) {
      const r = createDraft({ portalUserId: uid, modificationCatalogId: null, step: 0, data: {} });
      assert.ok(r.ok, `Draft ${i + 1} debería ser creado`);
    }

    // El draft siguiente debe fallar
    const over = createDraft({ portalUserId: uid, modificationCatalogId: null, step: 0, data: {} });
    assert.equal(over.ok, false, "Sobre el límite debe retornar error");
    assert.ok(!over.ok && over.error.toLowerCase().includes("límite"), `Error debe mencionar límite: ${!over.ok ? over.error : ""}`);
  });

  it("otro usuario puede crear drafts independientemente", () => {
    const ur = db
      .prepare(
        `INSERT INTO portal_users (name, email, password_hash) VALUES ('Draft Ind User', 'draft-ind-${Date.now()}@arc.test', 'x')`
      )
      .run();
    const uid = Number(ur.lastInsertRowid);

    const r = createDraft({ portalUserId: uid, modificationCatalogId: null, step: 0, data: {} });
    assert.ok(r.ok, "Usuario independiente debe poder crear draft");
  });
});
