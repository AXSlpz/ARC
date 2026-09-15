import { NextRequest, NextResponse } from "next/server";
import {
  assertSameOrigin,
  clearLoginAttempts,
  createPendingAuth,
  getUserByCredentials,
  isLoginRateLimited,
  recordFailedLogin,
  setPendingCookie,
} from "@/lib/auth";
import { LoginSchema, parseBody } from "@/lib/validation";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function getLoginIp(req: NextRequest): string | null {
  const ip = getClientIp(req);
  return ip === "local" ? null : ip;
}

export async function POST(req: NextRequest) {
  const originErr = assertSameOrigin(req);
  if (originErr) return originErr;

  try {
    const ip = getLoginIp(req);
    if (isRateLimited(`login:${ip ?? "unknown"}`, 40, 15 * 60_000)) {
      return NextResponse.json(
        { error: "Demasiados intentos. Espera unos minutos." },
        { status: 429 }
      );
    }

    const rawBody = await req.json().catch(() => null);
    const parsed = parseBody(LoginSchema, rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { username, password } = parsed.data;

    if (isLoginRateLimited(username, ip)) {
      return NextResponse.json(
        {
          error:
            "Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.",
        },
        { status: 429 }
      );
    }

    const user = getUserByCredentials(username, password);

    if (!user) {
      recordFailedLogin(username, ip);
      await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));
      return NextResponse.json(
        { error: "Usuario o contraseña incorrectos" },
        { status: 401 }
      );
    }

    clearLoginAttempts(username);

    const kind = user.totpEnabled ? "totp_verify" : "totp_setup";
    const pendingId = createPendingAuth(user.id, kind);
    const response = NextResponse.json({
      requiresTotp: user.totpEnabled,
      requiresTotpSetup: !user.totpEnabled,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    });
    setPendingCookie(response, pendingId);
    return response;
  } catch {
    return NextResponse.json({ error: "Error al iniciar sesión" }, { status: 500 });
  }
}
