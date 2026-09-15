import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import { getTicketById, restoreTicket } from "@/lib/portal/tickets";
import { logAudit } from "@/lib/audit";

interface Ctx {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

/** Restaura un ticket archivado (lo saca del submenú "Archivo"). */
export async function POST(_req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  const ticket = getTicketById(ticketId);
  if (!ticket) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const ok = restoreTicket(ticketId);
  if (ok) {
    logAudit(auth.id, auth.username, "ticket.restore", "ticket", ticketId, {
      folio: ticket.folio,
    });
  }
  return NextResponse.json({ restored: ok });
}
