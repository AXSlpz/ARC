import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import { getCondominio } from "@/lib/residentes";
import {
  createPrototipo,
  listPrototipos,
} from "@/lib/prototipos";
import { parseBody, PrototipoSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function parseCondoId(id: string): number | null {
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) return null;
  return numId;
}

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const numId = parseCondoId((await params).id);
  if (!numId) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  if (!getCondominio(numId)) {
    return NextResponse.json({ error: "Condominio no encontrado" }, { status: 404 });
  }

  const includeInactive = req.nextUrl.searchParams.get("all") === "1";
  return NextResponse.json({
    success: true,
    data: listPrototipos(numId, !includeInactive),
    error: null,
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const numId = parseCondoId((await params).id);
  if (!numId) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  if (!getCondominio(numId)) {
    return NextResponse.json({ error: "Condominio no encontrado" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = parseBody(PrototipoSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const created = createPrototipo(numId, parsed.data);
    logAudit(auth.id, auth.username, "prototipo.create", "prototipo", created.id, {
      condominio_id: numId,
      name: created.name,
    });
    return NextResponse.json({ success: true, data: created, error: null });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al crear prototipo" },
      { status: 400 }
    );
  }
}
