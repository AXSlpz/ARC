import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import {
  addComment,
  getTicketById,
  getTicketComments,
  setTicketAwaiting,
} from "@/lib/portal/tickets";
import type { TicketAwaitingKind } from "@/lib/portal/types";
import { sendWhatsApp } from "@/lib/notify/whatsapp";
import { sendEmail } from "@/lib/notify/email";
import { broadcastTicketEvent } from "@/lib/ws-notify";
import db from "@/lib/db";
import { pauseSla } from "@/lib/portal/sla";

interface Ctx {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

const VALID_KINDS: TicketAwaitingKind[] = ["info", "file", "answer"];

function guidedMessage(
  folio: string,
  kind: TicketAwaitingKind,
  note: string
): string {
  const detail = note ? ` ${note}` : "";
  if (kind === "file") {
    return `ARC · ${folio}: la administración necesita un archivo.${detail} Responde a este mensaje adjuntando el documento.`;
  }
  if (kind === "answer") {
    return `ARC · ${folio}: la administración tiene una pregunta.${detail} Responde a este mensaje para contestar.`;
  }
  return `ARC · ${folio}: la administración necesita información adicional.${detail} Responde a este mensaje.`;
}

function kindLabel(kind: TicketAwaitingKind): string {
  if (kind === "file") return "un archivo";
  if (kind === "answer") return "una respuesta";
  return "información adicional";
}

function logNotification(input: {
  channel: "email" | "whatsapp";
  target: string;
  body: string;
  ticketId: number;
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
      "Pedir respuesta al cliente",
      input.body,
      input.ticketId,
      input.status,
      input.error ?? null
    );
  } catch (err) {
    console.error("[request-info] no se pudo registrar notificación:", err);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  const ticket = getTicketById(ticketId);
  if (!ticket) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = String(body?.kind ?? "") as TicketAwaitingKind;
  const note = String(body?.note ?? "").trim();
  if (!VALID_KINDS.includes(kind)) {
    return NextResponse.json(
      { error: "Tipo de solicitud inválido (info | file | answer)." },
      { status: 400 }
    );
  }

  const updated = setTicketAwaiting(ticketId, kind, note || null);
  const message = guidedMessage(ticket.folio, kind, note);
  const authorName = auth.displayName || auth.username;
  pauseSla(ticketId, {
    reason: "En espera de respuesta del cliente",
    createdBy: authorName,
  });
  const commentBody = note
    ? `Pedimos al cliente ${kindLabel(kind)}:\n${note}`
    : `Pedimos al cliente ${kindLabel(kind)}.`;

  // #1: queda como comentario en el chat del ticket.
  addComment({
    ticketId,
    authorType: "admin",
    authorName,
    body: commentBody,
    internal: false,
  });

  if (ticket.clientPhone) {
    const wa = sendWhatsApp(ticket.clientPhone, message, ticket.clientName ?? null);
    logNotification({
      channel: "whatsapp",
      target: wa.phone ?? ticket.clientPhone,
      body: message,
      ticketId,
      status: wa.ok ? "sent" : "failed",
      error: wa.ok ? null : wa.error ?? null,
    });
    if (!wa.ok) {
      console.error("[request-info] WhatsApp falló:", wa.error);
    }
  } else {
    logNotification({
      channel: "whatsapp",
      target: "(sin teléfono)",
      body: message,
      ticketId,
      status: "failed",
      error: "El cliente no tiene teléfono en su perfil.",
    });
  }

  if (ticket.clientEmail) {
    void sendEmail({
      to: ticket.clientEmail,
      subject: `Acción requerida en tu solicitud ${ticket.folio}`,
      html: `<p>Hola ${ticket.clientName ?? ""},</p><p>${message}</p><p>También puedes responder desde tu portal.</p>`,
    })
      .then((res) => {
        logNotification({
          channel: "email",
          target: ticket.clientEmail!,
          body: message,
          ticketId,
          status: res.ok ? (res.driver === "log" ? "logged" : "sent") : "failed",
          error: res.ok ? null : res.error,
        });
      })
      .catch(() => {});
  }

  broadcastTicketEvent({
    ticketId,
    portalUserId: ticket.portalUserId,
    folio: ticket.folio,
    actor: "admin",
    kind: "comment",
  });

  const fresh = getTicketById(ticketId);
  if (fresh) {
    fresh.comments = getTicketComments(ticketId, { includeInternal: true });
  }
  return NextResponse.json({ ticket: fresh ?? updated });
}
