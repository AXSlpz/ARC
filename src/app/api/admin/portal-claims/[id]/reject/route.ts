/**
 * POST /api/admin/portal-claims/[id]/reject
 * Rechaza un claim de propiedad con razón obligatoria.
 *
 * Body: { reason: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { rejectClaim } from "@/lib/portal/registration-admin";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const claimId = parseInt(id, 10);
  if (isNaN(claimId) || claimId <= 0) {
    return NextResponse.json({ error: "ID de reclamo inválido." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const reason =
    body && typeof body === "object" && typeof body.reason === "string"
      ? body.reason
      : "";

  const result = rejectClaim(claimId, auth.displayName ?? auth.username, reason);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ claim: result.claim });
}
