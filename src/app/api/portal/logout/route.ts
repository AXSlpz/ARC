import { NextResponse } from "next/server";
import {
  clearPortalCookie,
  destroyPortalSession,
  getPortalSessionId,
} from "@/lib/portal/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const sessionId = await getPortalSessionId();
  if (sessionId) destroyPortalSession(sessionId);
  const response = NextResponse.json({ ok: true });
  clearPortalCookie(response);
  return response;
}
