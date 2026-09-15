import { NextRequest, NextResponse } from "next/server";
import {
  createPortalSession,
  setPortalCookie,
  verifyPortalCredentials,
} from "@/lib/portal/auth";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(`portal-login:${ip}`, 30, 15 * 60_000)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const { email, password } = body as Record<string, unknown>;
  const user = verifyPortalCredentials(String(email ?? ""), String(password ?? ""));
  if (!user) {
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 400));
    return NextResponse.json(
      { error: "Correo o contraseña incorrectos." },
      { status: 401 }
    );
  }

  const sessionId = createPortalSession(user.id);
  const response = NextResponse.json({ user });
  setPortalCookie(response, sessionId);
  return response;
}
