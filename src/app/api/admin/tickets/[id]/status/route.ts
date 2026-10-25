import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import { changeStatus, getTicketById } from "@/lib/portal/tickets";
import { generateAuthorizationLetter } from "@/lib/portal/authorization-letter";
import {
  notifyStatusChanged,
  notifyTicketAuthorized,
} from "@/lib/notify/ticket-events";
import { TICKET_STATUSES } from "@/lib/portal/types";
import type { TicketStatus } from "@/lib/portal/types";
import { broadcastTicketEvent } from "@/lib/ws-notify";
import { logAudit } from "@/lib/audit";

interface Ctx {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  const body = await req.json().catch(() => null);
  const toStatus = body && typeof body === "object" ? String((body as { status?: unknown }).status ?? "") : "";
  const note =
    body && typeof body === "object" && (body as { note?: unknown }).note != null
      ? String((body as { note?: unknown }).note)
      : null;

  if (!(TICKET_STATUSES as string[]).includes(toStatus)) {
    return NextResponse.json({ error: "Estatus inválido." }, { status: 400 });
  }

  const existing = getTicketById(ticketId);
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const ticket = changeStatus({
    ticketId,
    toStatus: toStatus as TicketStatus,
    changedBy: auth.username,
    note,
  });
  if (!ticket) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  logAudit(auth.id, auth.username, "ticket.status", "ticket", ticketId, {
    folio: ticket.folio,
    toStatus,
  });

  let letterGenerated = false;
  let letterError: string | null = null;
  if (toStatus === "autorizado") {
    const result = await generateAuthorizationLetter(ticketId, auth.id);
    letterGenerated = "filename" in result;
    if (!letterGenerated) {
      letterError = (result as { error: string }).error;
      console.error("[tickets] carta:", letterError);
    }
    if (existing.status !== "autorizado") {
      void notifyTicketAuthorized(ticket, letterGenerated).catch((e) =>
        console.error("[tickets] notifyAuthorized:", e)
      );
    }
  } else {
    void notifyStatusChanged(ticket, toStatus as TicketStatus, note).catch((e) =>
      console.error("[tickets] notifyStatus:", e)
    );
  }

  broadcastTicketEvent({
    ticketId,
    portalUserId: ticket.portalUserId,
    folio: ticket.folio,
    actor: "admin",
    kind: "status",
    toStatus,
  });

  const fresh = getTicketById(ticketId);
  return NextResponse.json({ ticket: fresh, letterGenerated, letterError });
}
