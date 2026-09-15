import { NextResponse } from "next/server";
import { isPortalAuthError, requirePortalUser } from "@/lib/portal/auth";
import { getTicketById, getTicketComments } from "@/lib/portal/tickets";

interface Ctx {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  if (!Number.isInteger(ticketId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const ticket = getTicketById(ticketId);
  if (!ticket || ticket.portalUserId !== auth.id) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  ticket.comments = getTicketComments(ticketId, { includeInternal: false });
  return NextResponse.json({ ticket });
}
