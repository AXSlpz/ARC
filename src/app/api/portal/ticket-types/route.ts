import { NextResponse } from "next/server";
import { isPortalAuthError, requirePortalUser } from "@/lib/portal/auth";
import { listTicketTypes } from "@/lib/portal/ticket-types";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;
  return NextResponse.json({ types: listTicketTypes({ activeOnly: true }) });
}
