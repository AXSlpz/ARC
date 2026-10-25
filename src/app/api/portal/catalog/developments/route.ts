/**
 * GET /api/portal/catalog/developments
 * Lista desarrollos activos para el formulario de registro.
 * Ruta PÚBLICA (no requiere sesión). Solo expone id/name/slug — sin PII.
 * Rate limiting: 60 req/min por IP (ruta pública de solo lectura).
 */
import { NextRequest, NextResponse } from "next/server";
import { listPublicDevelopments } from "@/lib/portal/catalog";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(`catalog-devs:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: "Demasiadas peticiones." }, { status: 429 });
  }

  const developments = listPublicDevelopments();
  return NextResponse.json({ developments });
}
