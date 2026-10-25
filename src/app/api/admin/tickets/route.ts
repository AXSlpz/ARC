import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import { listTicketsAdmin } from "@/lib/portal/tickets";
import { TICKET_STATUSES } from "@/lib/portal/types";
import type { TicketStatus } from "@/lib/portal/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const typeParam = url.searchParams.get("ticketTypeId");
  const search = url.searchParams.get("search") ?? undefined;
  const archived = url.searchParams.get("archived") === "1";
  const developmentId = Number(url.searchParams.get("developmentId") ?? "");
  const modificationCatalogId = Number(url.searchParams.get("modificationCatalogId") ?? "");
  const numVivienda = (url.searchParams.get("vivienda") ?? "").replace(/\D/g, "").slice(0, 6);
  const overdue = url.searchParams.get("vencidos") === "1";

  const status =
    statusParam && (TICKET_STATUSES as string[]).includes(statusParam)
      ? (statusParam as TicketStatus)
      : undefined;
  const ticketTypeId = typeParam ? Number(typeParam) : undefined;

  return NextResponse.json({
    tickets: listTicketsAdmin({
      status,
      ticketTypeId: Number.isInteger(ticketTypeId) ? ticketTypeId : undefined,
      search: search || undefined,
      archived,
      developmentId: Number.isInteger(developmentId) && developmentId > 0 ? developmentId : undefined,
      modificationCatalogId:
        Number.isInteger(modificationCatalogId) && modificationCatalogId > 0
          ? modificationCatalogId
          : undefined,
      numVivienda: numVivienda || undefined,
      overdue,
    }),
  });
}
