import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import { getTicketById } from "@/lib/portal/tickets";
import { generateAuthorizationLetter } from "@/lib/portal/authorization-letter";
import { broadcastTicketEvent } from "@/lib/ws-notify";
import { logAudit } from "@/lib/audit";

interface Ctx {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  const ticket = getTicketById(ticketId);
  if (!ticket) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const result = await generateAuthorizationLetter(ticketId, auth.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  logAudit(auth.id, auth.username, "ticket.letter", "ticket", ticketId, {
    folio: ticket.folio,
    filename: result.filename,
  });

  broadcastTicketEvent({
    ticketId,
    portalUserId: ticket.portalUserId,
    folio: ticket.folio,
    actor: "admin",
    kind: "letter",
  });

  return NextResponse.json({ document: result, ticket: getTicketById(ticketId) });
}
