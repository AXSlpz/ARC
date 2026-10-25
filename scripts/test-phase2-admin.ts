/**
 * Tests Fase 2 – Administración de claims del portal.
 *
 * Cubre:
 *  A) listPendingClaimsAdmin: incluye datos de usuario (para admin), no solo claim.
 *  B) approveClaim: asocia portal_user.residente_id cuando hay residente,
 *     marca claim approved, activa tickets held, inicia SLA.
 *  C) rejectClaim: marca rejected con razón.
 *  D) Aprobar cuando ya existe otro approved → conflict / error.
 *  E) Tickets held se activan (→ nuevo) al aprobar el claim.
 *  F) Snapshot de propiedad se guarda al aprobar.
 *
 * Corre con: npx tsx --test scripts/test-phase2-admin.ts
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import db from "../src/lib/db-connection.js";
import { initPortalSchema } from "../src/lib/portal/init-portal.js";
import { initRegistrationAdminSchema } from "../src/lib/portal/schema-registration-admin.js";

// Importaciones de dominio
import {
  registerWithClaim,
  listPendingClaimsAdmin,
  approveClaim,
  rejectClaim,
} from "../src/lib/portal/registration-admin.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

let testDevId = 0;
let testCondoId = 0;
const createdUserIds: number[] = [];
const createdClaimIds: number[] = [];
const createdResIds: number[] = [];
const createdTicketTypeIds: number[] = [];
const createdTicketIds: number[] = [];

before(() => {
  initPortalSchema();
  initRegistrationAdminSchema();

  // Desarrollo de prueba
  const capSur = db
    .prepare("SELECT id FROM developments WHERE slug = 'capital-sur'")
    .get() as { id: number } | undefined;
  if (capSur) {
    testDevId = capSur.id;
  } else {
    const res = db
      .prepare("INSERT INTO developments (name, slug, active) VALUES (?, ?, 1)")
      .run(`Dev Admin Test ${Date.now()}`, `dev-adm-${Date.now()}`);
    testDevId = Number(res.lastInsertRowid);
  }

  // Condominio de prueba
  const condoRes = db
    .prepare("INSERT INTO condominios (name, prefijo) VALUES (?, ?)")
    .run(`Condo Admin Test ${Date.now()}`, `CA${Date.now()}`);
  testCondoId = Number(condoRes.lastInsertRowid);

  db.prepare(
    "INSERT OR IGNORE INTO development_condominios (development_id, condominio_id) VALUES (?, ?)"
  ).run(testDevId, testCondoId);
});

after(() => {
  // Limpieza en orden
  for (const id of createdTicketIds) {
    db.prepare("DELETE FROM ticket_status_history WHERE ticket_id = ?").run(id);
    db.prepare("DELETE FROM ticket_values WHERE ticket_id = ?").run(id);
    db.prepare("DELETE FROM tickets WHERE id = ?").run(id);
  }
  for (const id of createdTicketTypeIds) {
    db.prepare("DELETE FROM ticket_types WHERE id = ?").run(id);
  }
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

// ── A) listPendingClaimsAdmin ─────────────────────────────────────────────────

describe("listPendingClaimsAdmin", () => {
  it("retorna claims pending con datos de usuario para revisión del admin", async () => {
    const ts = Date.now();

    const r = registerWithClaim({
      developmentId: testDevId,
      condominioId: testCondoId,
      numVivienda: 1001,
      name: "Admin List User",
      email: `adminlist-${ts}@test.arc`,
      phone: "6641110001",
      password: "Password123",
      confirmPassword: "Password123",
    });
    assert.ok(r.ok, "Registro debe ser ok");
    if (!r.ok) return;
    createdUserIds.push(r.user.id);
    createdClaimIds.push(r.claim.id);

    const claims = listPendingClaimsAdmin();
    const found = claims.find((c) => c.id === r.claim.id);
    assert.ok(found, "El claim debe aparecer en la lista de admin");

    // Debe incluir datos de usuario (para revisión)
    assert.ok(found?.userName !== undefined, "Debe incluir nombre del usuario");
    assert.ok(found?.userEmail !== undefined, "Debe incluir email del usuario");

    // Debe incluir datos del claim
    assert.equal(found?.status, "pending", "Status debe ser pending");
    assert.ok(found?.propertyIdentifier !== undefined, "Debe tener property_identifier");
  });

  it("listPendingClaimsAdmin también incluye claims conflict", () => {
    const ts = Date.now();

    // Crear un claim y aprobarlo
    const r1 = registerWithClaim({
      developmentId: testDevId,
      condominioId: testCondoId,
      numVivienda: 1002,
      name: "Owner Conflict",
      email: `ownercf-${ts}@test.arc`,
      phone: "6641110002",
      password: "Password123",
      confirmPassword: "Password123",
    });
    assert.ok(r1.ok, "Registro 1 debe ser ok");
    if (!r1.ok) return;
    createdUserIds.push(r1.user.id);
    createdClaimIds.push(r1.claim.id);

    // Aprobar el claim 1
    const approveRes = approveClaim(r1.claim.id, "admin-test");
    assert.ok(approveRes.ok, "Aprobación debe ser ok");

    // Crear un segundo claim para la misma propiedad → conflict
    const r2 = registerWithClaim({
      developmentId: testDevId,
      condominioId: testCondoId,
      numVivienda: 1002,
      name: "Conflict User",
      email: `conflictuser-${ts}@test.arc`,
      phone: "6641110003",
      password: "Password123",
      confirmPassword: "Password123",
    });
    assert.ok(r2.ok, "Registro 2 debe ser ok");
    if (!r2.ok) return;
    createdUserIds.push(r2.user.id);
    createdClaimIds.push(r2.claim.id);

    assert.equal(r2.claim.status, "conflict", "Claim 2 debe ser conflict");

    // El claim conflict debe aparecer en la lista
    const claims = listPendingClaimsAdmin({ status: ["pending", "conflict"] });
    const found = claims.find((c) => c.id === r2.claim.id);
    assert.ok(found, "Claim conflict debe aparecer en lista admin");
  });
});

// ── B) approveClaim ───────────────────────────────────────────────────────────

describe("approveClaim", () => {
  it("aprueba claim y marca status = approved", () => {
    const ts = Date.now();

    const r = registerWithClaim({
      developmentId: testDevId,
      condominioId: testCondoId,
      numVivienda: 2001,
      name: "Approve Test",
      email: `approve-${ts}@test.arc`,
      phone: "6641120001",
      password: "Password123",
      confirmPassword: "Password123",
    });
    assert.ok(r.ok, "Registro debe ser ok");
    if (!r.ok) return;
    createdUserIds.push(r.user.id);
    createdClaimIds.push(r.claim.id);

    const res = approveClaim(r.claim.id, "admin-test");
    assert.ok(res.ok, `Aprobación debe ser ok: ${!res.ok ? res.error : ""}`);
    if (!res.ok) return;

    assert.equal(res.claim.status, "approved", "Claim debe quedar approved");
    assert.ok(res.claim.reviewedBy !== null, "Debe tener reviewedBy");
    assert.ok(res.claim.reviewedAt !== null, "Debe tener reviewedAt");
  });

  it("approveClaim guarda snapshot de la propiedad", () => {
    const ts = Date.now();

    // Crear residente en el condominio para tener snapshot real
    const resRes = db
      .prepare(
        "INSERT INTO residentes (condominio_id, nombre, num_vivienda, email) VALUES (?, ?, ?, ?)"
      )
      .run(testCondoId, "Resident Snapshot", 2002, `snap-${ts}@arc.test`);
    const resId = Number(resRes.lastInsertRowid);
    createdResIds.push(resId);

    const r = registerWithClaim({
      developmentId: testDevId,
      condominioId: testCondoId,
      numVivienda: 2002,
      name: "Snapshot User",
      email: `snapshot-${ts}@test.arc`,
      phone: "6641120002",
      password: "Password123",
      confirmPassword: "Password123",
    });
    assert.ok(r.ok, "Registro debe ser ok");
    if (!r.ok) return;
    createdUserIds.push(r.user.id);
    createdClaimIds.push(r.claim.id);

    const res = approveClaim(r.claim.id, "admin-snap");
    assert.ok(res.ok, "Aprobación debe ser ok");
    if (!res.ok) return;

    // El snapshot debe estar guardado
    assert.ok(
      res.claim.propertySnapshot !== null,
      "El snapshot de propiedad debe guardarse"
    );
    assert.ok(
      typeof res.claim.propertySnapshot === "object",
      "El snapshot debe ser un objeto"
    );
  });

  it("approveClaim asocia portal_user.residente_id si hay residente en la vivienda", () => {
    const ts = Date.now();

    // Crear residente en la vivienda
    const resRes = db
      .prepare(
        "INSERT INTO residentes (condominio_id, nombre, num_vivienda, email) VALUES (?, ?, ?, ?)"
      )
      .run(testCondoId, "Res Link Test", 2003, `reslink-${ts}@arc.test`);
    const resId = Number(resRes.lastInsertRowid);
    createdResIds.push(resId);

    const r = registerWithClaim({
      developmentId: testDevId,
      condominioId: testCondoId,
      numVivienda: 2003,
      name: "Link User",
      email: `link-${ts}@test.arc`,
      phone: "6641120003",
      password: "Password123",
      confirmPassword: "Password123",
    });
    assert.ok(r.ok, "Registro debe ser ok");
    if (!r.ok) return;
    createdUserIds.push(r.user.id);
    createdClaimIds.push(r.claim.id);

    const res = approveClaim(r.claim.id, "admin-test");
    assert.ok(res.ok, "Aprobación debe ser ok");

    // Verificar que residente_id fue asignado
    const user = db
      .prepare("SELECT residente_id FROM portal_users WHERE id = ?")
      .get(r.user.id) as { residente_id: number | null } | undefined;
    assert.ok(user !== undefined, "Usuario debe existir");
    assert.equal(user?.residente_id, resId, "residente_id debe ser asignado");
  });
});

// ── C) rejectClaim ────────────────────────────────────────────────────────────

describe("rejectClaim", () => {
  it("rechaza claim con razón y marca status = rejected", () => {
    const ts = Date.now();

    const r = registerWithClaim({
      developmentId: testDevId,
      condominioId: testCondoId,
      numVivienda: 3001,
      name: "Reject Test",
      email: `reject-${ts}@test.arc`,
      phone: "6641130001",
      password: "Password123",
      confirmPassword: "Password123",
    });
    assert.ok(r.ok, "Registro debe ser ok");
    if (!r.ok) return;
    createdUserIds.push(r.user.id);
    createdClaimIds.push(r.claim.id);

    const res = rejectClaim(r.claim.id, "admin-test", "Documentación insuficiente");
    assert.ok(res.ok, `Rechazo debe ser ok: ${!res.ok ? res.error : ""}`);
    if (!res.ok) return;

    assert.equal(res.claim.status, "rejected", "Claim debe quedar rejected");
    assert.ok(
      res.claim.holdReason?.includes("Documentación"),
      "Razón de rechazo debe guardarse"
    );
  });

  it("rejectClaim sin razón → error descriptivo", () => {
    const ts = Date.now();

    const r = registerWithClaim({
      developmentId: testDevId,
      condominioId: testCondoId,
      numVivienda: 3002,
      name: "No Reason Reject",
      email: `noreason-${ts}@test.arc`,
      phone: "6641130002",
      password: "Password123",
      confirmPassword: "Password123",
    });
    assert.ok(r.ok, "Registro debe ser ok");
    if (!r.ok) return;
    createdUserIds.push(r.user.id);
    createdClaimIds.push(r.claim.id);

    const res = rejectClaim(r.claim.id, "admin-test", "");
    assert.equal(res.ok, false, "Rechazo sin razón debe fallar");
  });
});

// ── E) Tickets held → activos al aprobar ──────────────────────────────────────

describe("tickets held se activan al aprobar claim", () => {
  it("tickets en estado 'held' del usuario se mueven a 'nuevo' al aprobar", () => {
    const ts = Date.now();

    // Crear tipo de ticket de prueba
    const ttRes = db
      .prepare(
        "INSERT INTO ticket_types (name, slug, active, sort_order) VALUES (?, ?, 1, 99)"
      )
      .run(`Held Type ${ts}`, `held-type-${ts}`);
    const typeId = Number(ttRes.lastInsertRowid);
    createdTicketTypeIds.push(typeId);

    // Registrar usuario
    const r = registerWithClaim({
      developmentId: testDevId,
      condominioId: testCondoId,
      numVivienda: 4001,
      name: "Held Ticket User",
      email: `held-${ts}@test.arc`,
      phone: "6641140001",
      password: "Password123",
      confirmPassword: "Password123",
    });
    assert.ok(r.ok, "Registro debe ser ok");
    if (!r.ok) return;
    createdUserIds.push(r.user.id);
    createdClaimIds.push(r.claim.id);

    // Crear un ticket en estado 'held' manualmente (como si lo creara un usuario pending)
    const folioPrefix = `HELD-${ts}`;
    const tRes = db
      .prepare(
        "INSERT INTO tickets (folio, ticket_type_id, portal_user_id, status) VALUES (?, ?, ?, 'held')"
      )
      .run(folioPrefix, typeId, r.user.id);
    const ticketId = Number(tRes.lastInsertRowid);
    createdTicketIds.push(ticketId);

    // Verificar que el ticket está en held
    const before = db
      .prepare("SELECT status FROM tickets WHERE id = ?")
      .get(ticketId) as { status: string } | undefined;
    assert.equal(before?.status, "held", "Ticket debe estar en held antes de aprobar");

    // Aprobar el claim → debe activar los tickets held
    const res = approveClaim(r.claim.id, "admin-test");
    assert.ok(res.ok, "Aprobación debe ser ok");

    // Verificar que el ticket pasó a 'nuevo'
    const after = db
      .prepare("SELECT status FROM tickets WHERE id = ?")
      .get(ticketId) as { status: string } | undefined;
    assert.equal(after?.status, "nuevo", "Ticket held debe pasar a nuevo al aprobar");
  });
});

// ── D) Aprobar cuando ya existe otro approved ─────────────────────────────────

describe("approveClaim con conflicto de propiedad", () => {
  it("no se puede aprobar si ya hay otro claim approved para la misma propiedad", () => {
    const ts = Date.now();

    // Usuario 1 → approved
    const r1 = registerWithClaim({
      developmentId: testDevId,
      condominioId: testCondoId,
      numVivienda: 5001,
      name: "First Owner",
      email: `firstowner-${ts}@test.arc`,
      phone: "6641150001",
      password: "Password123",
      confirmPassword: "Password123",
    });
    assert.ok(r1.ok, "Registro 1 debe ser ok");
    if (!r1.ok) return;
    createdUserIds.push(r1.user.id);
    createdClaimIds.push(r1.claim.id);

    const approve1 = approveClaim(r1.claim.id, "admin-test");
    assert.ok(approve1.ok, "Aprobar claim 1 debe ser ok");

    // Usuario 2 con conflict en la misma propiedad
    const r2 = registerWithClaim({
      developmentId: testDevId,
      condominioId: testCondoId,
      numVivienda: 5001,
      name: "Second Owner",
      email: `secondowner-${ts}@test.arc`,
      phone: "6641150002",
      password: "Password123",
      confirmPassword: "Password123",
    });
    assert.ok(r2.ok, "Registro 2 debe ser ok (aunque claim sea conflict)");
    if (!r2.ok) return;
    createdUserIds.push(r2.user.id);
    createdClaimIds.push(r2.claim.id);

    // Intentar aprobar claim 2 → debe fallar (propiedad ya tiene owner approved)
    const approve2 = approveClaim(r2.claim.id, "admin-test");
    assert.equal(approve2.ok, false, "Aprobar claim 2 debe fallar (conflicto)");
  });
});
