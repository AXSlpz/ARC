import { NextRequest, NextResponse } from "next/server";
import {
  assertSameOrigin,
  clearPendingCookie,
  createSession,
  destroyPendingAuth,
  destroyUserSessions,
  getPendingAuth,
  getPendingIdFromCookies,
  getUserRowById,
  setSessionCookie,
} from "@/lib/auth";
import {
  clearTotpTempSecret,
  enableTotpForUser,
  getTotpSecrets,
} from "@/lib/admin-settings";
import { verifyTotpCode } from "@/lib/totp";
import { normalizeUserRole } from "@/lib/permissions";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import { z } from "zod";
import { parseBody } from "@/lib/validation";

export const dynamic = "force-dynamic";

const ConfirmSchema = z.object({
  code: z.string().min(6).max(12),
});

export async function POST(req: NextRequest) {
  const originErr = assertSameOrigin(req);
  if (originErr) return originErr;

  const ip = getClientIp(req);
  if (isRateLimited(`2fa-confirm:${ip}`, 20, 15 * 60_000)) {
    return NextResponse.json({ error: "Demasiados intentos" }, { status: 429 });
  }

  const pendingId = await getPendingIdFromCookies();
  const pending = pendingId ? getPendingAuth(pendingId) : null;
  if (!pending || pending.kind !== "totp_setup") {
    return NextResponse.json(
      { error: "Sesión de configuración 2FA inválida o expirada" },
      { status: 401 }
    );
  }

  const rawBody = await req.json().catch(() => null);
  const parsed = parseBody(ConfirmSchema, rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const secrets = getTotpSecrets(pending.userId);
  const temp = secrets.tempSecret;
  if (!temp) {
    return NextResponse.json(
      { error: "Primero genera el código QR de 2FA" },
      { status: 400 }
    );
  }

  if (!verifyTotpCode(temp, parsed.data.code)) {
    return NextResponse.json({ error: "Código incorrecto" }, { status: 401 });
  }

  enableTotpForUser(pending.userId, temp);
  clearTotpTempSecret(pending.userId);
  destroyUserSessions(pending.userId);
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
