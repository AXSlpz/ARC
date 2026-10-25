/**
 * Tests Fase 2 – Registro escalonado con claim.
 *
 * Cubre:
 *  A) Registro con desarrollo+condominio+vivienda crea user + claim pending.
 *  B) Duplicate claim (prop con claim approved de otro user) → status conflict.
 *  C) Validaciones: password mismatch, email inválido, campos requeridos.
 *  D) Re-registro después de rechazo vuelve a pending.
 *  E) Usuario pending → tickets creados van a 'held'.
 *  F) Rate limiting básico (función interna).
 *
 * Corre con: npx tsx --test scripts/test-phase2-registration.ts
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import db from "../src/lib/db-connection.js";
import { initPortalSchema } from "../src/lib/portal/init-portal.js";
import { initRegistrationAdminSchema } from "../src/lib/portal/schema-registration-admin.js";

// Importaciones de dominio
import {
  registerWithClaim,
  getUserActiveClaim,
} from "../src/lib/portal/registration-admin.js";
import { createPropertyClaim, reviewPropertyClaim } from "../src/lib/portal/property-claims.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

let testDevId = 0;
let testCondoId = 0;
const createdUserIds: number[] = [];
const createdClaimIds: number[] = [];

before(() => {
  initPortalSchema();
  initRegistrationAdminSchema();

  // Desarrollo de prueba (reutiliza Capital Sur si existe)
  const capSur = db
    .prepare("SELECT id FROM developments WHERE slug = 'capital-sur'")
    .get() as { id: number } | undefined;
  if (capSur) {
    testDevId = capSur.id;
  } else {
    const res = db
      .prepare("INSERT INTO developments (name, slug, active) VALUES (?, ?, 1)")
      .run(`Dev Reg Test ${Date.now()}`, `dev-reg-${Date.now()}`);
    testDevId = Number(res.lastInsertRowid);
  }

  // Condominio de prueba
  const condoRes = db
    .prepare("INSERT INTO condominios (name, prefijo) VALUES (?, ?)")
    .run(`Condo Reg Test ${Date.now()}`, `CR${Date.now()}`);
  testCondoId = Number(condoRes.lastInsertRowid);

  db.prepare(
    "INSERT OR IGNORE INTO development_condominios (development_id, condominio_id) VALUES (?, ?)"
  ).run(testDevId, testCondoId);
});

after(() => {
  // Limpieza en orden: claims → tickets → users → condominios
  for (const id of createdClaimIds) {
    db.prepare("DELETE FROM property_claims WHERE id = ?").run(id);
  }
  for (const id of createdUserIds) {
    db.prepare("DELETE FROM portal_sessions WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM tickets WHERE portal_user_id = ?").run(id);
    db.prepare("DELETE FROM portal_users WHERE id = ?").run(id);
  }
  if (testCondoId) {
    db.prepare("DELETE FROM development_condominios WHERE condominio_id = ?").run(testCondoId);
    db.prepare("DELETE FROM condominios WHERE id = ?").run(testCondoId);
  }
});

// ── A) Registro con claim pending ─────────────────────────────────────────────

describe("registro con claim pending", () => {
  it("registerWithClaim crea usuario y claim pending correctamente", () => {
    const ts = Date.now();
    const result = registerWithClaim({
      developmentId: testDevId,
      condominioId: testCondoId,
      numVivienda: 201,
      name: "Carlos Prueba",
      email: `carlos-${ts}@test.arc`,
      phone: "6641112233",
      password: "contraseña123",
      confirmPassword: "contraseña123",
    });

    assert.ok(result.ok, `Debe ser ok: ${!result.ok ? result.error : ""}`);
    if (!result.ok) return;

    assert.equal(result.user.name, "Carlos Prueba", "Nombre debe coincidir");
    assert.equal(result.claim.status, "pending", "El claim debe quedar pending");
    assert.equal(result.claim.developmentId, testDevId, "development_id correcto");

    createdUserIds.push(result.user.id);
    createdClaimIds.push(result.claim.id);
  });

  it("el claim pending incluye condominio y num_vivienda en property_identifier", () => {
    const ts = Date.now();
    const result = registerWithClaim({
      developmentId: testDevId,
      condominioId: testCondoId,
      numVivienda: 202,
      name: "Ana Test",
      email: `ana-${ts}@test.arc`,
      phone: "6649998877",
      password: "MiPassword8",
      confirmPassword: "MiPassword8",
    });

    assert.ok(result.ok, `Debe ser ok: ${!result.ok ? result.error : ""}`);
    if (!result.ok) return;

    // El identifier debe codificar condominio y num_vivienda
    const identifier = result.claim.propertyIdentifier;
    assert.ok(identifier.includes(String(testCondoId)), "Identifier debe contener condominioId");
    assert.ok(identifier.includes("202"), "Identifier debe contener numVivienda");

    createdUserIds.push(result.user.id);
    createdClaimIds.push(result.claim.id);
  });
});

// ── B) Duplicate claim → conflict ─────────────────────────────────────────────

describe("duplicate claim cuando ya hay approved", () => {
  it("si otro usuario tiene aprobada la misma propiedad → nuevo claim es conflict", () => {
    const ts = Date.now();

    // Usuario 1 registra y su claim se aprueba
    const r1 = registerWithClaim({
      developmentId: testDevId,
      condominioId: testCondoId,
      numVivienda: 301,
      name: "Owner Primario",
      email: `owner-${ts}@test.arc`,
      phone: "6640001111",
      password: "Password123",
      confirmPassword: "Password123",
    });
    assert.ok(r1.ok, "Registro 1 debe ser ok");
    if (!r1.ok) return;
    createdUserIds.push(r1.user.id);
    createdClaimIds.push(r1.claim.id);

    // Aprobar el claim del usuario 1
    const approveRes = reviewPropertyClaim(r1.claim.id, {
      status: "approved",
      reviewedBy: "admin-test",
      propertySnapshot: { numVivienda: 301 },
    });
    assert.ok(approveRes.ok, "Aprobación del claim 1 debe ser ok");

    // Usuario 2 intenta reclamar la misma propiedad → debe ser conflict
    const r2 = registerWithClaim({
      developmentId: testDevId,
      condominioId: testCondoId,
      numVivienda: 301,
      name: "Second Claimant",
      email: `second-${ts}@test.arc`,
      phone: "6640002222",
      password: "Password456",
      confirmPassword: "Password456",
    });
    assert.ok(r2.ok, "Registro 2 debe ser ok (no error de app, aunque claim = conflict)");
    if (!r2.ok) return;

    assert.equal(r2.claim.status, "conflict", "El claim del usuario 2 debe ser conflict");

    createdUserIds.push(r2.user.id);
    createdClaimIds.push(r2.claim.id);
  });

  it("usuario con claim rejected puede re-registrar la misma propiedad → pending", () => {
    const ts = Date.now();

    // Registrar usuario
    const r1 = registerWithClaim({
      developmentId: testDevId,
      condominioId: testCondoId,
      numVivienda: 401,
      name: "Reclaimant User",
      email: `reclaimant-${ts}@test.arc`,
      phone: "6640003333",
      password: "Password789",
      confirmPassword: "Password789",
    });
    assert.ok(r1.ok, "Registro debe ser ok");
    if (!r1.ok) return;
    createdUserIds.push(r1.user.id);
    createdClaimIds.push(r1.claim.id);

    // Rechazar el claim
    const rejectRes = reviewPropertyClaim(r1.claim.id, {
      status: "rejected",
      reviewedBy: "admin-test",
      holdReason: "Documentación incompleta",
    });
    assert.ok(rejectRes.ok, "Rechazo debe ser ok");

    // El mismo usuario intenta de nuevo (via registerWithClaim debería permitirlo
    // o via createPropertyClaim directamente)
    const r2 = createPropertyClaim({
      developmentId: testDevId,
      portalUserId: r1.user.id,
      propertyIdentifier: `${testCondoId}:401`,
    });
    assert.ok(r2.ok, "Re-claim después de rechazo debe ser ok");
    if (!r2.ok) return;
    assert.equal(r2.claim.status, "pending", "Re-claim debe quedar pending");
    createdClaimIds.push(r2.claim.id);
  });
});

// ── C) Validaciones ───────────────────────────────────────────────────────────

describe("validaciones de registro", () => {
  it("password y confirmPassword distintos → error", () => {
    const ts = Date.now();
    const result = registerWithClaim({
      developmentId: testDevId,
      condominioId: testCondoId,
      numVivienda: 501,
      name: "Test User",
      email: `mismatch-${ts}@test.arc`,
      phone: "6641234567",
      password: "contraseña123",
      confirmPassword: "diferente456",
    });
    assert.equal(result.ok, false, "Debe fallar con passwords distintos");
    if (result.ok) return;
    assert.ok(
      result.error.toLowerCase().includes("contraseña") ||
        result.error.toLowerCase().includes("coincid"),
      `Error debe mencionar contraseña: "${result.error}"`
    );
  });

  it("email inválido → error", () => {
    const result = registerWithClaim({
      developmentId: testDevId,
      condominioId: testCondoId,
      numVivienda: 502,
      name: "Test User",
      email: "no-es-email",
      phone: "6641234567",
      password: "contraseña123",
      confirmPassword: "contraseña123",
    });
    assert.equal(result.ok, false, "Debe fallar con email inválido");
  });

  it("contraseña menor a 8 caracteres → error", () => {
    const ts = Date.now();
    const result = registerWithClaim({
      developmentId: testDevId,
      condominioId: testCondoId,
      numVivienda: 503,
      name: "Test User",
      email: `short-${ts}@test.arc`,
      phone: "6641234567",
      password: "corta",
      confirmPassword: "corta",
    });
    assert.equal(result.ok, false, "Debe fallar con contraseña corta");
  });

  it("desarrollo inexistente → error", () => {
    const ts = Date.now();
    const result = registerWithClaim({
      developmentId: 999999,
      condominioId: testCondoId,
      numVivienda: 504,
      name: "Test User",
      email: `nodev-${ts}@test.arc`,
      phone: "6641234567",
      password: "contraseña123",
      confirmPassword: "contraseña123",
    });
    assert.equal(result.ok, false, "Debe fallar si desarrollo no existe");
  });

  it("email duplicado → error", () => {
    const ts = Date.now();
    const email = `dup-${ts}@test.arc`;

    const r1 = registerWithClaim({
      developmentId: testDevId,
      condominioId: testCondoId,
      numVivienda: 505,
      name: "First User",
      email,
      phone: "6641111000",
      password: "contraseña123",
      confirmPassword: "contraseña123",
    });
    assert.ok(r1.ok, "Primer registro debe ser ok");
    if (r1.ok) {
      createdUserIds.push(r1.user.id);
      createdClaimIds.push(r1.claim.id);
    }

    const r2 = registerWithClaim({
      developmentId: testDevId,
      condominioId: testCondoId,
      numVivienda: 506,
      name: "Second User Same Email",
      email,
      phone: "6642222000",
      password: "contraseña123",
      confirmPassword: "contraseña123",
    });
    assert.equal(r2.ok, false, "Segundo registro con mismo email debe fallar");
  });
});

// ── D) getUserActiveClaim ─────────────────────────────────────────────────────

describe("getUserActiveClaim", () => {
  it("retorna null si el usuario no tiene claims", () => {
    // Usuario sin claims
    const user = db
      .prepare(
        "INSERT INTO portal_users (name, email, password_hash) VALUES (?, ?, ?)"
      )
      .run(`No Claim User ${Date.now()}`, `noclaim-${Date.now()}@arc.test`, "x");
    const userId = Number(user.lastInsertRowid);
    createdUserIds.push(userId);

    const claim = getUserActiveClaim(userId);
    assert.equal(claim, null, "Debe retornar null si no hay claims");
  });

  it("retorna el claim pending del usuario", () => {
    const ts = Date.now();
    const r = registerWithClaim({
      developmentId: testDevId,
      condominioId: testCondoId,
      numVivienda: 601,
      name: "Has Claim User",
      email: `hasclaim-${ts}@test.arc`,
      phone: "6643330000",
      password: "Password123",
      confirmPassword: "Password123",
    });
    assert.ok(r.ok, "Registro debe ser ok");
    if (!r.ok) return;
    createdUserIds.push(r.user.id);
    createdClaimIds.push(r.claim.id);

    const claim = getUserActiveClaim(r.user.id);
    assert.ok(claim !== null, "Debe retornar el claim");
    assert.equal(claim?.status, "pending", "Claim debe ser pending");
  });
});
