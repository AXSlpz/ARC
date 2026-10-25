/**
 * Tests de regresión – correcciones de seguridad backend.
 *
 * Cubre (TDD – escribir ANTES de implementar):
 *  1. rate-limit: purge respeta windowMs por clave (no borra entradas de ventana larga antes de tiempo).
 *  2. rate-limit: purge sí borra entradas cuya ventana ya expiró.
 *  3. approveClaim – todos los tickets held se liberan (sin LIMIT 5).
 *  4. approveClaim – rechaza un claim en estado 'rejected' (transición inválida).
 *  5. approveClaim – registra fromStatus en el log de auditoría.
 *  6. approveClaim – SLA arranca aunque el claim no tenga tickets held.
 *  7. registerWithClaim – email duplicado devuelve mensaje GENÉRICO (anti-enumeración).
 *  8. listPendingClaimsAdmin – soporta limit/offset (paginación).
 *  9. listPublicViviendasForCondominio – NO retorna el campo residenteId.
 * 10. CsvRowError – incluye el contenido real de la fila (campo "line").
 * 11. updatePortalProfile – cambio de email exige currentPassword.
 * 12. updatePortalProfile – cambio de email invalida otras sesiones.
 * 13. updatePortalProfile – cambio de email preserva la sesión actual.
 *
 * Corre con: npx tsx --test scripts/test-security-fixes.ts
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import db from "../src/lib/db-connection.js";
import { initPortalSchema } from "../src/lib/portal/init-portal.js";
import { initRegistrationAdminSchema } from "../src/lib/portal/schema-registration-admin.js";
import {
  isRateLimited,
  purgeForTest,
  setEntryForTest,
} from "../src/lib/rate-limit.js";
import {
  registerWithClaim,
  approveClaim,
  listPendingClaimsAdmin,
} from "../src/lib/portal/registration-admin.js";
import {
  listPublicViviendasForCondominio,
} from "../src/lib/portal/catalog.js";
import {
  previewViviendasCsv,
  importViviendasFromCsv,
} from "../src/lib/portal/catalog-import.js";
import {
  updatePortalProfile,
  createPortalSession,
} from "../src/lib/portal/auth.js";
import { hashPassword } from "../src/lib/password.js";

// ── Fixtures globales ─────────────────────────────────────────────────────────

let testDevId = 0;
let testCondoId = 0;
const cleanup = {
  userIds: [] as number[],
  claimIds: [] as number[],
  resIds: [] as number[],
  ticketTypeIds: [] as number[],
  ticketIds: [] as number[],
};

before(() => {
  initPortalSchema();
  initRegistrationAdminSchema();

  const capSur = db
    .prepare("SELECT id FROM developments WHERE slug = 'capital-sur'")
    .get() as { id: number } | undefined;
  if (capSur) {
    testDevId = capSur.id;
  } else {
    const res = db
      .prepare("INSERT INTO developments (name, slug, active) VALUES (?, ?, 1)")
      .run(`Dev SecFix ${Date.now()}`, `dev-secfix-${Date.now()}`);
    testDevId = Number(res.lastInsertRowid);
  }

  const condoRes = db
    .prepare("INSERT INTO condominios (name, prefijo) VALUES (?, ?)")
    .run(`Condo SecFix ${Date.now()}`, `SF${Date.now()}`);
  testCondoId = Number(condoRes.lastInsertRowid);

  db.prepare(
    "INSERT OR IGNORE INTO development_condominios (development_id, condominio_id) VALUES (?, ?)"
  ).run(testDevId, testCondoId);
});

after(() => {
  for (const id of cleanup.ticketIds) {
    db.prepare("DELETE FROM ticket_status_history WHERE ticket_id = ?").run(id);
    db.prepare("DELETE FROM tickets WHERE id = ?").run(id);
  }
  for (const id of cleanup.ticketTypeIds) {
    db.prepare("DELETE FROM ticket_types WHERE id = ?").run(id);
  }
  for (const id of cleanup.claimIds) {
    db.prepare("DELETE FROM property_claims WHERE id = ?").run(id);
  }
  for (const id of cleanup.userIds) {
    db.prepare("DELETE FROM portal_sessions WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM portal_users WHERE id = ?").run(id);
  }
  for (const id of cleanup.resIds) {
    db.prepare("DELETE FROM residentes WHERE id = ?").run(id);
  }
  if (testCondoId) {
    db.prepare("DELETE FROM development_condominios WHERE condominio_id = ?").run(testCondoId);
    db.prepare("DELETE FROM residentes WHERE condominio_id = ?").run(testCondoId);
    db.prepare("DELETE FROM condominios WHERE id = ?").run(testCondoId);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 1 & 2: Rate-limit purge con windowMs por clave
// ─────────────────────────────────────────────────────────────────────────────

describe("rate-limit: purge usa windowMs por clave", () => {
  it("purge NO elimina entrada cuya ventana larga (30 min) aún no ha expirado", () => {
    const key = `rl-long-${Date.now()}`;
    // Simula entrada creada hace 3 minutos con ventana de 30 minutos
    setEntryForTest(key, {
      count: 50,
      windowStart: Date.now() - 3 * 60_000,
      windowMs: 30 * 60_000,
    });

    purgeForTest(); // Con el BUG borra la entrada (3min > hardcoded 2min); con el FIX la conserva

    // Si se conservó, la siguiente llamada devuelve "rate limited" (count=51 > limit=1)
    const blocked = isRateLimited(key, 1, 30 * 60_000);
    assert.ok(blocked, "La entrada con ventana larga debe sobrevivir el purge prematuro");
  });

  it("purge SÍ elimina entrada cuya ventana corta ya expiró", async () => {
    const key = `rl-short-${Date.now()}`;
    // Simula entrada creada hace 200 ms con ventana de 50 ms (ya expirada)
    setEntryForTest(key, {
      count: 100,
      windowStart: Date.now() - 200,
      windowMs: 50,
    });

    purgeForTest(); // Con el FIX borra la entrada (200ms > 50ms windowMs)

    // Si fue purgada, la siguiente llamada crea nueva entrada → primer request → no bloqueado
    const blocked = isRateLimited(key, 1, 50);
    assert.equal(blocked, false, "Entrada expirada debe ser purgada y el primer request no bloquearse");
  });

  it("isRateLimited deja pasar la primera petición tras reset de ventana", () => {
    const key = `rl-window-reset-${Date.now()}`;
    // Maxear el límite
    isRateLimited(key, 2, 100_000);
    isRateLimited(key, 2, 100_000);
    isRateLimited(key, 2, 100_000); // bloqueado

    assert.ok(isRateLimited(key, 2, 100_000), "Debe estar bloqueado");

    // Forzar expiración de la ventana
    setEntryForTest(key, { count: 10, windowStart: Date.now() - 200_000, windowMs: 100_000 });

    // Nueva llamada: ventana expirada → reset → no bloqueado
    const result = isRateLimited(key, 2, 100_000);
    assert.equal(result, false, "Después de expirar la ventana, primer request debe pasar");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3: approveClaim – todos los tickets held se liberan (sin LIMIT 5)
// ─────────────────────────────────────────────────────────────────────────────

describe("approveClaim: libera TODOS los tickets held (sin LIMIT)", () => {
  it("todos los tickets held pasan a 'nuevo' al aprobar (> 5 tickets)", () => {
    const ts = Date.now();

    const ttRes = db
      .prepare("INSERT INTO ticket_types (name, slug, active, sort_order) VALUES (?, ?, 1, 99)")
      .run(`HeldAll ${ts}`, `held-all-${ts}`);
    const typeId = Number(ttRes.lastInsertRowid);
    cleanup.ticketTypeIds.push(typeId);

    const r = registerWithClaim({
      developmentId: testDevId,
      condominioId: testCondoId,
      numVivienda: 9001,
      name: "All Held User",
      email: `allheld-${ts}@sec.arc`,
      phone: "6649000001",
      password: "SecurePass1",
      confirmPassword: "SecurePass1",
    });
    assert.ok(r.ok, `Registro ok: ${!r.ok ? r.error : ""}`);
    if (!r.ok) return;
    cleanup.userIds.push(r.user.id);
    cleanup.claimIds.push(r.claim.id);

    // Crear 8 tickets en estado 'held' para este usuario
    const ticketIds: number[] = [];
    for (let i = 0; i < 8; i++) {
      const tRes = db
        .prepare("INSERT INTO tickets (folio, ticket_type_id, portal_user_id, status) VALUES (?, ?, ?, 'held')")
        .run(`HELD-ALL-${ts}-${i}`, typeId, r.user.id);
      ticketIds.push(Number(tRes.lastInsertRowid));
      cleanup.ticketIds.push(Number(tRes.lastInsertRowid));
    }

    const res = approveClaim(r.claim.id, "admin-all-held");
    assert.ok(res.ok, `Aprobación ok: ${!res.ok ? res.error : ""}`);

    // Verificar que los 8 tickets pasaron a 'nuevo' (no solo los primeros 5)
    const stillHeld = db
      .prepare(
        `SELECT COUNT(*) as c FROM tickets WHERE portal_user_id = ? AND status = 'held'`
      )
      .get(r.user.id) as { c: number };
    assert.equal(stillHeld.c, 0, "Todos los tickets held deben haber sido liberados");

    const nowNuevo = db
      .prepare(
        `SELECT COUNT(*) as c FROM tickets WHERE portal_user_id = ? AND status = 'nuevo'`
      )
      .get(r.user.id) as { c: number };
    assert.equal(nowNuevo.c, 8, "Los 8 tickets deben estar en estado 'nuevo'");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4: approveClaim – guarda de transición (rejected → approved no permitido)
// ─────────────────────────────────────────────────────────────────────────────

describe("approveClaim: transición rejected → approved no permitida", () => {
  it("aprobar un claim en estado 'rejected' devuelve error", () => {
    const ts = Date.now();

    const r = registerWithClaim({
      developmentId: testDevId,
      condominioId: testCondoId,
      numVivienda: 9101,
      name: "Reject Guard User",
      email: `rejguard-${ts}@sec.arc`,
      phone: "6649000002",
      password: "SecurePass1",
      confirmPassword: "SecurePass1",
    });
    assert.ok(r.ok, `Registro ok: ${!r.ok ? r.error : ""}`);
    if (!r.ok) return;
    cleanup.userIds.push(r.user.id);
    cleanup.claimIds.push(r.claim.id);

    // Rechazar el claim
    db.prepare(
      "UPDATE property_claims SET status = 'rejected', reviewed_by = ?, hold_reason = ? WHERE id = ?"
    ).run("admin-test", "Documentación inválida", r.claim.id);

    // Intentar aprobar un claim rechazado → debe fallar
    const res = approveClaim(r.claim.id, "admin-test");
    assert.equal(res.ok, false, "Aprobar un claim rejected debe devolver error");
    if (res.ok) return;
    assert.ok(
      res.error.toLowerCase().includes("rejected") ||
      res.error.toLowerCase().includes("rechazad") ||
      res.error.toLowerCase().includes("estado"),
      `Error debe mencionar el estado inválido: "${res.error}"`
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5: approveClaim – registra fromStatus en el log de auditoría
// ─────────────────────────────────────────────────────────────────────────────

describe("approveClaim: fromStatus en auditoría", () => {
  it("el log de admin incluye fromStatus al aprobar un claim", () => {
    const ts = Date.now();

    const r = registerWithClaim({
      developmentId: testDevId,
      condominioId: testCondoId,
      numVivienda: 9201,
      name: "Audit Status User",
      email: `auditstatus-${ts}@sec.arc`,
      phone: "6649000003",
      password: "SecurePass1",
      confirmPassword: "SecurePass1",
    });
    assert.ok(r.ok, `Registro ok: ${!r.ok ? r.error : ""}`);
    if (!r.ok) return;
    cleanup.userIds.push(r.user.id);
    cleanup.claimIds.push(r.claim.id);

    const res = approveClaim(r.claim.id, "admin-audit");
    assert.ok(res.ok, `Aprobación ok: ${!res.ok ? res.error : ""}`);

    // Verificar en portal_admin_log
    const logRow = db
      .prepare(
        "SELECT metadata FROM portal_admin_log WHERE entity_type='property_claim' AND entity_id=? AND action='approved' ORDER BY id DESC LIMIT 1"
      )
      .get(r.claim.id) as { metadata: string | null } | undefined;

    assert.ok(logRow, "Debe existir una entrada en portal_admin_log");
    const meta = logRow?.metadata ? JSON.parse(logRow.metadata) : null;
    assert.ok(
      meta !== null && "fromStatus" in meta,
      `El log debe incluir fromStatus. metadata=${JSON.stringify(meta)}`
    );
    assert.ok(
      meta.fromStatus === "pending" || meta.fromStatus === "conflict",
      `fromStatus debe ser 'pending' o 'conflict', got: ${meta?.fromStatus}`
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7: registerWithClaim – email duplicado → mensaje genérico
// ─────────────────────────────────────────────────────────────────────────────

describe("registerWithClaim: anti-enumeración de email", () => {
  it("email duplicado devuelve mensaje genérico (sin confirmar que el email existe)", () => {
    const ts = Date.now();
    const email = `dup-sec-${ts}@sec.arc`;

    // Registrar por primera vez
    const r1 = registerWithClaim({
      developmentId: testDevId,
      condominioId: testCondoId,
      numVivienda: 9301,
      name: "First Dup User",
      email,
      phone: "6649000010",
      password: "SecurePass1",
      confirmPassword: "SecurePass1",
    });
    assert.ok(r1.ok, `Primer registro ok: ${!r1.ok ? r1.error : ""}`);
    if (r1.ok) {
      cleanup.userIds.push(r1.user.id);
      cleanup.claimIds.push(r1.claim.id);
    }

    // Segundo intento con el mismo email
    const r2 = registerWithClaim({
      developmentId: testDevId,
      condominioId: testCondoId,
      numVivienda: 9302,
      name: "Second Dup User",
      email,
      phone: "6649000011",
      password: "SecurePass2",
      confirmPassword: "SecurePass2",
    });

    assert.equal(r2.ok, false, "Debe fallar con email duplicado");
    if (r2.ok) return;

    // El mensaje NO debe revelar que el email ya existe
    const errorLower = r2.error.toLowerCase();
    const revealsEmail =
      errorLower.includes("ya existe") ||
      errorLower.includes("already") ||
      errorLower.includes("registrado") ||
      (errorLower.includes("correo") && errorLower.includes("cuenta"));
    assert.equal(
      revealsEmail,
      false,
      `El error NO debe confirmar que el email existe. Error: "${r2.error}"`
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8: listPendingClaimsAdmin – paginación limit/offset
// ─────────────────────────────────────────────────────────────────────────────

describe("listPendingClaimsAdmin: paginación", () => {
  it("soporta limit para no devolver todos los claims", () => {
    const ts = Date.now();

    // Crear 3 claims
    for (let i = 0; i < 3; i++) {
      const r = registerWithClaim({
        developmentId: testDevId,
        condominioId: testCondoId,
        numVivienda: 9400 + i,
        name: `Pag User ${i}`,
        email: `pag-${ts}-${i}@sec.arc`,
        phone: `664900002${i}`,
        password: "SecurePass1",
        confirmPassword: "SecurePass1",
      });
      if (r.ok) {
        cleanup.userIds.push(r.user.id);
        cleanup.claimIds.push(r.claim.id);
      }
    }

    const all = listPendingClaimsAdmin({ limit: 1000 });
    const withLimit = listPendingClaimsAdmin({ limit: 1 });

    assert.ok(all.length >= 3, "Sin limit debe haber al menos 3 claims");
    assert.equal(withLimit.length, 1, "Con limit=1 debe devolver exactamente 1 claim");
  });

  it("soporta offset para paginar resultados", () => {
    const ts = Date.now();
    for (let i = 0; i < 2; i++) {
      const r = registerWithClaim({
        developmentId: testDevId,
        condominioId: testCondoId,
        numVivienda: 9500 + i,
        name: `Offset User ${i}`,
        email: `offset-${ts}-${i}@sec.arc`,
        phone: `664900003${i}`,
        password: "SecurePass1",
        confirmPassword: "SecurePass1",
      });
      if (r.ok) {
        cleanup.userIds.push(r.user.id);
        cleanup.claimIds.push(r.claim.id);
      }
    }

    const page1 = listPendingClaimsAdmin({ limit: 1, offset: 0 });
    const page2 = listPendingClaimsAdmin({ limit: 1, offset: 1 });

    assert.equal(page1.length, 1, "Página 1 debe tener 1 claim");
    assert.equal(page2.length, 1, "Página 2 debe tener 1 claim");
    assert.notEqual(
      page1[0]?.id,
      page2[0]?.id,
      "Las páginas deben contener claims diferentes"
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9: listPublicViviendasForCondominio – sin residenteId
// ─────────────────────────────────────────────────────────────────────────────

describe("catálogo público: sin residenteId en viviendas", () => {
  it("listPublicViviendasForCondominio NO expone residenteId", () => {
    // Crear un residente en el condominio de prueba
    const vivNum = 9601;
    const resRes = db
      .prepare(
        "INSERT INTO residentes (condominio_id, nombre, num_vivienda) VALUES (?, ?, ?)"
      )
      .run(testCondoId, `VivTest ${Date.now()}`, vivNum);
    cleanup.resIds.push(Number(resRes.lastInsertRowid));

    const viviendas = listPublicViviendasForCondominio(testCondoId);
    const found = viviendas.find((v) => v.numVivienda === vivNum);

    assert.ok(found, "La vivienda debe aparecer en el catálogo");
    assert.ok(!("residenteId" in (found ?? {})), "La vivienda NO debe tener campo residenteId");
    assert.ok(!("nombre" in (found ?? {})), "La vivienda NO debe tener campo nombre");
    assert.ok(!("email" in (found ?? {})), "La vivienda NO debe tener campo email");
    assert.equal(
      Object.keys(found ?? {}).join(","),
      "numVivienda",
      "Solo debe exponer el campo numVivienda"
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10: CsvRowError – incluye contenido de la fila
// ─────────────────────────────────────────────────────────────────────────────

describe("CSV import: errores incluyen contenido de fila", () => {
  it("previewViviendasCsv incluye 'line' con el contenido de la fila errónea", () => {
    const csv = [
      "development_id,condominio_id,num_vivienda",
      "abc,1,101",      // error: development_id inválido (no numérico)
      "1,2,202",        // fila válida
    ].join("\n");

    const result = previewViviendasCsv(csv);
    assert.ok(result.errors.length > 0, "Debe haber al menos un error");

    const firstError = result.errors[0];
    assert.ok(
      "line" in firstError && typeof firstError.line === "string",
      `El error debe incluir el campo 'line'. Error: ${JSON.stringify(firstError)}`
    );
    assert.ok(
      firstError.line?.includes("abc"),
      `El campo 'line' debe contener el contenido de la fila errónea. Got: "${firstError.line}"`
    );
  });

  it("importViviendasFromCsv incluye 'line' cuando falla la inserción", () => {
    const csv = [
      "development_id,condominio_id,num_vivienda",
      "99999,99999,101",  // condominio inexistente → error con fila
    ].join("\n");

    const result = importViviendasFromCsv(csv);
    // El error de condominio inexistente debe incluir la fila
    const condoError = result.errors.find((e) =>
      e.message.toLowerCase().includes("condominio") ||
      e.message.toLowerCase().includes("existe")
    );
    assert.ok(condoError, "Debe haber un error sobre condominio inexistente");
    // row no debe ser -1 (valor genérico antiguo)
    assert.notEqual(condoError?.row, -1, "El número de fila no debe ser -1 (debe ser el real)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11, 12, 13: updatePortalProfile – seguridad de cambio de email
// ─────────────────────────────────────────────────────────────────────────────

describe("updatePortalProfile: seguridad al cambiar email", () => {
  it("cambio de email sin currentPassword devuelve error", () => {
    const ts = Date.now();
    const pass = "SecurePass1!";
    const hash = hashPassword(pass);

    const res = db
      .prepare(
        "INSERT INTO portal_users (name, email, phone, password_hash, active) VALUES (?, ?, ?, ?, 1)"
      )
      .run(`Email Change Test ${ts}`, `emailchg-${ts}@sec.arc`, null, hash);
    const userId = Number(res.lastInsertRowid);
    cleanup.userIds.push(userId);

    const result = updatePortalProfile(userId, {
      email: `new-${ts}@sec.arc`,
      // currentPassword: undefined  ← no se provee
    });

    assert.equal(result.ok, false, "Cambiar email sin currentPassword debe fallar");
    if (result.ok) return;
    assert.ok(
      result.error.toLowerCase().includes("contraseña") ||
      result.error.toLowerCase().includes("password") ||
      result.error.toLowerCase().includes("verificar"),
      `Error debe mencionar contraseña requerida: "${result.error}"`
    );
  });

  it("cambio de email con currentPassword incorrecta devuelve error", () => {
    const ts = Date.now();
    const pass = "SecurePass1!";
    const hash = hashPassword(pass);

    const res = db
      .prepare(
        "INSERT INTO portal_users (name, email, phone, password_hash, active) VALUES (?, ?, ?, ?, 1)"
      )
      .run(`Email WrongPass ${ts}`, `emailwp-${ts}@sec.arc`, null, hash);
    const userId = Number(res.lastInsertRowid);
    cleanup.userIds.push(userId);

    const result = updatePortalProfile(userId, {
      email: `new-wp-${ts}@sec.arc`,
      currentPassword: "wrongPassword!",
    });

    assert.equal(result.ok, false, "Cambiar email con contraseña incorrecta debe fallar");
    if (result.ok) return;
    assert.ok(
      result.error.toLowerCase().includes("contraseña") ||
      result.error.toLowerCase().includes("incorrecta") ||
      result.error.toLowerCase().includes("inválida"),
      `Error debe mencionar contraseña incorrecta: "${result.error}"`
    );
  });

  it("cambio de email invalida otras sesiones", () => {
    const ts = Date.now();
    const pass = "SecurePass1!";
    const hash = hashPassword(pass);

    const userRes = db
      .prepare(
        "INSERT INTO portal_users (name, email, phone, password_hash, active) VALUES (?, ?, ?, ?, 1)"
      )
      .run(`Email Invalidate ${ts}`, `emailinv-${ts}@sec.arc`, null, hash);
    const userId = Number(userRes.lastInsertRowid);
    cleanup.userIds.push(userId);

    // Crear 2 sesiones
    const session1 = createPortalSession(userId);
    const session2 = createPortalSession(userId);

    // Cambiar email conservando session1
    const result = updatePortalProfile(userId, {
      email: `newinv-${ts}@sec.arc`,
      currentPassword: pass,
      currentSessionId: session1,
    });

    assert.ok(result.ok, `Cambio de email debe ser ok: ${!result.ok ? result.error : ""}`);

    // session2 debe haber sido invalidada
    const s2 = db
      .prepare("SELECT id FROM portal_sessions WHERE id = ?")
      .get(session2) as { id: string } | undefined;
    assert.equal(s2, undefined, "La sesión 2 debe haber sido invalidada");

    // session1 debe seguir activa
    const s1 = db
      .prepare("SELECT id FROM portal_sessions WHERE id = ?")
      .get(session1) as { id: string } | undefined;
    assert.ok(s1, "La sesión 1 (actual) debe seguir activa");
  });

  it("cambio de nombre sin email no requiere contraseña", () => {
    const ts = Date.now();
    const hash = hashPassword("any");

    const res = db
      .prepare(
        "INSERT INTO portal_users (name, email, phone, password_hash, active) VALUES (?, ?, ?, ?, 1)"
      )
      .run(`Name Only Change ${ts}`, `nameonly-${ts}@sec.arc`, null, hash);
    const userId = Number(res.lastInsertRowid);
    cleanup.userIds.push(userId);

    const result = updatePortalProfile(userId, {
      name: `Nuevo Nombre ${ts}`,
      // sin email, sin currentPassword
    });

    assert.ok(result.ok, `Cambio de nombre debe ser ok: ${!result.ok ? result.error : ""}`);
  });
});
