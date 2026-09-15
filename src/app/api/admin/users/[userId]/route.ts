import { NextRequest, NextResponse } from "next/server";
import { getAdminUserById, updateAdminUser } from "@/lib/admin-settings";
import { destroyUserSessions, isAuthError, requireAdmin } from "@/lib/auth";
import type { UserRole } from "@/lib/admin-settings-types";
import { ROLE_LABELS } from "@/lib/admin-settings-types";
import { canManageRole } from "@/lib/permissions";
import { AdminUserUpdateSchema, parseBody } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { maskUsername } from "@/lib/audit-settings";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ userId: string }>;
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const { userId } = await params;
  const id = parseInt(userId, 10);

  if (isNaN(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const existing = getAdminUserById(id);
  if (!existing) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  if (!canManageRole(auth.role, existing.role)) {
    return NextResponse.json(
      { error: "No puedes editar este usuario" },
      { status: 403 }
    );
  }

  try {
    const rawBody = await req.json().catch(() => null);
    const parsed = parseBody(AdminUserUpdateSchema, rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { displayName, password, role, allowedLineIds } = parsed.data;

    if (role && !canManageRole(auth.role, role as UserRole)) {
      return NextResponse.json(
        { error: "No puedes asignar ese rol" },
        { status: 403 }
      );
    }

    const user = updateAdminUser(id, {
      displayName,
      role: role as UserRole | undefined,
      password,
      allowedLineIds,
    });

    const linesChanged =
      allowedLineIds !== undefined &&
      JSON.stringify([...allowedLineIds].sort()) !==
        JSON.stringify([...existing.allowedLineIds].sort());

    if (password || (role && role !== existing.role) || linesChanged) {
      destroyUserSessions(id);
    }

    const auditDetails: Record<string, unknown> = {
      targetUserId: id,
      displayName: user.displayName ?? "—",
      usernameMasked: maskUsername(existing.username),
    };
    if (
      displayName !== undefined &&
      String(displayName).trim() !== (existing.displayName ?? "")
    ) {
      auditDetails.displayNameFrom = existing.displayName ?? "—";
      auditDetails.displayNameTo = user.displayName ?? "—";
    }
    if (role && role !== existing.role) {
      auditDetails.roleFrom = ROLE_LABELS[existing.role];
      auditDetails.roleTo = ROLE_LABELS[role as UserRole];
    }
    if (password) {
      auditDetails.passwordChanged = true;
    }
    if (linesChanged && allowedLineIds) {
      auditDetails.allowedLineIds = allowedLineIds;
    }
    logAudit(auth.id, auth.username, "user.update", "user", id, auditDetails);

    return NextResponse.json(user);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al actualizar" },
      { status: 400 }
    );
  }
}
