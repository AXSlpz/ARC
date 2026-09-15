import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import { getCondominio } from "@/lib/residentes";
import { syncComunidadFelizAccounts } from "@/lib/comunidad-feliz-accounts";
import { isComunidadFelizConfigured } from "@/lib/comunidad-feliz-client";
import { logAudit } from "@/lib/audit";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function parseCondoId(id: string): number | null {
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) return null;
  return numId;
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  if (isRateLimited(`ip:${getClientIp(req)}:admin-write`, 60, 60_000)) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  const numId = parseCondoId((await params).id);
  if (!numId) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const condo = getCondominio(numId);
  if (!condo) {
    return NextResponse.json({ error: "Condominio no encontrado" }, { status: 404 });
  }

  if (!isComunidadFelizConfigured()) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error:
          "Integración no configurada. Define COMUNIDAD_FELIZ_BASE_URL, EMAIL y PASSWORD en el entorno.",
      },
      { status: 503 }
    );
  }

  const result = await syncComunidadFelizAccounts(numId);
  const summary = result.summaries[0] ?? null;

  logAudit(auth.id, auth.username, "comunidad-feliz.sync", "condominio", numId, {
    matched: summary?.matched,
    unmatched: summary?.unmatched,
    errors: summary?.errors,
  });

  return NextResponse.json({
    success: true,
    data: { summary, configured: true },
    error: null,
  });
}
