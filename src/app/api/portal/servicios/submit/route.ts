/**
 * POST /api/portal/servicios/submit
 *
 * Crea un ticket de Servicio ARC.
 *
 * Auth: requirePortalUser.
 * Rate limit: 10 requests/10 min por usuario.
 * Validación Zod estricta.
 * El precio se re-lee SIEMPRE del servidor (nunca del body).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isPortalAuthError, requirePortalUser } from "@/lib/portal/auth";
import {
  getPortalPriceListId,
  getDefaultPriceListId,
} from "@/lib/portal/services-catalog";
import { createServiceTicket } from "@/lib/portal/service-submit";
import { notifyTicketCreated } from "@/lib/notify/ticket-events";
import { publishAdminNotification } from "@/lib/admin-notifications";
import { broadcastTicketEvent } from "@/lib/ws-notify";
import { RateLimiter } from "@/lib/portal/rate-limiter";

export const dynamic = "force-dynamic";

// Rate limit: 10 solicitudes de servicio por usuario cada 10 minutos
const serviceSubmitLimiter = new RateLimiter({
  max: Number(process.env.SERVICE_SUBMIT_MAX ?? 10),
  windowMs: Number(process.env.SERVICE_SUBMIT_WINDOW_MS ?? 10 * 60 * 1000),
});

// ── Schema de validación ──────────────────────────────────────────────────────

const SubmitSchema = z.object({
  ticketTypeId: z.number().int().positive(),
  productId: z.number().int().positive(),
  qty: z.number().positive().nullable().optional(),
  descripcionNecesidad: z
    .string()
    .min(1, "La descripción es obligatoria.")
    .max(2000, "Descripción demasiado larga (máx. 2000 caracteres)."),
  preferenciaContacto: z
    .string()
    .min(1, "La preferencia de contacto es obligatoria.")
    .max(100),
  notasAdjuntos: z.string().max(1000).nullable().optional(),
});

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;

  // Rate limit
  if (!serviceSubmitLimiter.check(String(auth.id))) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Intenta más tarde." },
      { status: 429 }
    );
  }

  // Parsear body
  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const parsed = SubmitSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues ?? (parsed.error as unknown as { errors: typeof parsed.error.issues }).errors;
    const message = issues?.[0]?.message ?? "Datos inválidos.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const data = parsed.data;

  // Precio: siempre del servidor
  const defaultId = getDefaultPriceListId() ?? 0;
  const priceListId = getPortalPriceListId(defaultId);

  const result = createServiceTicket({
    ticketTypeId: data.ticketTypeId,
    portalUserId: auth.id, // ownership desde sesión, no del body
    productId: data.productId,
    qty: data.qty ?? null,
    descripcionNecesidad: data.descripcionNecesidad,
    preferenciaContacto: data.preferenciaContacto,
    notasAdjuntos: data.notasAdjuntos ?? null,
    priceListId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Notificación best-effort
  void notifyTicketCreated(result.ticket).catch((err) =>
    console.error("[portal/servicios] notifyTicketCreated:", err)
  );

  publishAdminNotification({
    kind: "servicio",
    title: "Nuevo servicio",
    body: `${auth.name} solicitó un servicio · ${result.ticket.folio}`,
    ticketId: result.ticket.id,
    folio: result.ticket.folio,
  });

  // Tiempo real: avisa al admin
  broadcastTicketEvent({
    ticketId: result.ticket.id,
    portalUserId: result.ticket.portalUserId,
    folio: result.ticket.folio,
    actor: "client",
    kind: "created",
    category: "servicio",
  });

  return NextResponse.json(
    {
      ticket: result.ticket,
      priceSnapshot: result.priceSnapshot,
    },
    { status: 201 }
  );
}
