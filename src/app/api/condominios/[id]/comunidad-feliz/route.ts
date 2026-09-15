import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import { getCondominio, updateCondominio } from "@/lib/residentes";
import {
  getLastSyncRun,
} from "@/lib/comunidad-feliz-accounts";
import { isComunidadFelizConfigured } from "@/lib/comunidad-feliz-client";
import { ComunidadFelizCondoSchema, parseBody } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function parseCondoId(id: string): number | null {
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) return null;
  return numId;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const numId = parseCondoId((await params).id);
  if (!numId) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const condo = getCondominio(numId);
  if (!condo) {
    return NextResponse.json({ error: "Condominio no encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    data: {
      condominio: {
        id: condo.id,
        name: condo.name,
        estados_cuenta: condo.estados_cuenta,
        cf_community_id: condo.cf_community_id,
      },
      configured: isComunidadFelizConfigured(),
      lastSync: getLastSyncRun(numId),
    },
    error: null,
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
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

  const body = await req.json();
  const parsed = parseBody(ComunidadFelizCondoSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const updated = updateCondominio(numId, {
    cf_community_id: parsed.data.cf_community_id,
  });
  if (!updated) {
    return NextResponse.json({ error: "Condominio no encontrado" }, { status: 404 });
  }

  logAudit(auth.id, auth.username, "comunidad-feliz.update", "condominio", numId, {
    cf_community_id: parsed.data.cf_community_id,
  });

  return NextResponse.json({
    success: true,
    data: {
      condominio: {
        id: updated.id,
        name: updated.name,
        estados_cuenta: updated.estados_cuenta,
        cf_community_id: updated.cf_community_id,
      },
      configured: isComunidadFelizConfigured(),
      lastSync: getLastSyncRun(numId),
    },
    error: null,
  });
}
