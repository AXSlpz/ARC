import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { generateResolutionLetter } from "@/lib/portal/authorization-letter";
import { applyResolution, isResolutionDecision } from "@/lib/portal/resolution";
import { getTicketById } from "@/lib/portal/tickets";
import { notifyStatusChanged } from "@/lib/notify/ticket-events";
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
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return NextResponse.json({ error: "Identificador inválido." }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as {
    decision?: unknown;
    note?: unknown;
  } | null;
  const decision = String(body?.decision ?? "");
  if (!isResolutionDecision(decision)) {
    return NextResponse.json({ error: "Decisión inválida." }, { status: 400 });
  }
  const note = body?.note == null ? "" : String(body.note).slice(0, 2000);

  const applied = applyResolution({
    ticketId,
    decision,
    note,
    changedBy: auth.username,
  });
  if (!applied.ok) {
    const status = applied.error === "No encontrado" ? 404 : 400;
    return NextResponse.json({ error: applied.error }, { status });
  }

  logAudit(auth.id, auth.username, "ticket.resolution", "ticket", ticketId, {
    decision,
  });

  let letterGenerated = false;
  let letterError: string | null = null;
  if (decision !== "requiere_correcciones") {
    const letter = await generateResolutionLetter(ticketId);
    letterGenerated = "filename" in letter;
    if (!letterGenerated) letterError = (letter as { error: string }).error;
  }

  const ticket = getTicketById(ticketId);
  if (ticket) {
    void notifyStatusChanged(ticket, ticket.status, note || null).catch((err) => {
      console.error("[resolution] aviso no enviado:", err);
    });
    broadcastTicketEvent({
      ticketId,
      portalUserId: ticket.portalUserId,
      folio: ticket.folio,
      actor: "admin",
      kind: "status",
      toStatus: ticket.status,
    });
  }

  return NextResponse.json({
    ticket,
    letterGenerated,
    letterError,
    hash: applied.hash,
  });
}
