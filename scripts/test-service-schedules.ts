import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import db from "../src/lib/db-connection.js";
import "../src/lib/residentes.js";
import {
  buildServiceScheduleContext,
  computeNextOccurrences,
  createSchedule,
  deleteSchedule,
  formatDirectServiceScheduleReply,
  initServiceSchedulesSchema,
  listServiceTypes,
  matchServiceTypeFromQuery,
} from "../src/lib/service-schedules.js";

const createdIds: number[] = [];
let condoA = 0;
let condoB = 0;

before(() => {
  initServiceSchedulesSchema();

  const insertCondo = db.prepare(
    `INSERT INTO condominios (name, prefijo, tipo, estatus)
     VALUES (?, ?, 'Vivienda', 'Activo')`
  );
  condoA = Number(
    insertCondo.run(`Test Sched A ${Date.now()}`, "TA").lastInsertRowid
  );
  condoB = Number(
    insertCondo.run(`Test Sched B ${Date.now()}`, "TB").lastInsertRowid
  );
});

after(() => {
  for (const id of createdIds) {
    try {
      deleteSchedule(condoA, id);
    } catch {}
    try {
      deleteSchedule(condoB, id);
    } catch {}
  }
  db.prepare("DELETE FROM condominios WHERE id IN (?, ?)").run(condoA, condoB);
});

describe("service types seed", () => {
  it("tiene los 5 tipos precargados", () => {
    const types = listServiceTypes(true);
    const names = types.map((t) => t.name);
    assert.ok(names.includes("Corte de césped y deshierbe"));
    assert.ok(names.includes("Recolección y programación de basura"));
    assert.ok(names.includes("Mantenimiento de albercas"));
    assert.ok(names.includes("Asambleas de vecinos"));
    assert.ok(names.includes("Cobranza de cuotas de mantenimiento"));
  });
});

describe("matching", () => {
  it("detecta basura en la pregunta", () => {
    const match = matchServiceTypeFromQuery("cuando pasan la basura");
    assert.ok(match);
    assert.equal(match!.type.slug, "recoleccion-basura");
  });
});

describe("recurrence", () => {
  it("calcula every_n_days=15", () => {
    const next = computeNextOccurrences(
      {
        start_date: "2026-01-01",
        recurrence: "every_n_days",
        interval_days: 15,
        weekdays: null,
      },
      new Date("2026-01-01T12:00:00"),
      3
    );
    assert.deepEqual(next, ["2026-01-01", "2026-01-16", "2026-01-31"]);
  });

  it("calcula weekly solo lunes", () => {
    const next = computeNextOccurrences(
      {
        start_date: "2026-01-01",
        recurrence: "weekly",
        interval_days: null,
        weekdays: [1],
      },
      new Date("2026-01-01T12:00:00"),
      3
    );
    // 2026-01-01 is Thursday; next Mondays: 5, 12, 19
    assert.deepEqual(next, ["2026-01-05", "2026-01-12", "2026-01-19"]);
  });
});

describe("condo isolation", () => {
  it("no mezcla schedules entre condominios", () => {
    const types = listServiceTypes(true);
    const basura = types.find((t) => t.slug === "recoleccion-basura");
    assert.ok(basura);

    const a = createSchedule(condoA, {
      service_type_id: basura!.id,
      start_date: "2026-07-14",
      time: "08:00",
      recurrence: "weekly",
      weekdays: [2],
      notes: "Solo condo A",
    });
    createdIds.push(a.id);

    const ctxA = buildServiceScheduleContext(condoA, "cuando pasan la basura");
    const ctxB = buildServiceScheduleContext(condoB, "cuando pasan la basura");
    assert.match(ctxA, /Solo condo A|martes|08:00/i);
    assert.equal(ctxB, "");

    const replyA = formatDirectServiceScheduleReply(
      condoA,
      "Condo A",
      "cuando pasan la basura"
    );
    const replyB = formatDirectServiceScheduleReply(
      condoB,
      "Condo B",
      "cuando pasan la basura"
    );
    assert.ok(replyA);
    assert.match(replyA!, /Condo A/);
    assert.equal(replyB, null);
  });
});
