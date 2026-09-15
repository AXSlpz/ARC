import { NextRequest, NextResponse } from "next/server";
import { createAdminUser, listAdminUsers } from "@/lib/admin-settings";
import { isAuthError, requireAdmin } from "@/lib/auth";
import type { UserRole } from "@/lib/admin-settings-types";
import { ROLE_LABELS } from "@/lib/admin-settings-types";
import { canManageRole } from "@/lib/permissions";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";
import { AdminUserCreateSchema, parseBody } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { maskUsername } from "@/lib/audit-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  return NextResponse.json(listAdminUsers());
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  if (isRateLimited(`ip:${getClientIp(req)}:admin-write`, 60, 60_000)) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  try {
    const rawBody = await req.json().catch(() => null);
    const parsed = parseBody(AdminUserCreateSchema, rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { username, password, displayName, role, allowedLineIds } = parsed.data;
    const targetRole = (role as UserRole | undefined) ?? "atencion";

    if (!canManageRole(auth.role, targetRole)) {
      return NextResponse.json(
        { error: "No puedes crear usuarios con ese rol" },
        { status: 403 }
      );
    }

    const user = createAdminUser({
      username,
      password,
      displayName,
      role: targetRole,
      allowedLineIds,
    });

    logAudit(auth.id, auth.username, "user.create", "user", user.id, {
      displayName: user.displayName ?? "—",
      role: ROLE_LABELS[user.role],
      usernameMasked: maskUsername(user.username),
    });

    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Error al crear usuario";
    const message = raw.includes("UNIQUE")
      ? "Ese nombre de usuario ya existe"
      : raw;
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
