/**
 * POST /api/admin/portal-claims/[id]/approve
 * Aprueba un claim de propiedad.
 *
 * Efectos:
 *   1. Marca claim como 'approved'.
 *   2. Guarda snapshot de la vivienda.
 *   3. Asocia portal_user.residente_id si existe residente en la vivienda.
 *   4. Activa tickets 'held' del usuario → 'nuevo'.
 *   5. Inicia SLA (5 días hábiles) en tickets activados.
 *   6. Registra auditoría en portal_admin_log.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { approveClaim } from "@/lib/portal/registration-admin";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const claimId = parseInt(id, 10);
  if (isNaN(claimId) || claimId <= 0) {
    return NextResponse.json({ error: "ID de reclamo inválido." }, { status: 400 });
  }

  const result = approveClaim(claimId, auth.displayName ?? auth.username);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ claim: result.claim });
}
