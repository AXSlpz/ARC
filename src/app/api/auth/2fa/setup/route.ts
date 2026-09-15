import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import {
  assertSameOrigin,
  getPendingAuth,
  getPendingIdFromCookies,
  getUserRowById,
} from "@/lib/auth";
import { setTotpTempSecret } from "@/lib/admin-settings";
import { buildOtpAuthUrl, generateTotpSecret } from "@/lib/totp";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const originErr = assertSameOrigin(req);
  if (originErr) return originErr;

  const ip = getClientIp(req);
  if (isRateLimited(`2fa-setup:${ip}`, 10, 15 * 60_000)) {
    return NextResponse.json({ error: "Demasiados intentos" }, { status: 429 });
  }

  const pendingId = await getPendingIdFromCookies();
  const pending = pendingId ? getPendingAuth(pendingId) : null;
  if (!pending || pending.kind !== "totp_setup") {
    return NextResponse.json(
      { error: "Debes iniciar sesión para configurar 2FA" },
      { status: 401 }
    );
  }

  const row = getUserRowById(pending.userId);
  if (!row) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const secret = generateTotpSecret();
  setTotpTempSecret(pending.userId, secret);

  const otpauth = buildOtpAuthUrl({
    secret,
    accountName: row.username,
    issuer: "AX Solutions ARC",
  });
  const qrDataUrl = await QRCode.toDataURL(otpauth, { margin: 1, width: 240 });

  return NextResponse.json({
    secret,
    otpauth,
    qrDataUrl,
  });
}
