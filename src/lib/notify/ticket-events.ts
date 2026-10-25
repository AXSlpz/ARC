import db from "../db";
import { sendEmail } from "./email";
import { sendWhatsApp } from "./whatsapp";
import { TICKET_STATUS_LABELS, ticketRequestTitle } from "../portal/types";
import type { Ticket, TicketStatus } from "../portal/types";

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
    console.error("[notify] no se pudo registrar notificación:", err);
  }
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

async function dispatch(
  ticket: Ticket,
  subject: string,
  emailHtml: string,
  waText: string
): Promise<void> {
  if (ticket.clientEmail) {
    const res = await sendEmail({ to: ticket.clientEmail, subject, html: emailHtml });
    logNotification({
      channel: "email",
      target: ticket.clientEmail,
      subject,
      body: emailHtml,
      ticketId: ticket.id,
      status: res.ok ? (res.driver === "log" ? "logged" : "sent") : "failed",
      error: res.ok ? null : res.error,
    });
  }

  if (ticket.clientPhone) {
    const res = sendWhatsApp(ticket.clientPhone, waText, ticket.clientName ?? null);
    logNotification({
      channel: "whatsapp",
      target: res.phone ?? ticket.clientPhone,
      body: waText,
      ticketId: ticket.id,
      status: res.ok ? "sent" : "failed",
      error: res.ok ? null : res.error,
    });
  }
}

export async function notifyTicketCreated(ticket: Ticket): Promise<void> {
  const subject = `Solicitud recibida — ${ticket.folio}`;
  const html = emailShell(
    "Recibimos tu solicitud",
    `<p>Hola ${ticket.clientName ?? ""},</p>
     <p>Registramos tu solicitud <strong>${ticketRequestTitle(ticket)}</strong> con folio
     <strong>${ticket.folio}</strong>. La revisaremos y te notificaremos cualquier avance.</p>
     <p>Puedes seguir el estado desde tu portal.</p>`
  );
  const wa = `ARC · ${ticket.folio}: recibimos tu solicitud. Te avisaremos de cualquier avance.`;
  await dispatch(ticket, subject, html, wa);
}

export async function notifyStatusChanged(
  ticket: Ticket,
  toStatus: TicketStatus,
  note?: string | null
): Promise<void> {
  const label = TICKET_STATUS_LABELS[toStatus] ?? toStatus;
  const subject = `Actualización de tu solicitud ${ticket.folio}: ${label}`;
  const noteHtml = note ? `<p><em>${note}</em></p>` : "";
  const html = emailShell(
    "Tu solicitud cambió de estado",
    `<p>Hola ${ticket.clientName ?? ""},</p>
     <p>Tu solicitud <strong>${ticket.folio}</strong> ahora está en estado:
     <strong>${label}</strong>.</p>${noteHtml}`
  );
  const wa = `ARC · ${ticket.folio}: estado actualizado a *${label}*.${note ? ` ${note}` : ""}`;
  await dispatch(ticket, subject, html, wa);
}

export async function notifyTicketAuthorized(
  ticket: Ticket,
  hasLetter: boolean
): Promise<void> {
  const subject = `Solicitud autorizada — ${ticket.folio}`;
  const letterHtml = hasLetter
    ? `<p>Tu carta de autorización ya está disponible para descarga desde el portal.</p>`
    : "";
  const html = emailShell(
    "¡Tu solicitud fue autorizada!",
    `<p>Hola ${ticket.clientName ?? ""},</p>
     <p>Tu solicitud <strong>${ticketRequestTitle(ticket)}</strong> (folio
     <strong>${ticket.folio}</strong>) ha sido <strong>autorizada</strong>.</p>${letterHtml}`
  );
  const wa = `ARC · ${ticket.folio}: *autorizada*.${hasLetter ? " Tu carta ya está en el portal." : ""}`;
  await dispatch(ticket, subject, html, wa);
}
