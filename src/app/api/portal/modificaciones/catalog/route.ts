/**
 * GET /api/portal/modificaciones/catalog
 *
 * Retorna las modificaciones del desarrollo del claim vigente
 * (aprobado, pendiente o en conflicto). Una cuenta pendiente ve el catálogo
 * del PDF y sus solicitudes quedan en espera hasta la verificación.
 */
import { NextResponse } from "next/server";
import { isPortalAuthError, requirePortalUser } from "@/lib/portal/auth";
import { buildPortalModificationCatalog } from "@/lib/portal/modification-catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;

  return NextResponse.json(buildPortalModificationCatalog(auth.id));
}
