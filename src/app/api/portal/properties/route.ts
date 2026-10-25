/**
 * GET/POST /api/portal/properties
 * Lista las viviendas del residente y agrega otra, siempre pendiente de autorización.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isPortalAuthError, requirePortalUser } from "@/lib/portal/auth";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import { addPortalHome, listPortalHomes } from "@/lib/portal/registration-admin";

export const dynamic = "force-dynamic";

const AddHomeSchema = z.object({
  developmentId: z.coerce.number().int().positive(),
  condominioId: z.coerce.number().int().positive(),
  numVivienda: z.coerce.number().int().positive().max(999999),
});

export async function GET() {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;
  return NextResponse.json({ homes: listPortalHomes(auth.id) });
}

export async function POST(req: NextRequest) {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;

  const ip = getClientIp(req);
  if (isRateLimited(`portal-add-home:${auth.id}:${ip}`, 10, 15 * 60_000)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = AddHomeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos. Verifica desarrollo, condominio y vivienda." },
      { status: 422 }
    );
  }

  const result = addPortalHome(auth.id, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ home: result.home, homes: listPortalHomes(auth.id) }, { status: 201 });
}
