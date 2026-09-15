import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import {
  getResidente,
  updateResidente,
  deactivateResidente,
  reactivateResidente,
} from "@/lib/residentes";
import { ResidenteUpdateSchema, parseBody } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const residente = getResidente(Number(id));
  if (!residente) {
    return NextResponse.json({ error: "Residente no encontrado" }, { status: 404 });
  }
  return NextResponse.json(residente);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const numId = Number(id);

  const body = await req.json();

  if (body.reactivate === true) {
    const ok = reactivateResidente(numId);
    if (!ok) {
      return NextResponse.json({ error: "Residente no encontrado" }, { status: 404 });
    }
    logAudit(auth.id, auth.username, "residente.reactivate", "residente", numId);
    return NextResponse.json(getResidente(numId));
  }

  const parsed = parseBody(ResidenteUpdateSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const updated = updateResidente(numId, parsed.data);
  if (!updated) {
    return NextResponse.json({ error: "Residente no encontrado" }, { status: 404 });
  }

  logAudit(auth.id, auth.username, "residente.update", "residente", numId, {
    nombre: updated.nombre,
    fields: Object.keys(parsed.data),
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const numId = Number(id);

  const existing = getResidente(numId);
  if (!existing) {
    return NextResponse.json({ error: "Residente no encontrado" }, { status: 404 });
  }

  deactivateResidente(numId);
  logAudit(auth.id, auth.username, "residente.vacate", "residente", numId, {
    nombre: existing.nombre,
    condominio: existing.condominio_name,
  });

  return NextResponse.json(getResidente(numId));
}
