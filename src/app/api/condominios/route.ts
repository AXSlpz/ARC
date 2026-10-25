import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import {
  listCondominios,
  listCondominiosPaginated,
  createCondominio,
  deleteCondominio,
  getCondominioStats,
} from "@/lib/residentes";
import { CondominioSchema, parseBody } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { countDocuments, deleteCondominioDocuments } from "@/lib/documents";
import { deleteReglamentosIndex } from "@/lib/reglamentos";
import { countSchedulesForCondominio } from "@/lib/service-schedules";
import {
  listPublicDevelopments,
  getDevelopmentForCondominio,
  mapDevelopmentsByCondominioIds,
  resolveDevelopmentAssignment,
  setCondominioDevelopment,
} from "@/lib/portal/catalog";

export const dynamic = "force-dynamic";

function withCounts<T extends { id: number }>(
  items: T[]
): (T & { document_count: number; schedule_count: number })[] {
  return items.map((item) => ({
    ...item,
    document_count: countDocuments(item.id),
    schedule_count: countSchedulesForCondominio(item.id),
  }));
}

function withPortalDevelopment<T extends { id: number }>(
  items: T[]
): (T & { development_id: number | null; development_name: string | null })[] {
  const map = mapDevelopmentsByCondominioIds(items.map((item) => item.id));
  return items.map((item) => {
    const development = map.get(item.id) ?? null;
    return {
      ...item,
      development_id: development?.id ?? null,
      development_name: development?.name ?? null,
    };
  });
}

function applyDevelopmentLink(
  condominioId: number,
  developmentId: number | null | undefined,
  newDevelopmentName?: string | null
): void {
  if (developmentId === undefined && !newDevelopmentName?.trim()) return;
  const resolved = resolveDevelopmentAssignment({
    developmentId: developmentId ?? null,
    newDevelopmentName,
  });
  setCondominioDevelopment(condominioId, resolved);
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const url = new URL(req.url);
  if (url.searchParams.get("stats") === "1") {
    return NextResponse.json(getCondominioStats());
  }

  const hasPagination =
    url.searchParams.has("page") ||
    url.searchParams.has("limit") ||
    Boolean(url.searchParams.get("search")?.trim());

  if (hasPagination) {
    const result = listCondominiosPaginated({
      search: url.searchParams.get("search") ?? undefined,
      page: Math.max(1, Number(url.searchParams.get("page") ?? 1)),
      limit: Math.min(
        200,
        Math.max(1, Number(url.searchParams.get("limit") ?? 50))
      ),
    });
    return NextResponse.json({
      ...result,
      data: withPortalDevelopment(withCounts(result.data)),
      portalDevelopments: listPublicDevelopments(),
    });
  }

  return NextResponse.json(withPortalDevelopment(withCounts(listCondominios())));
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const body = await req.json();
  const parsed = parseBody(CondominioSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const { developmentId, newDevelopmentName, ...condoInput } = parsed.data;
    const condominio = createCondominio(condoInput);
    try {
      applyDevelopmentLink(condominio.id, developmentId, newDevelopmentName);
    } catch (linkErr) {
      const msg = linkErr instanceof Error ? linkErr.message : "Error al vincular desarrollo";
      return NextResponse.json(
        {
          ...condominio,
          development_id: null,
          development_name: null,
          warning: msg,
        },
        { status: 201 }
      );
    }
    const development = getDevelopmentForCondominio(condominio.id);
    logAudit(auth.id, auth.username, "condominio.create", "condominio", condominio.id, {
      name: condominio.name,
      prefijo: condominio.prefijo,
      tipo: condominio.tipo,
      estatus: condominio.estatus,
      documentacion_indexada: condominio.documentacion_indexada,
      tags: condominio.tags,
      estados_cuenta: condominio.estados_cuenta,
      developmentId: development?.id ?? null,
    });
    return NextResponse.json(
      {
        ...condominio,
        development_id: development?.id ?? null,
        development_name: development?.name ?? null,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return NextResponse.json(
        { error: "Ya existe un condominio con ese nombre" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Error al crear condominio" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  }

  const ok = deleteCondominio(id);
  if (!ok) {
    return NextResponse.json(
      { error: "No se puede eliminar: tiene residentes asignados" },
      { status: 409 }
    );
  }

  try {
    deleteCondominioDocuments(id);
    deleteReglamentosIndex(id);
  } catch {}

  logAudit(auth.id, auth.username, "condominio.delete", "condominio", id);
  return NextResponse.json({ ok: true });
}
