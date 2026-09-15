import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import {
  listResidentes,
  createResidente,
  getResidenteStats,
} from "@/lib/residentes";
import { ResidenteSchema, parseBody } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const url = new URL(req.url);
  const statsOnly = url.searchParams.get("stats") === "1";

  if (statsOnly) {
    return NextResponse.json(getResidenteStats());
  }

  const filters = {
    condominio_id: url.searchParams.get("condominio_id")
      ? Number(url.searchParams.get("condominio_id"))
      : undefined,
    search: url.searchParams.get("search") ?? undefined,
    active: url.searchParams.get("active") !== "0",
    page: Math.max(1, Number(url.searchParams.get("page") ?? 1)),
    limit: Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50))),
  };

  return NextResponse.json(listResidentes(filters));
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const body = await req.json();
  const parsed = parseBody(ResidenteSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const residente = createResidente(parsed.data);
    logAudit(auth.id, auth.username, "residente.create", "residente", residente.id, {
      nombre: residente.nombre,
      condominio: residente.condominio_name,
      celular: residente.celular,
    });
    return NextResponse.json(residente, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al crear residente";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
