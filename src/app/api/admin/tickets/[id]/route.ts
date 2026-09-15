import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import {
  getTicketById,
  getTicketComments,
  softDeleteTicket,
} from "@/lib/portal/tickets";
import { broadcastTicketEvent } from "@/lib/ws-notify";
import { logAudit } from "@/lib/audit";

interface Ctx {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  const ticket = getTicketById(ticketId);
  if (!ticket) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  ticket.comments = getTicketComments(ticketId, { includeInternal: true });
  return NextResponse.json({ ticket });
}

/** Elimina (archiva) un ticket: lo mueve al submenú "Archivo". */
export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  const ticket = getTicketById(ticketId);
  if (!ticket) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const ok = softDeleteTicket(ticketId);
  if (ok) {
    logAudit(auth.id, auth.username, "ticket.archive", "ticket", ticketId, {
      folio: ticket.folio,
    });
    broadcastTicketEvent({
      ticketId,
      portalUserId: ticket.portalUserId,
      folio: ticket.folio,
      actor: "admin",
      kind: "status",
    });
  }
  return NextResponse.json({ archived: ok });
}
