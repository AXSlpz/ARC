import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin, requireAuth } from "@/lib/auth";
import {
  deleteTemplate,
  getTemplate,
  updateTemplate,
} from "@/lib/portal/notification-templates";

interface Ctx {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

function parseId(raw: string): number | null {
  const id = parseInt(raw, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) {
    return NextResponse.json({ error: "Identificador inválido." }, { status: 400 });
  }
  const template = getTemplate(id);
  if (!template) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  return NextResponse.json({ template });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) {
    return NextResponse.json({ error: "Identificador inválido." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }
  const { name, body: templateBody, active, sortOrder } = body as Record<
    string,
    unknown
  >;
  if (!name || String(name).trim().length < 2) {
    return NextResponse.json({ error: "Nombre inválido." }, { status: 400 });
  }
  if (templateBody == null || String(templateBody).trim().length === 0) {
    return NextResponse.json({ error: "El cuerpo de la plantilla es obligatorio." }, { status: 400 });
  }

  const sort =
    sortOrder != null && Number.isInteger(Number(sortOrder))
      ? Number(sortOrder)
      : undefined;

  const template = updateTemplate(id, {
    name: String(name),
    body: String(templateBody),
    active: active !== false,
    sortOrder: sort,
  });
  if (!template) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  return NextResponse.json({ template });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) {
    return NextResponse.json({ error: "Identificador inválido." }, { status: 400 });
  }
  if (!getTemplate(id)) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  deleteTemplate(id);
  return NextResponse.json({ deactivated: true });
}
