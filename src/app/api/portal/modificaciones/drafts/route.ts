/**
 * GET  /api/portal/modificaciones/drafts  → lista drafts del usuario
 * POST /api/portal/modificaciones/drafts  → crea draft
 */
import { NextRequest, NextResponse } from "next/server";
import { isPortalAuthError, requirePortalUser } from "@/lib/portal/auth";
import {
  listDraftsForUser,
  createDraft,
} from "@/lib/portal/modification-drafts";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;

  const drafts = listDraftsForUser(auth.id);
  return NextResponse.json({ drafts });
}

export async function POST(req: NextRequest) {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const { modificationCatalogId, step, data } = body as {
    modificationCatalogId?: unknown;
    step?: unknown;
    data?: unknown;
  };

  const result = createDraft({
    portalUserId: auth.id,
    modificationCatalogId:
      typeof modificationCatalogId === "number" ? modificationCatalogId : null,
    step: typeof step === "number" ? step : 0,
    data:
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {},
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ draft: result.draft }, { status: 201 });
}
