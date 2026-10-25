/**
 * GET    /api/portal/modificaciones/drafts/[id]  → obtiene draft (ownership check)
 * PUT    /api/portal/modificaciones/drafts/[id]  → actualiza draft
 * DELETE /api/portal/modificaciones/drafts/[id]  → elimina draft
 */
import { NextRequest, NextResponse } from "next/server";
import { isPortalAuthError, requirePortalUser } from "@/lib/portal/auth";
import {
  getDraft,
  updateDraft,
  deleteDraft,
} from "@/lib/portal/modification-drafts";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const draft = getDraft(id, auth.id);
  if (!draft) {
    return NextResponse.json({ error: "Draft no encontrado." }, { status: 404 });
  }
  return NextResponse.json({ draft });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const { modificationCatalogId, step, data } = body as {
    modificationCatalogId?: unknown;
    step?: unknown;
    data?: unknown;
  };

  const result = updateDraft({
    id,
    portalUserId: auth.id,
    modificationCatalogId:
      typeof modificationCatalogId === "number" ? modificationCatalogId : undefined,
    step: typeof step === "number" ? step : undefined,
    data:
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error.includes("acceso") ? 403 : 400 }
    );
  }

  return NextResponse.json({ draft: result.draft });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const deleted = deleteDraft(id, auth.id);
  if (!deleted) {
    return NextResponse.json({ error: "Draft no encontrado." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
