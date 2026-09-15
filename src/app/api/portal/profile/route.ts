import { NextResponse } from "next/server";
import {
  isPortalAuthError,
  requirePortalUser,
  updatePortalProfile,
} from "@/lib/portal/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;
  return NextResponse.json({ user: auth });
}

export async function PUT(req: Request) {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const result = updatePortalProfile(auth.id, {
    name: b.name != null ? String(b.name) : undefined,
    email: b.email != null ? String(b.email) : undefined,
    phone: b.phone !== undefined ? (b.phone != null ? String(b.phone) : null) : undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ user: result.user });
}
