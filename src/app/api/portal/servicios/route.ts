/**
 * GET /api/portal/servicios
 *
 * Devuelve el catálogo de servicios activos del CRM con precios de la lista
 * configurada para el portal.
 *
 * Auth: requirePortalUser (sesión de portal).
 * Rate limit: heredado del middleware global.
 * Nunca expone costos internos ni PII.
 */

import { NextRequest, NextResponse } from "next/server";
import { isPortalAuthError, requirePortalUser } from "@/lib/portal/auth";
import {
  listServicesForPortal,
  getPortalPriceListId,
  getDefaultPriceListId,
} from "@/lib/portal/services-catalog";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;

  const url = new URL(req.url);
  const search = url.searchParams.get("q") ?? undefined;

  // Selección de lista: config > default > null
  const defaultId = getDefaultPriceListId() ?? 0;
  const priceListId = getPortalPriceListId(defaultId);

  const services = listServicesForPortal(priceListId, search);

  return NextResponse.json({ services, priceListId });
}
