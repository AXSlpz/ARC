import { NextRequest, NextResponse } from "next/server";
import {
  assertSameOrigin,
  clearSessionCookie,
  destroyUserSessions,
  isAuthError,
  requireAuth,
} from "@/lib/auth";
import {
  updateAdminUser,
  verifyAdminPassword,
} from "@/lib/admin-settings";
import { PasswordSchema, parseBody } from "@/lib/validation";
import { z } from "zod";

export const dynamic = "force-dynamic";

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: PasswordSchema,
});

export async function POST(req: NextRequest) {
  const originErr = assertSameOrigin(req);
  if (originErr) return originErr;

  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const rawBody = await req.json().catch(() => null);
  const parsed = parseBody(ChangePasswordSchema, rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  if (!verifyAdminPassword(auth.username, parsed.data.currentPassword)) {
    return NextResponse.json(
      { error: "Contraseña actual incorrecta" },
      { status: 401 }
    );
  }

  updateAdminUser(auth.id, { password: parsed.data.newPassword });
  destroyUserSessions(auth.id);

  const response = NextResponse.json({
    ok: true,
    message: "Contraseña actualizada. Vuelve a iniciar sesión.",
  });
  clearSessionCookie(response);
  return response;
}
