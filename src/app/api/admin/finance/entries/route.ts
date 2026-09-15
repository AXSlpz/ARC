import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { createEntry, listEntries } from "@/lib/portal/finance";
import type { FinanceKind } from "@/lib/portal/types";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const url = new URL(req.url);
  const month = url.searchParams.get("month") ?? undefined;
  const kindParam = url.searchParams.get("kind");
  const kind = kindParam === "income" || kindParam === "expense" ? kindParam : undefined;

  return NextResponse.json({
    entries: listEntries({ month: month || undefined, kind }),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const kindRaw = String(b.kind ?? "");
  if (kindRaw !== "income" && kindRaw !== "expense") {
    return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
  }

  // El monto llega en pesos (número); se guarda en centavos.
  const amount = Number(b.amount);
  const amountCents = Number.isFinite(amount) ? Math.round(amount * 100) : NaN;

  const result = createEntry({
    kind: kindRaw as FinanceKind,
    categoryId: b.categoryId != null && b.categoryId !== "" ? Number(b.categoryId) : null,
    amountCents,
    description: b.description != null ? String(b.description) : null,
    occurredOn: String(b.occurredOn ?? ""),
    method: b.method != null ? String(b.method) : null,
    reference: b.reference != null ? String(b.reference) : null,
    createdBy: auth.username,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  logAudit(auth.id, auth.username, "finance.create", "finance_entry", result.entry.id, {
    kind: result.entry.kind,
    amountCents: result.entry.amountCents,
  });
  return NextResponse.json({ entry: result.entry }, { status: 201 });
}
