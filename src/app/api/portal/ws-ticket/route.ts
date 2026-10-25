import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { isPortalAuthError, requirePortalUser } from "@/lib/portal/auth";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import { issueWsTicket } from "@/lib/ws-ticket-store";

export const dynamic = "force-dynamic";

const TICKET_TTL_MS = 30_000;

export async function GET(req: NextRequest) {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;

  const ip = getClientIp(req);
  if (isRateLimited(`portal-ws-ticket:${auth.id}:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  const token = randomBytes(32).toString("hex");
  issueWsTicket(token, Date.now() + TICKET_TTL_MS, auth.id);
  return NextResponse.json({ ticket: token });
}
