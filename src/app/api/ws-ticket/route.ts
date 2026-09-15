import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { isAuthError, requireAuth } from "@/lib/auth";
import { issueWsTicket } from "@/lib/ws-ticket-store";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const TICKET_TTL_MS = 30_000;

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const ip = getClientIp(req);
  if (isRateLimited(`ws-ticket:${auth.id}:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  const token = randomBytes(32).toString("hex");
  issueWsTicket(token, Date.now() + TICKET_TTL_MS);
  return NextResponse.json({ ticket: token });
}
