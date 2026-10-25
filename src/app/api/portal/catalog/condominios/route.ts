/**
 * GET /api/portal/catalog/condominios?developmentId=X
 * Lista condominios vinculados a un desarrollo para el formulario de registro.
 * Ruta PÚBLICA (no requiere sesión). Solo expone id/name/prefijo — sin PII.
 * Rate limiting: 60 req/min por IP.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listPublicCondominios,
  listPublicCondominiosForDevelopment,
} from "@/lib/portal/catalog";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  developmentId: z.coerce.number().int().positive().optional(),
});

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(`catalog-condos:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: "Demasiadas peticiones." }, { status: 429 });
  }

  const url = new URL(req.url);
  const rawId = url.searchParams.get("developmentId");
  const parsed = QuerySchema.safeParse({
    developmentId: rawId ? rawId : undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "developmentId debe ser un entero positivo." }, { status: 400 });
  }

  const condominios = parsed.data.developmentId
    ? listPublicCondominiosForDevelopment(parsed.data.developmentId)
    : listPublicCondominios();
  return NextResponse.json({ condominios });
}
