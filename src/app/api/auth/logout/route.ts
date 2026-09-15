import { NextResponse } from "next/server";
import {
  clearSessionCookie,
  destroySession,
  getSessionId,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const sessionId = await getSessionId();
  if (sessionId) destroySession(sessionId);

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
