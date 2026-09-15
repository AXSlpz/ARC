import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import {
  deletePrototipo,
  getPrototipo,
  updatePrototipo,
} from "@/lib/prototipos";
import { parseBody, PrototipoUpdateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function parseId(id: string): number | null {
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) return null;
  return numId;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const id = parseId((await params).id);
  if (!id) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  if (!getPrototipo(id)) {
    return NextResponse.json({ error: "Prototipo no encontrado" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = parseBody(PrototipoUpdateSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const updated = updatePrototipo(id, parsed.data);
    logAudit(auth.id, auth.username, "prototipo.update", "prototipo", id, parsed.data);
    return NextResponse.json({ success: true, data: updated, error: null });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al actualizar" },
      { status: 400 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const id = parseId((await params).id);
  if (!id) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  const existing = getPrototipo(id);
  if (!existing) {
    return NextResponse.json({ error: "Prototipo no encontrado" }, { status: 404 });
  }

  const result = deletePrototipo(id);
  logAudit(auth.id, auth.username, "prototipo.delete", "prototipo", id, result);
  return NextResponse.json({
    success: true,
    data: result,
    error: null,
  });
}
