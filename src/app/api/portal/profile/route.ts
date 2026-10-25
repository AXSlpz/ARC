import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isPortalAuthError,
  requirePortalUser,
  getPortalSessionId,
  updatePortalProfile,
} from "@/lib/portal/auth";

export const dynamic = "force-dynamic";

const UpdateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(30).nullable().optional(),
  currentPassword: z.string().optional(),
});

export async function GET() {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;
  return NextResponse.json({ user: auth });
}

export async function PUT(req: Request) {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;

  // Obtener el ID de sesión actual para preservarlo si se cambia el email
  const currentSessionId = await getPortalSessionId();

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const parsed = UpdateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos. Verifica los campos." }, { status: 422 });
  }

  const result = updatePortalProfile(auth.id, {
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone,
    currentPassword: parsed.data.currentPassword,
    currentSessionId: currentSessionId ?? undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ user: result.user });
}
