import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import { hardDeleteTicket } from "@/lib/portal/tickets";
import { logAudit } from "@/lib/audit";

interface Ctx {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

/** Elimina definitivamente un ticket archivado. Acción irreversible. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  if (!Number.isInteger(ticketId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const result = await hardDeleteTicket(ticketId);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  logAudit(auth.id, auth.username, "ticket.hard_delete", "ticket", ticketId, {
    folio: result.folio,
  });

  return NextResponse.json({ deleted: true });
}
