import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { isPortalAuthError, requirePortalUser } from "@/lib/portal/auth";
import { issueWsTicket } from "@/lib/ws-ticket-store";

export const dynamic = "force-dynamic";

const TICKET_TTL_MS = 30_000;

export async function GET() {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;

  const token = randomBytes(32).toString("hex");
  issueWsTicket(token, Date.now() + TICKET_TTL_MS);
  return NextResponse.json({ ticket: token });
}
