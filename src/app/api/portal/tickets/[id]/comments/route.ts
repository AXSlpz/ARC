import { NextResponse } from "next/server";
import { isPortalAuthError, requirePortalUser } from "@/lib/portal/auth";
import { addComment, getTicketById, setTicketAwaiting } from "@/lib/portal/tickets";
import { broadcastTicketEvent } from "@/lib/ws-notify";

interface Ctx {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: Ctx) {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  const ticket = getTicketById(ticketId);
  if (!ticket || ticket.portalUserId !== auth.id) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const text = body && typeof body === "object" ? String((body as { body?: unknown }).body ?? "") : "";
  const comment = addComment({
    ticketId,
    authorType: "client",
    authorName: auth.name,
    body: text,
    internal: false,
  });
  if (!comment) {
    return NextResponse.json({ error: "Comentario vacío." }, { status: 400 });
  }

  // El cliente respondió: si el ticket esperaba info/respuesta, lo limpiamos.
  if (ticket.awaitingKind === "info" || ticket.awaitingKind === "answer") {
    setTicketAwaiting(ticketId, "none");
  }

  // Tiempo real: el admin recibe popup + refresco; el cliente no notifica por WA.
  broadcastTicketEvent({
    ticketId,
    portalUserId: ticket.portalUserId,
    folio: ticket.folio,
    actor: "client",
    kind: "comment",
  });

  return NextResponse.json({ comment }, { status: 201 });
}
