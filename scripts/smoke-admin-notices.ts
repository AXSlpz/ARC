/**
 * Smoke: plantillas + createAndSendAdminNotice (email log + WA outbox).
 * Ejecutar: npx tsx scripts/smoke-admin-notices.ts
 */
import assert from "node:assert/strict";
import db from "../src/lib/db";
import { createAndSendAdminNotice } from "../src/lib/portal/admin-notices";
import {
  createTemplate,
  listTemplates,
  renderTemplateBody,
} from "../src/lib/portal/notification-templates";
import { initPhase2Schema } from "../src/lib/portal/schema";
import {
  addComment,
  getTicketById,
  getTicketComments,
  listTicketsForUser,
} from "../src/lib/portal/tickets";

initPhase2Schema();

function pickResidenteId(): number {
  const row = db
    .prepare(
      `SELECT id FROM residentes
       WHERE active = 1
         AND nombre IS NOT NULL AND nombre != 'Vacante'
         AND (celular IS NOT NULL OR (email IS NOT NULL AND email != ''))
       ORDER BY id DESC LIMIT 1`
    )
    .get() as { id: number } | undefined;
  if (row) return row.id;

  // Crear residente mínimo de prueba
  const condo = db
    .prepare("SELECT name FROM condominios LIMIT 1")
    .get() as { name: string } | undefined;
  const condoName = condo?.name ?? "Pendiente De Asignacion";
  const res = db
    .prepare(
      `INSERT INTO residentes (condominio_name, nombre, celular, email, active)
       VALUES (?, ?, ?, ?, 1)`
    )
    .run(condoName, "Smoke Notice Residente", 8115551234, "smoke-notice@example.com");
  return Number(res.lastInsertRowid);
}

async function main() {
  assert.ok(
    renderTemplateBody("Hola {{nombre}}", { nombre: "Ana" }).includes("Ana")
  );

  const templates = listTemplates();
  assert.ok(templates.length >= 1, "debe haber plantillas seed o creadas");

  let templateId = templates.find((t) => t.active)?.id;
  if (!templateId) {
    const created = createTemplate({
      name: "Smoke plantilla",
      body: "Hola {{nombre}}. Motivo: {{motivo}}. Folio {{folio}}. Viv {{vivienda}} en {{condominio}}.",
      active: true,
    });
    templateId = created.id;
  }

  const residenteId = pickResidenteId();
  const result = await createAndSendAdminNotice({
    residenteId,
    templateId,
    extraNote: "Prueba smoke de incumplimiento",
    adminName: "Smoke Admin",
  });
  if (!result.ok) {
    throw new Error(result.error);
  }

  const ticket = result.ticket;
  assert.equal(ticket.origin, "admin_notice");
  assert.ok(ticket.folio.startsWith("ARC-"));
  assert.equal(ticket.residenteId, residenteId);

  const full = getTicketById(ticket.id);
  assert.ok(full);
  const comments = getTicketComments(ticket.id);
  assert.ok(
    comments.some((c) => c.authorType === "admin"),
    "debe haber comentario admin con el cuerpo de la notificación"
  );

  // Cliente puede responder
  addComment({
    ticketId: ticket.id,
    authorType: "client",
    authorName: "Cliente smoke",
    body: "Recibí la notificación, estoy atendiendo.",
  });
  const afterComments = getTicketComments(ticket.id);
  assert.ok(afterComments.some((c) => c.authorType === "client"));

  const forUser = listTicketsForUser(ticket.portalUserId);
  assert.ok(forUser.some((t) => t.id === ticket.id));

  const logs = db
    .prepare(
      "SELECT channel, status FROM notifications_log WHERE ticket_id = ? ORDER BY id"
    )
    .all(ticket.id) as Array<{ channel: string; status: string }>;
  assert.ok(logs.length >= 1, "debe haber log de email y/o whatsapp");
  console.log("OK smoke-admin-notices", {
    folio: ticket.folio,
    ticketId: ticket.id,
    logs,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
