import { NextRequest, NextResponse } from "next/server";
import {
  createPortalSession,
  registerPortalUser,
  setPortalCookie,
} from "@/lib/portal/auth";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(`portal-register:${ip}`, 10, 15 * 60_000)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const { name, email, phone, password } = body as Record<string, unknown>;
  const result = registerPortalUser({
    name: String(name ?? ""),
    email: String(email ?? ""),
    phone: phone != null ? String(phone) : null,
    password: String(password ?? ""),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const sessionId = createPortalSession(result.user.id);
  const response = NextResponse.json({ user: result.user }, { status: 201 });
  setPortalCookie(response, sessionId);
  return response;
}
