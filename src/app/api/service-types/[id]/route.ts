import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import {
  deleteServiceType,
  getServiceType,
  updateServiceType,
} from "@/lib/service-schedules";
import { parseBody, ServiceTypeUpdateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  if (!getServiceType(id)) {
    return NextResponse.json({ error: "Tipo no encontrado" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = parseBody(ServiceTypeUpdateSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const updated = updateServiceType(id, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: "Tipo no encontrado" }, { status: 404 });
    }
    logAudit(auth.id, auth.username, "service_type.update", "service_type", id, {
      fields: Object.keys(parsed.data),
      name: updated.name,
    });
    return NextResponse.json(updated);
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

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const existing = getServiceType(id);
  if (!existing) {
    return NextResponse.json({ error: "Tipo no encontrado" }, { status: 404 });
  }

  const result = deleteServiceType(id);
  if (!result.ok) {
    return NextResponse.json({ error: "Tipo no encontrado" }, { status: 404 });
  }

  logAudit(auth.id, auth.username, "service_type.delete", "service_type", id, {
    name: existing.name,
    mode: result.mode,
  });

  return NextResponse.json({ ok: true, mode: result.mode });
}
