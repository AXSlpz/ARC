import { NextResponse } from "next/server";
import {
  changePortalPassword,
  isPortalAuthError,
  requirePortalUser,
} from "@/lib/portal/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const result = changePortalPassword(
    auth.id,
    String(b.currentPassword ?? ""),
    String(b.newPassword ?? "")
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
