/**
 * GET /api/portal/claim-status
 * Retorna el claim activo del usuario autenticado (para mostrar el banner de pending).
 * Requiere sesión de portal.
 */
import { NextResponse } from "next/server";
import { isPortalAuthError, requirePortalUser } from "@/lib/portal/auth";
import { getUserActiveClaim } from "@/lib/portal/registration-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;

  const claim = getUserActiveClaim(auth.id);
  return NextResponse.json({ claim });
}
