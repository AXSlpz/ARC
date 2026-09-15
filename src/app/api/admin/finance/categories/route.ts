import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { createCategory, listCategories } from "@/lib/portal/finance";
import type { FinanceKind } from "@/lib/portal/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const kindParam = new URL(req.url).searchParams.get("kind");
  const kind = kindParam === "income" || kindParam === "expense" ? kindParam : undefined;
  return NextResponse.json({ categories: listCategories(kind) });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const body = await req.json().catch(() => null);
  const name = body && typeof body === "object" ? String((body as { name?: unknown }).name ?? "") : "";
  const kindRaw = body && typeof body === "object" ? String((body as { kind?: unknown }).kind ?? "") : "";
  if (kindRaw !== "income" && kindRaw !== "expense") {
    return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
  }
  const category = createCategory(name, kindRaw as FinanceKind);
  if (!category) {
    return NextResponse.json(
      { error: "No se pudo crear (¿nombre duplicado o vacío?)." },
      { status: 400 }
    );
  }
  return NextResponse.json({ category }, { status: 201 });
}
