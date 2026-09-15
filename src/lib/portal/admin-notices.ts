import db from "../db";
import { sendEmail } from "../notify/email";
import { sendWhatsApp } from "../notify/whatsapp";
import { getResidente } from "../residentes";
import type { Residente } from "../residentes";
import { broadcastTicketEvent } from "../ws-notify";
import {
  ensurePortalUserForResidente,
  getPortalUserById,
} from "./auth";
import { getTemplate, renderTemplateBody } from "./notification-templates";
import { initPhase2Schema } from "./schema";
import { addComment, getTicketById } from "./tickets";
import type { Ticket } from "./types";

initPhase2Schema();

const ADMIN_NOTICE_SLUG = "notificacion-administrativa";

function generateFolio(id: number): string {
  return `ARC-${String(id).padStart(5, "0")}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emailShell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f5f5f7;padding:24px;color:#1a1a1a">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e5ea">
      <div style="background:#0b0620;color:#fff;padding:20px 24px;font-weight:800;letter-spacing:.2em">ARC</div>
      <div style="padding:24px">
        <h2 style="margin:0 0 12px;font-size:18px">${title}</h2>
        ${bodyHtml}
      </div>
      <div style="padding:16px 24px;color:#8a8a8e;font-size:12px;border-top:1px solid #eee">
        Este es un mensaje automático de ARC. Por favor no respondas a este correo.
      </div>
    </div>
  </body></html>`;
}

