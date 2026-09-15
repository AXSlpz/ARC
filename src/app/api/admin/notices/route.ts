import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import { createAndSendAdminNotice } from "@/lib/portal/admin-notices";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }
  const { residenteId, templateId, extraNote } = body as Record<string, unknown>;
  const rid = Number(residenteId);
  const tid = Number(templateId);
  if (!Number.isInteger(rid) || rid <= 0) {
    return NextResponse.json({ error: "Residente inválido." }, { status: 400 });
  }
  if (!Number.isInteger(tid) || tid <= 0) {
    return NextResponse.json({ error: "Plantilla inválida." }, { status: 400 });
  }

  const result = await createAndSendAdminNotice({
    residenteId: rid,
    templateId: tid,
    extraNote: extraNote != null ? String(extraNote) : undefined,
    adminName: auth.displayName || auth.username,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ticket: result.ticket }, { status: 201 });
}
