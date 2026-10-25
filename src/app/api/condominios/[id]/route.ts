import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import {
  getCondominio,
  updateCondominio,
  deleteCondominio,
} from "@/lib/residentes";
import { CondominioUpdateSchema, parseBody } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import {
  deleteCondominioDocuments,
} from "@/lib/documents";
import { deleteReglamentosIndex } from "@/lib/reglamentos";
import {
  getDevelopmentForCondominio,
  resolveDevelopmentAssignment,
  setCondominioDevelopment,
} from "@/lib/portal/catalog";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const numId = Number(id);
  if (!numId) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const existing = getCondominio(numId);
  if (!existing) {
    return NextResponse.json({ error: "Condominio no encontrado" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = parseBody(CondominioUpdateSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const { developmentId, newDevelopmentName, ...condoFields } = parsed.data;
    const updated = updateCondominio(numId, condoFields);
    if (!updated) {
      return NextResponse.json({ error: "Condominio no encontrado" }, { status: 404 });
    }

    if (developmentId !== undefined || newDevelopmentName !== undefined) {
      const resolved = resolveDevelopmentAssignment({
        developmentId: developmentId ?? null,
        newDevelopmentName,
      });
      setCondominioDevelopment(numId, resolved);
    }

    const development = getDevelopmentForCondominio(numId);

    logAudit(auth.id, auth.username, "condominio.update", "condominio", numId, {
      name: updated.name,
      prefijo: updated.prefijo,
      tipo: updated.tipo,
      fields: Object.keys(parsed.data),
      developmentId: development?.id ?? null,
    });

    return NextResponse.json({
      ...updated,
      development_id: development?.id ?? null,
      development_name: development?.name ?? null,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return NextResponse.json(
        { error: "Ya existe un condominio con ese nombre" },
        { status: 409 }
      );
    }
    if (
      err instanceof Error &&
      (err.message.includes("Desarrollo no encontrado") ||
        err.message.includes("Condominio no encontrado"))
    ) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Error al actualizar condominio" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const numId = Number(id);
  if (!numId) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const existing = getCondominio(numId);
  if (!existing) {
    return NextResponse.json({ error: "Condominio no encontrado" }, { status: 404 });
  }

  const ok = deleteCondominio(numId);
  if (!ok) {
    return NextResponse.json(
      { error: "No se puede eliminar: tiene residentes asignados" },
      { status: 409 }
    );
  }

  try {
    deleteCondominioDocuments(numId);
    deleteReglamentosIndex(numId);
  } catch (err) {
    console.warn(`[condominios] Limpieza de docs condo-${numId}:`, err);
  }

  logAudit(auth.id, auth.username, "condominio.delete", "condominio", numId, {
    name: existing.name,
  });

  return NextResponse.json({ ok: true });
}
