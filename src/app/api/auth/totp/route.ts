import { NextRequest, NextResponse } from "next/server";
import {
  assertSameOrigin,
  clearPendingCookie,
  createSession,
  destroyPendingAuth,
  getPendingAuth,
  getPendingIdFromCookies,
  getUserRowById,
  setSessionCookie,
} from "@/lib/auth";
import { getTotpSecrets } from "@/lib/admin-settings";
import { verifyTotpCode } from "@/lib/totp";
import { normalizeUserRole } from "@/lib/permissions";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import { z } from "zod";
import { parseBody } from "@/lib/validation";

export const dynamic = "force-dynamic";

const TotpSchema = z.object({
  code: z.string().min(6).max(12),
});

export async function POST(req: NextRequest) {
  const originErr = assertSameOrigin(req);
  if (originErr) return originErr;

  const ip = getClientIp(req);
  if (isRateLimited(`totp:${ip}`, 20, 15 * 60_000)) {
    return NextResponse.json(
      { error: "Demasiados intentos de código. Espera unos minutos." },
      { status: 429 }
    );
  }

  const pendingId = await getPendingIdFromCookies();
  const pending = pendingId ? getPendingAuth(pendingId) : null;
  if (!pending || pending.kind !== "totp_verify") {
    return NextResponse.json({ error: "Sesión 2FA inválida o expirada" }, { status: 401 });
  }

  const rawBody = await req.json().catch(() => null);
  const parsed = parseBody(TotpSchema, rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const secrets = getTotpSecrets(pending.userId);
  if (!secrets.enabled || !secrets.secret) {
    return NextResponse.json({ error: "2FA no configurado" }, { status: 400 });
  }

  if (!verifyTotpCode(secrets.secret, parsed.data.code)) {
    return NextResponse.json({ error: "Código incorrecto" }, { status: 401 });
  }

  destroyPendingAuth(pendingId!);
  const sessionId = createSession(pending.userId);
  const row = getUserRowById(pending.userId);
  if (!row) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 500 });
  }

  const response = NextResponse.json({
    user: {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      role: normalizeUserRole(row.role),
      totpEnabled: true,
    },
  });
  clearPendingCookie(response);
  setSessionCookie(response, sessionId);
  return response;
}
