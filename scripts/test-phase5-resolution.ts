/**
 * Resolución del comité: decisión, pausa de SLA y filtros.
 * Corre con: npx tsx --test scripts/test-phase5-resolution.ts
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import db from "../src/lib/db-connection.js";
import { applyResolution, getTicketReview } from "../src/lib/portal/resolution.js";
import { startSla, getSlaState } from "../src/lib/portal/sla.js";
import { listTicketsAdmin } from "../src/lib/portal/tickets.js";

let userId = 0;
let typeId = 0;
let ticketId = 0;
let heldId = 0;

before(() => {
  const user = db
    .prepare(
      `INSERT INTO portal_users (name, email, password_hash)
       VALUES ('Resolution Test', ?, 'x')`
    )
    .run(`resolution-${Date.now()}@arc.test`);
  userId = Number(user.lastInsertRowid);

  const type = db
    .prepare(
      `INSERT INTO ticket_types (name, slug, active, sort_order)
       VALUES ('Resolution Type', ?, 1, 99)`
    )
    .run(`resolution-type-${Date.now()}`);
  typeId = Number(type.lastInsertRowid);

  const ticket = db
    .prepare(
      `INSERT INTO tickets (folio, ticket_type_id, portal_user_id, status, request_kind)
       VALUES (?, ?, ?, 'en_revision', 'modification')`
    )
    .run(`RES-${Date.now()}`, typeId, userId);
  ticketId = Number(ticket.lastInsertRowid);

  const held = db
    .prepare(
      `INSERT INTO tickets (folio, ticket_type_id, portal_user_id, status)
       VALUES (?, ?, ?, 'held')`
    )
    .run(`HELD-${Date.now()}`, typeId, userId);
  heldId = Number(held.lastInsertRowid);
});

after(() => {
  for (const id of [ticketId, heldId]) {
    if (id > 0) {
      db.prepare("DELETE FROM sla_events WHERE ticket_id = ?").run(id);
      db.prepare("DELETE FROM ticket_status_history WHERE ticket_id = ?").run(id);
      db.prepare("DELETE FROM ticket_comments WHERE ticket_id = ?").run(id);
      db.prepare("DELETE FROM tickets WHERE id = ?").run(id);
    }
  }
  if (typeId > 0) db.prepare("DELETE FROM ticket_types WHERE id = ?").run(typeId);
  if (userId > 0) db.prepare("DELETE FROM portal_users WHERE id = ?").run(userId);
});

describe("resolución del comité", () => {
  it("exige nota para correcciones y pausa el SLA", () => {
    startSla(ticketId, 5, { createdBy: "test" });
    const missing = applyResolution({
      ticketId,
      decision: "requiere_correcciones",
      note: "no",
      changedBy: "test",
    });
    assert.equal(missing.ok, false);

    const applied = applyResolution({
      ticketId,
      decision: "requiere_correcciones",
      note: "Falta el croquis acotado",
      changedBy: "test",
    });
    assert.equal(applied.ok, true);
    const sla = getSlaState(ticketId);
    assert.equal(sla?.slaStatus, "paused");
    const review = getTicketReview(ticketId);
    assert.equal(review?.decision, "requiere_correcciones");
    assert.ok(review?.technical.some((item) => item.key === "firma_propietario"));
  });

  it("no resuelve un ticket en espera de verificación", () => {
    const result = applyResolution({
      ticketId: heldId,
      decision: "autorizada",
      changedBy: "test",
    });
    assert.equal(result.ok, false);
  });

  it("autorizar cierra el SLA y el filtro de vivienda no rompe el listado", () => {
    const applied = applyResolution({
      ticketId,
      decision: "autorizada",
      changedBy: "test",
    });
    assert.equal(applied.ok, true);
    assert.equal(getSlaState(ticketId)?.slaStatus, "completed");
    const rows = listTicketsAdmin({ numVivienda: "7", overdue: true });
    assert.ok(Array.isArray(rows));
  });
});
