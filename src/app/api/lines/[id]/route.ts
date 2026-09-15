import { NextRequest, NextResponse } from "next/server";
import { getWaLine, updateWaLineName } from "@/lib/db";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { LineNameSchema, parseBody } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

interface Ctx {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const lineId = parseInt(id, 10);
  if (lineId !== 1) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const line = getWaLine(lineId);
  if (!line) {
    return NextResponse.json({ error: "Línea no encontrada" }, { status: 404 });
  }

  const rawBody = await req.json().catch(() => null);
  const parsed = parseBody(LineNameSchema, rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const previousName = line.name;
  updateWaLineName(lineId, parsed.data.name);
  const updated = getWaLine(lineId);

  logAudit(auth.id, auth.username, "line.rename", "wa_line", lineId, {
    lineId,
    lineName: updated!.name,
    previousName,
    newName: parsed.data.name,
  });

  return NextResponse.json({
    id: updated!.id,
    name: updated!.name,
    status: updated!.status,
    phone: updated!.phone,
    updatedAt: updated!.updated_at,
  });
}
