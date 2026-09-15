import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin, requireAuth } from "@/lib/auth";
import {
  createTemplate,
  listTemplates,
} from "@/lib/portal/notification-templates";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const url = new URL(req.url);
  const activeOnly =
    url.searchParams.get("activeOnly") === "1" ||
    url.searchParams.get("active") === "1";

  return NextResponse.json({ templates: listTemplates({ activeOnly }) });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

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

  const template = createTemplate({
    name: String(name),
    body: String(templateBody),
    active: active !== false,
    sortOrder: sort,
  });
  return NextResponse.json({ template }, { status: 201 });
}
