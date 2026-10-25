/**
 * GET /api/portal/catalog/viviendas?condominioId=X
 * Lista viviendas de un condominio para el formulario de registro.
 * Ruta PÚBLICA (no requiere sesión). Solo expone numVivienda — sin PII ni residenteId.
 * Rate limiting: 60 req/min por IP.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listPublicViviendasForCondominio } from "@/lib/portal/catalog";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  condominioId: z.coerce.number().int().positive(),
});

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(`catalog-vivs:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: "Demasiadas peticiones." }, { status: 429 });
  }

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    condominioId: url.searchParams.get("condominioId"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "condominioId requerido y debe ser un entero positivo." }, { status: 400 });
  }

  const viviendas = listPublicViviendasForCondominio(parsed.data.condominioId);
  return NextResponse.json({ viviendas });
}