function logNotification(input: {
  channel: "email" | "whatsapp";
  target: string;
  subject?: string | null;
  body: string;
  ticketId?: number | null;
  status: "sent" | "failed" | "logged";
  error?: string | null;
}): void {
  try {
    db.prepare(
      `INSERT INTO notifications_log (channel, target, subject, body, ticket_id, status, error)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.channel,
      input.target,
      input.subject ?? null,
      input.body,
      input.ticketId ?? null,
      input.status,
      input.error ?? null
    );
  } catch (err) {
    console.error("[admin-notices] no se pudo registrar notificación:", err);
  }
}

function viviendaLabel(residente: Residente): string {
  if (residente.num_coto) return residente.num_coto;
  if (residente.num_vivienda != null) return String(residente.num_vivienda);
  return "—";
}

function isSyntheticPortalEmail(email: string): boolean {
  return email.toLowerCase().endsWith("@pending.arc.local");
}

function ensureAdminNoticeTicketTypeId(): number | null {
  const existing = db
    .prepare("SELECT id FROM ticket_types WHERE slug = ?")
    .get(ADMIN_NOTICE_SLUG) as { id: number } | undefined;
  if (existing) return existing.id;
  try {
    const res = db
      .prepare(
        `INSERT INTO ticket_types (name, slug, description, active, sort_order)
         VALUES (?, ?, ?, 1, 90)`
      )
      .run(
        "Notificación administrativa",
        ADMIN_NOTICE_SLUG,
        "Notificación enviada por administración al residente."
      );
    return Number(res.lastInsertRowid);
  } catch {
    const again = db
      .prepare("SELECT id FROM ticket_types WHERE slug = ?")
      .get(ADMIN_NOTICE_SLUG) as { id: number } | undefined;
    return again?.id ?? null;
  }
}

export async function createAndSendAdminNotice(input: {
  residenteId: number;
  templateId: number;
  extraNote?: string | null;
  adminName?: string | null;
}): Promise<{ ok: true; ticket: Ticket } | { ok: false; error: string }> {
  const residente = getResidente(input.residenteId);
  if (!residente) {
    return { ok: false, error: "Residente no encontrado." };
  }
  if (residente.ocupacion === "Vacante") {
    return { ok: false, error: "No se puede notificar a una vivienda vacante." };
  }

  const hasCelular =
    residente.celular != null && String(residente.celular).trim() !== "";
  const hasEmail = Boolean(residente.email?.trim());
  if (!hasCelular && !hasEmail) {
    return {
      ok: false,
      error: "El residente no tiene celular ni correo para notificar.",
    };
  }

  const template = getTemplate(input.templateId);
  if (!template) {
    return { ok: false, error: "Plantilla no encontrada." };
  }
  if (!template.active) {
    return { ok: false, error: "La plantilla no está activa." };
  }

  const ensured = ensurePortalUserForResidente(residente.id);
  if (!ensured.ok) return ensured;

  const typeId = ensureAdminNoticeTicketTypeId();
  if (!typeId) {
    return {
      ok: false,
      error: "No se encontró el tipo de ticket de notificación administrativa.",
    };
  }

  const extraNote = input.extraNote?.trim() || null;
  const adminName = input.adminName?.trim() || "Administración";

  let ticketId: number;
  let folio: string;
  try {
    const created = db.transaction(() => {
      const res = db
        .prepare(
          `INSERT INTO tickets
             (folio, ticket_type_id, portal_user_id, status, origin, residente_id, notification_template_id)
           VALUES ('', ?, ?, 'nuevo', 'admin_notice', ?, ?)`
        )
        .run(typeId, ensured.portalUserId, residente.id, template.id);
      const id = Number(res.lastInsertRowid);
      const generated = generateFolio(id);
      db.prepare("UPDATE tickets SET folio = ? WHERE id = ?").run(generated, id);
      db.prepare(
        `INSERT INTO ticket_status_history (ticket_id, from_status, to_status, changed_by, note)
         VALUES (?, NULL, 'nuevo', 'admin', ?)`
      ).run(id, template.name);
      return { id, folio: generated };
    })();
    ticketId = created.id;
    folio = created.folio;
  } catch (err) {
    console.error("[admin-notices] no se pudo crear el ticket:", err);
    return { ok: false, error: "No se pudo crear el ticket de notificación." };
  }

  const vars: Record<string, string> = {
    nombre: residente.nombre ?? "",
    motivo: extraNote ?? template.name,
    vivienda: viviendaLabel(residente),
    condominio: residente.condominio_name ?? "",
    folio,
  };
  const rendered = renderTemplateBody(template.body, vars);
  const commentBody = extraNote ? `${rendered}\n\n${extraNote}` : rendered;

  addComment({
    ticketId,
    authorType: "admin",
    authorName: adminName,
    body: commentBody,
    internal: false,
  });

  const portalUser = getPortalUserById(ensured.portalUserId);
  const emailTo =
    residente.email?.trim() || portalUser?.email?.trim() || null;
  const phoneTo =
    residente.celular != null
      ? String(residente.celular)
      : (portalUser?.phone ?? null);

  const subject = `Notificación ARC — ${folio}: ${template.name}`;
  const html = emailShell(
    escapeHtml(template.name),
    `<p>${escapeHtml(rendered).replace(/\n/g, "<br/>")}</p>`
  );
  const waText = `${rendered}\n\nFolio: ${folio}. Consulta tu portal.`;

  if (emailTo && !isSyntheticPortalEmail(emailTo)) {
    const res = await sendEmail({
      to: emailTo,
      subject,
      html,
      text: rendered,
    });
    logNotification({
      channel: "email",
      target: emailTo,
      subject,
      body: rendered,
      ticketId,
      status: res.ok ? (res.driver === "log" ? "logged" : "sent") : "failed",
      error: res.ok ? null : res.error,
    });
  }

  if (phoneTo) {
    const res = sendWhatsApp(
      phoneTo,
      waText,
      residente.nombre ?? portalUser?.name ?? null
    );
    logNotification({
      channel: "whatsapp",
      target: res.phone ?? phoneTo,
      subject,
      body: waText,
      ticketId,
      status: res.ok ? "sent" : "failed",
      error: res.ok ? null : (res.error ?? null),
    });
  }

  broadcastTicketEvent({
    ticketId,
    portalUserId: ensured.portalUserId,
    folio,
    actor: "admin",
    kind: "created",
  });

  const ticket = getTicketById(ticketId);
  if (!ticket) {
    return { ok: false, error: "El ticket se creó pero no se pudo leer." };
  }
  return { ok: true, ticket };
}
