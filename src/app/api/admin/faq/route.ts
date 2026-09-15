import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { createFaqItem, deleteFaqItem, listFaqItems } from "@/lib/db-features";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  return NextResponse.json(listFaqItems(), {
    headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=60" },
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const body = await req.json();
  const item = createFaqItem(body.question ?? "", body.answer ?? "", body.keywords ?? "");
  logAudit(auth.id, auth.username, "faq.create", "faq", item.id, {
    question: item.question,
    answerPreview: item.answer.slice(0, 120),
    keywords: item.keywords,
  });
  return NextResponse.json(item, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  const existing = listFaqItems().find((f) => f.id === id);
  deleteFaqItem(id);
  logAudit(auth.id, auth.username, "faq.delete", "faq", id, {
    question: existing?.question,
    answerPreview: existing?.answer?.slice(0, 120),
    keywords: existing?.keywords,
  });
  return NextResponse.json({ ok: true });
}
