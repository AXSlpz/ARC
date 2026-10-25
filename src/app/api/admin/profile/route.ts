import { NextResponse } from "next/server";
import { getAdminProfile, updateAdminProfile } from "@/lib/admin-profile";
import { isAuthError, requireAuth, revokeOtherSessions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const profile = getAdminProfile(auth.id);
  if (!profile) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ profile });
}

export async function PATCH(req: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const ip = getClientIp(req);
  if (isRateLimited(`admin-profile:${auth.id}:${ip}`, 20, 15 * 60_000)) {
    return NextResponse.json(
      { error: "Demasiados cambios. Espera unos minutos." },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => null)) as {
    displayName?: unknown;
    email?: unknown;
    jobTitle?: unknown;
    currentPassword?: unknown;
    newPassword?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  try {
    const profile = updateAdminProfile(auth.id, {
      displayName: typeof body.displayName === "string" ? body.displayName : "",
      email: typeof body.email === "string" ? body.email : "",
      jobTitle: typeof body.jobTitle === "string" ? body.jobTitle : "",
      currentPassword:
        typeof body.currentPassword === "string" ? body.currentPassword : "",
      newPassword: typeof body.newPassword === "string" ? body.newPassword : "",
    });
    if (typeof body.newPassword === "string" && body.newPassword.trim()) {
      await revokeOtherSessions(auth.id);
    }
    logAudit(auth.id, auth.username, "profile.update", "admin_user", auth.id, {
      passwordChanged: Boolean(
        typeof body.newPassword === "string" && body.newPassword.trim()
      ),
    });
    return NextResponse.json({ profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo guardar.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
