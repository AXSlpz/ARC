import { NextResponse } from "next/server";
import {
  clearAdminSignature,
  readAdminSignature,
  saveAdminSignature,
} from "@/lib/admin-profile";
import { isAuthError, requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const file = readAdminSignature(auth.id);
  if (!file) return NextResponse.json({ error: "Sin firma" }, { status: 404 });
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": "inline; filename=\"firma\"",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const ip = getClientIp(req);
  if (isRateLimited(`admin-signature:${auth.id}:${ip}`, 10, 15 * 60_000)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos." },
      { status: 429 }
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("signature");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Selecciona una imagen." }, { status: 400 });
  }
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    saveAdminSignature(auth.id, bytes);
    logAudit(auth.id, auth.username, "profile.signature", "admin_user", auth.id, {
      bytes: bytes.length,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo guardar la firma.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  try {
    clearAdminSignature(auth.id);
    logAudit(auth.id, auth.username, "profile.signature.clear", "admin_user", auth.id, {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo quitar la firma.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
