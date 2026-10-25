/**
 * Tests Fase 3: Firmas y evidencias (signature-evidence).
 *
 * Corre con: npx tsx --test scripts/test-phase3-signatures.ts
 *
 * Verifica:
 * - computeSignatureHash produce SHA-256 determinista
 * - addSignature guarda correctamente
 * - verifySignatureHash pasa para firma válida
 * - verifySignatureHash falla si hash fue alterado
 * - auditSignatures devuelve resultados por ticket
 * - Errores: ticket inexistente, signer sin nombre, contenido vacío
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import db from "../src/lib/db-connection.js";

import { initPhase3Schema } from "../src/lib/portal/schema-phase3.js";
import {
  computeSignatureHash,
  verifySignatureHash,
  addSignature,
  listSignaturesForTicket,
  getSignature,
  auditSignatures,
} from "../src/lib/portal/signature-evidence.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

let testUserId = 0;
let testTypeId = 0;
let testTicketId = 0;

before(() => {
  initPhase3Schema();

  const userRes = db
    .prepare(
      `INSERT INTO portal_users (name, email, password_hash)
       VALUES ('Sig Test User', 'sig-test-${Date.now()}@arc.test', 'x')`
    )
    .run();
  testUserId = Number(userRes.lastInsertRowid);

  const typeRes = db
    .prepare(
      `INSERT INTO ticket_types (name, slug, active, sort_order)
       VALUES ('Sig Test Type', 'sig-test-${Date.now()}', 1, 99)`
    )
    .run();
  testTypeId = Number(typeRes.lastInsertRowid);

  const ticketRes = db
    .prepare(
      `INSERT INTO tickets (folio, ticket_type_id, portal_user_id, status)
       VALUES ('SIG-TEST-${Date.now()}', ?, ?, 'nuevo')`
    )
    .run(testTypeId, testUserId);
  testTicketId = Number(ticketRes.lastInsertRowid);
});

after(() => {
  if (testTicketId > 0) {
    db.prepare("DELETE FROM request_signatures WHERE ticket_id = ?").run(testTicketId);
    db.prepare("DELETE FROM tickets WHERE id = ?").run(testTicketId);
  }
  if (testTypeId > 0) {
    db.prepare("DELETE FROM ticket_types WHERE id = ?").run(testTypeId);
  }
  if (testUserId > 0) {
    db.prepare("DELETE FROM portal_users WHERE id = ?").run(testUserId);
  }
});

// ── computeSignatureHash ──────────────────────────────────────────────────────

describe("computeSignatureHash", () => {
  it("produce un string hex de 64 caracteres (SHA-256)", () => {
    const hash = computeSignatureHash({
      ticketId: 1,
      signerName: "Juan Pérez",
      signerRole: "resident",
      signedContent: "Autorizo la modificación",
      timestamp: 1700000000,
    });
    assert.match(hash, /^[a-f0-9]{64}$/);
  });

  it("es determinista (mismos inputs → mismo hash)", () => {
    const params = {
      ticketId: 42,
      signerName: "Ana Flores",
      signerRole: "committee" as const,
      signedContent: "Aprueba el comité",
      timestamp: 1700001234,
    };
    const h1 = computeSignatureHash(params);
    const h2 = computeSignatureHash(params);
    assert.equal(h1, h2);
  });

  it("hashes distintos para distintos tickets", () => {
    const base = {
      signerName: "X",
      signerRole: "admin" as const,
      signedContent: "mismo contenido",
      timestamp: 100,
    };
    const h1 = computeSignatureHash({ ...base, ticketId: 1 });
    const h2 = computeSignatureHash({ ...base, ticketId: 2 });
    assert.notEqual(h1, h2);
  });

  it("hashes distintos para distintos timestamps", () => {
    const base = {
      ticketId: 5,
      signerName: "X",
      signerRole: "resident" as const,
      signedContent: "mismo contenido",
    };
    const h1 = computeSignatureHash({ ...base, timestamp: 1000 });
    const h2 = computeSignatureHash({ ...base, timestamp: 2000 });
    assert.notEqual(h1, h2);
  });
});

// ── addSignature ──────────────────────────────────────────────────────────────

describe("addSignature", () => {
  it("registra una firma correctamente", () => {
    const result = addSignature({
      ticketId: testTicketId,
      signerId: testUserId,
      signerName: "Juan Residente",
      signerRole: "resident",
      signedContent: "Yo, Juan Residente, autorizo la instalación de calentador solar.",
      ipAddress: "192.168.1.10",
      userAgent: "Mozilla/5.0 Test",
    });
    assert.ok(result.ok, `Error: ${!result.ok ? result.error : ""}`);
    assert.equal(result.signature.ticketId, testTicketId);
    assert.equal(result.signature.signerName, "Juan Residente");
    assert.equal(result.signature.signerRole, "resident");
    assert.match(result.signature.signatureHash, /^[a-f0-9]{64}$/);
  });

  it("firma de comité", () => {
    const result = addSignature({
      ticketId: testTicketId,
      signerName: "Comité Arquitectura",
      signerRole: "committee",
      signedContent: "El comité aprueba la solicitud ARC-00001.",
    });
    assert.ok(result.ok);
    assert.equal(result.signature.signerRole, "committee");
  });

  it("error si ticket no existe", () => {
    const result = addSignature({
      ticketId: 999999,
      signerName: "Nadie",
      signerRole: "resident",
      signedContent: "Contenido de prueba",
    });
    assert.ok(!result.ok, "debe fallar para ticket inexistente");
    assert.match(result.error, /ticket/i);
  });

  it("error si signerName vacío", () => {
    const result = addSignature({
      ticketId: testTicketId,
      signerName: "",
      signerRole: "resident",
      signedContent: "Contenido de prueba",
    });
    assert.ok(!result.ok, "debe rechazar nombre vacío");
  });

  it("error si signedContent vacío", () => {
    const result = addSignature({
      ticketId: testTicketId,
      signerName: "Alguien",
      signerRole: "resident",
      signedContent: "",
    });
    assert.ok(!result.ok, "debe rechazar contenido vacío");
  });
});

// ── verifySignatureHash ───────────────────────────────────────────────────────

describe("verifySignatureHash", () => {
  it("verifica correctamente una firma almacenada", () => {
    const sigs = listSignaturesForTicket(testTicketId);
    assert.ok(sigs.length > 0, "debe haber firmas del ticket");

    for (const sig of sigs) {
      assert.ok(
        verifySignatureHash(sig),
        `La firma id=${sig.id} debe ser válida`
      );
    }
  });

  it("falla si el hash fue alterado", () => {
    const sigs = listSignaturesForTicket(testTicketId);
    assert.ok(sigs.length > 0);

    const original = sigs[0]!;
    const tampered = { ...original, signatureHash: "0".repeat(64) };
    assert.equal(verifySignatureHash(tampered), false);
  });

  it("falla si el contenido fue alterado", () => {
    const sigs = listSignaturesForTicket(testTicketId);
    assert.ok(sigs.length > 0);

    const original = sigs[0]!;
    const tampered = { ...original, signedContent: "contenido alterado maliciosamente" };
    assert.equal(verifySignatureHash(tampered), false);
  });
});

// ── listSignaturesForTicket / getSignature ────────────────────────────────────

describe("listSignaturesForTicket", () => {
  it("devuelve todas las firmas del ticket en orden cronológico", () => {
    const sigs = listSignaturesForTicket(testTicketId);
    assert.ok(sigs.length >= 2, "deben haber al menos 2 firmas (resident + committee)");

    for (let i = 1; i < sigs.length; i++) {
      assert.ok(sigs[i]!.signedAt >= sigs[i - 1]!.signedAt);
    }
  });

  it("devuelve array vacío para ticket sin firmas", () => {
    // Crear ticket temporal sin firmas
    const tmpTicket = db
      .prepare(
        "INSERT INTO tickets (folio, ticket_type_id, portal_user_id, status) VALUES ('TMP-SIG', ?, ?, 'nuevo')"
      )
      .run(testTypeId, testUserId);
    const tmpId = Number(tmpTicket.lastInsertRowid);

    const sigs = listSignaturesForTicket(tmpId);
    assert.equal(sigs.length, 0);

    db.prepare("DELETE FROM tickets WHERE id = ?").run(tmpId);
  });
});

describe("getSignature", () => {
  it("devuelve la firma por ID", () => {
    const sigs = listSignaturesForTicket(testTicketId);
    assert.ok(sigs.length > 0);

    const sig = getSignature(sigs[0]!.id);
    assert.ok(sig, "debe encontrar la firma");
    assert.equal(sig.id, sigs[0]!.id);
  });

  it("devuelve null para ID inexistente", () => {
    const sig = getSignature(999999);
    assert.equal(sig, null);
  });
});

// ── auditSignatures ───────────────────────────────────────────────────────────

describe("auditSignatures", () => {
  it("auditoría pasa para todas las firmas del ticket", () => {
    const audit = auditSignatures(testTicketId);
    assert.ok(audit.length >= 2);

    for (const { id, valid } of audit) {
      assert.ok(valid, `La firma id=${id} debe pasar la auditoría`);
    }
  });

  it("auditoría retorna array vacío para ticket sin firmas (no lanza error)", () => {
    const audit = auditSignatures(999999);
    assert.deepEqual(audit, []);
  });
});
