/**
 * GET /api/portal/me
 * Retorna el usuario autenticado + su claim activo (si tiene uno).
 * El claim solo expone datos del propio usuario (no PII ajena).
 */
import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/portal/auth";
import { getUserActiveClaim } from "@/lib/portal/registration-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getPortalUser();
  if (!user) {
    return NextResponse.json({ user: null, claim: null }, { status: 200 });
  }

  // Incluir claim activo (pending/conflict) para que el cliente
  // pueda mostrar el banner sin una petición extra.
  const claim = getUserActiveClaim(user.id);

  // Solo exponer campos necesarios del claim (sin datos de otros usuarios).
  const claimSummary = claim
    ? {
        id: claim.id,
        status: claim.status,
        developmentId: claim.developmentId,
        propertyIdentifier: claim.propertyIdentifier,
        createdAt: claim.createdAt,
      }
    : null;

  return NextResponse.json({ user, claim: claimSummary });
}
