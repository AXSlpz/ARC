import { NextRequest, NextResponse } from "next/server";
import { isPortalAuthError, requirePortalUser } from "@/lib/portal/auth";
import { createTicket, listTicketsForUser } from "@/lib/portal/tickets";
import { notifyTicketCreated } from "@/lib/notify/ticket-events";
import { broadcastTicketEvent } from "@/lib/ws-notify";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;
  return NextResponse.json({ tickets: listTicketsForUser(auth.id) });
}

export async function POST(req: NextRequest) {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const { ticketTypeId, values } = body as {
    ticketTypeId?: unknown;
    values?: unknown;
  };
  const typeId = Number(ticketTypeId);
  if (!Number.isInteger(typeId) || typeId <= 0) {
    return NextResponse.json({ error: "Tipo de solicitud inválido." }, { status: 400 });
  }

  const normalizedValues = Array.isArray(values)
    ? values
        .filter((v): v is { fieldKey: string; value: unknown } =>
          Boolean(v) && typeof (v as { fieldKey?: unknown }).fieldKey === "string"
        )
        .map((v) => ({
          fieldKey: v.fieldKey,
          value: v.value != null ? String(v.value) : null,
        }))
    : [];

  const result = createTicket({
    ticketTypeId: typeId,
    portalUserId: auth.id,
    values: normalizedValues,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Notificación best-effort (no bloquea la respuesta si falla).
  void notifyTicketCreated(result.ticket).catch((err) =>
    console.error("[portal] notifyTicketCreated:", err)
  );

  // Tiempo real: avisa al admin que hay una solicitud nueva.
  broadcastTicketEvent({
    ticketId: result.ticket.id,
    portalUserId: result.ticket.portalUserId,
    folio: result.ticket.folio,
    actor: "client",
    kind: "created",
  });

  return NextResponse.json({ ticket: result.ticket }, { status: 201 });
}
