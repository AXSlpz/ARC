/**
 * Tests Fase 3: SLA (días hábiles + pausa/reanuda).
 *
 * Corre con: npx tsx --test scripts/test-phase3-sla.ts
 *
 * Verifica:
 * - isBusinessDay: sábado/domingo no hábiles
 * - isBusinessDay: festivos MX fijos
 * - addBusinessDays: avanza N días hábiles correctamente
 * - countBusinessDays: cuenta días entre fechas
 * - startSla / pauseSla / resumeSla en ticket real
 * - SLA idempotente (pausa/reanuda no duplica eventos innecesariamente)
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import db from "../src/lib/db-connection.js";

import { initPhase3Schema } from "../src/lib/portal/schema-phase3.js";
import {
  isBusinessDay,
  addBusinessDays,
  countBusinessDays,
  startSla,
  pauseSla,
  resumeSla,
  completeSla,
  getSlaState,
  getSlaEvents,
} from "../src/lib/portal/sla.js";

// ── Helpers de fixtures ───────────────────────────────────────────────────────

let testUserId = 0;
let testTypeId = 0;
let testTicketId = 0;

before(() => {
  initPhase3Schema();

  // Usuario mínimo para el ticket
  const userRes = db
    .prepare(
      `INSERT INTO portal_users (name, email, password_hash)
       VALUES ('SLA Test User', 'sla-test-${Date.now()}@arc.test', 'x')`
    )
    .run();
  testUserId = Number(userRes.lastInsertRowid);

  // Tipo de ticket
  const typeRes = db
    .prepare(
      `INSERT INTO ticket_types (name, slug, active, sort_order)
       VALUES ('SLA Test Type', 'sla-test-${Date.now()}', 1, 99)`
    )
    .run();
  testTypeId = Number(typeRes.lastInsertRowid);

  // Ticket
  const ticketRes = db
    .prepare(
      `INSERT INTO tickets (folio, ticket_type_id, portal_user_id, status)
       VALUES ('SLA-TEST-${Date.now()}', ?, ?, 'nuevo')`
    )
    .run(testTypeId, testUserId);
  testTicketId = Number(ticketRes.lastInsertRowid);
});

after(() => {
  if (testTicketId > 0) {
    db.prepare("DELETE FROM sla_events WHERE ticket_id = ?").run(testTicketId);
    db.prepare("DELETE FROM tickets WHERE id = ?").run(testTicketId);
  }
  if (testTypeId > 0) {
    db.prepare("DELETE FROM ticket_types WHERE id = ?").run(testTypeId);
  }
  if (testUserId > 0) {
    db.prepare("DELETE FROM portal_users WHERE id = ?").run(testUserId);
  }
});

// ── isBusinessDay ─────────────────────────────────────────────────────────────

describe("isBusinessDay", () => {
  it("lunes es día hábil", () => {
    // 2026-01-05 es lunes
    assert.ok(isBusinessDay(new Date("2026-01-05T12:00:00Z")));
  });

  it("sábado NO es día hábil", () => {
    // 2026-01-03 es sábado
    assert.equal(isBusinessDay(new Date("2026-01-03T12:00:00Z")), false);
  });

  it("domingo NO es día hábil", () => {
    // 2026-01-04 es domingo
    assert.equal(isBusinessDay(new Date("2026-01-04T12:00:00Z")), false);
  });

  it("1 de enero NO es hábil (Año Nuevo)", () => {
    assert.equal(isBusinessDay(new Date("2026-01-01T12:00:00Z")), false);
  });

  it("16 de septiembre NO es hábil (Independencia)", () => {
    assert.equal(isBusinessDay(new Date("2026-09-16T12:00:00Z")), false);
  });

  it("25 de diciembre NO es hábil (Navidad)", () => {
    assert.equal(isBusinessDay(new Date("2026-12-25T12:00:00Z")), false);
  });

  it("festivo extra personalizado no es hábil", () => {
    // 2026-03-16 sería hábil sin extra holidays
    const date = new Date("2026-03-16T12:00:00Z");
    assert.ok(isBusinessDay(date, []));
    assert.equal(isBusinessDay(date, ["03-16"]), false);
  });
});

// ── addBusinessDays ───────────────────────────────────────────────────────────

describe("addBusinessDays", () => {
  it("0 días hábiles → mismo día (si es hábil)", () => {
    // Lunes 2026-01-05
    const from = new Date("2026-01-05T08:00:00Z");
    const result = addBusinessDays(from, 0);
    // result debe ser >= inicio del mismo día
    const resultDate = new Date(result * 1000);
    assert.equal(resultDate.toISOString().slice(0, 10), "2026-01-05");
  });

  it("5 días hábiles desde lunes → siguiente lunes (sin festivos)", () => {
    // Desde 2026-01-05 (lun) + 5 hábiles = 2026-01-12 (lun siguiente)
    const from = new Date("2026-01-05T08:00:00Z");
    const result = addBusinessDays(from, 5);
    const date = new Date(result * 1000).toISOString().slice(0, 10);
    assert.equal(date, "2026-01-12");
  });

  it("salta fin de semana correctamente", () => {
    // Desde viernes 2026-01-09 + 1 = lunes 2026-01-12
    const from = new Date("2026-01-09T08:00:00Z");
    const result = addBusinessDays(from, 1);
    const date = new Date(result * 1000).toISOString().slice(0, 10);
    assert.equal(date, "2026-01-12");
  });

  it("lanza error con días negativos", () => {
    assert.throws(() => addBusinessDays(new Date(), -1), /días hábiles/);
  });
});

// ── countBusinessDays ─────────────────────────────────────────────────────────

describe("countBusinessDays", () => {
  it("de lunes a viernes de la misma semana = 5 días", () => {
    // 2026-01-05 lun → 2026-01-10 sáb (excluido) → 5 hábiles
    const from = new Date("2026-01-05T00:00:00Z");
    const to = new Date("2026-01-10T00:00:00Z");
    assert.equal(countBusinessDays(from, to), 5);
  });

  it("from = to → 0 días", () => {
    const d = new Date("2026-01-05T00:00:00Z");
    assert.equal(countBusinessDays(d, d), 0);
  });

  it("to < from → 0 días (no negativo)", () => {
    const from = new Date("2026-01-10T00:00:00Z");
    const to = new Date("2026-01-05T00:00:00Z");
    assert.equal(countBusinessDays(from, to), 0);
  });
});

// ── SLA en ticket ─────────────────────────────────────────────────────────────

describe("startSla", () => {
  it("inicia el SLA con 5 días hábiles", () => {
    const state = startSla(testTicketId, 5, { createdBy: "test" });
    assert.ok(state, "debe devolver estado SLA");
    assert.equal(state.slaStatus, "active");
    assert.ok(state.slaTargetAt != null, "debe tener deadline");
    assert.ok(state.slaTargetAt! > Math.floor(Date.now() / 1000));
  });

  it("startSla es idempotente (segunda llamada no cambia el deadline)", () => {
    const s1 = getSlaState(testTicketId);
    const s2 = startSla(testTicketId, 10); // distintos días pero no debe aplicar
    assert.ok(s1 && s2);
    assert.equal(s1.slaTargetAt, s2.slaTargetAt, "el deadline no debe cambiar");
  });

  it("registra evento 'started' en sla_events", () => {
    const events = getSlaEvents(testTicketId);
    const started = events.filter((e) => e.eventType === "started");
    assert.ok(started.length >= 1, "debe haber al menos un evento 'started'");
  });
});

describe("pauseSla / resumeSla", () => {
  it("pausar cambia sla_status a 'paused'", () => {
    const state = pauseSla(testTicketId, {
      reason: "esperando documentos",
      createdBy: "test",
    });
    assert.ok(state, "debe devolver estado");
    assert.equal(state.slaStatus, "paused");
    assert.ok(state.slaPausedAt != null, "debe registrar pausedAt");
  });

  it("pausar de nuevo es idempotente (ya pausado)", () => {
    const before = getSlaState(testTicketId);
    const after2 = pauseSla(testTicketId);
    assert.equal(before?.slaStatus, "paused");
    assert.equal(after2?.slaStatus, "paused");
    // El pausedAt no debe cambiar
    assert.equal(before?.slaPausedAt, after2?.slaPausedAt);
  });

  it("registra evento 'paused'", () => {
    const events = getSlaEvents(testTicketId);
    const paused = events.filter((e) => e.eventType === "paused");
    assert.ok(paused.length >= 1);
    assert.equal(paused[0]!.reason, "esperando documentos");
  });

  it("reanudar cambia sla_status a 'active' y recalcula deadline", () => {
    const pausedState = getSlaState(testTicketId);
    assert.equal(pausedState?.slaStatus, "paused");

    const state = resumeSla(testTicketId, { reason: "docs recibidos", createdBy: "test" });
    assert.ok(state, "debe devolver estado");
    assert.equal(state.slaStatus, "active");
    assert.equal(state.slaPausedAt, null, "pausedAt debe limpiarse");
    // El nuevo deadline debe ser futuro
    assert.ok(state.slaTargetAt! > Math.floor(Date.now() / 1000));
  });

  it("reanudar de nuevo es idempotente (ya activo)", () => {
    const s1 = getSlaState(testTicketId);
    const s2 = resumeSla(testTicketId);
    assert.equal(s1?.slaStatus, "active");
    assert.equal(s2?.slaStatus, "active");
  });

  it("registra evento 'resumed'", () => {
    const events = getSlaEvents(testTicketId);
    const resumed = events.filter((e) => e.eventType === "resumed");
    assert.ok(resumed.length >= 1);
  });
});

describe("completeSla", () => {
  it("completar cambia sla_status a 'completed'", () => {
    const state = completeSla(testTicketId, { createdBy: "test" });
    assert.ok(state);
    assert.equal(state.slaStatus, "completed");
  });

  it("getSlaState refleja completed", () => {
    const state = getSlaState(testTicketId);
    assert.equal(state?.slaStatus, "completed");
  });
});

describe("getSlaState en ticket inexistente", () => {
  it("devuelve null para ticket que no existe", () => {
    const state = getSlaState(999999);
    assert.equal(state, null);
  });
});
