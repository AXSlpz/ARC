import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import { addComment, getTicketById } from "@/lib/portal/tickets";
import { sendEmail } from "@/lib/notify/email";
import { sendWhatsApp } from "@/lib/notify/whatsapp";
import { broadcastTicketEvent } from "@/lib/ws-notify";

interface Ctx {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  const ticket = getTicketById(ticketId);
  if (!ticket) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const text = body && typeof body === "object" ? String((body as { body?: unknown }).body ?? "") : "";
  const internal = body && typeof body === "object" ? Boolean((body as { internal?: unknown }).internal) : false;

  const comment = addComment({
    ticketId,
    authorType: "admin",
    authorName: auth.displayName ?? auth.username,
    body: text,
    internal,
  });
  if (!comment) {
    return NextResponse.json({ error: "Comentario vacío." }, { status: 400 });
  }

  // Solo notificamos al cliente si el comentario es público.
  if (!internal) {
    const subject = `Nuevo comentario en tu solicitud ${ticket.folio}`;
    const html = `<p>Hola ${ticket.clientName ?? ""},</p><p>Tienes un nuevo comentario en tu solicitud <strong>${ticket.folio}</strong>:</p><blockquote>${text}</blockquote>`;
    if (ticket.clientEmail) {
      void sendEmail({ to: ticket.clientEmail, subject, html }).catch(() => {});
    }
    if (ticket.clientPhone) {
      // Mensaje breve: solo avisa que hay un nuevo comentario.
      sendWhatsApp(
        ticket.clientPhone,
        `ARC · ${ticket.folio}: nuevo comentario de la administración. Revísalo en tu portal.`,
        ticket.clientName ?? null
      );
    }
    // Tiempo real: refresca el portal del cliente.
    broadcastTicketEvent({
      ticketId,
      portalUserId: ticket.portalUserId,
      folio: ticket.folio,
      actor: "admin",
      kind: "comment",
    });
  }

  return NextResponse.json({ comment }, { status: 201 });
}
