import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { createTag, deleteTag, listTags } from "@/lib/db-features";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  return NextResponse.json(listTags(), {
    headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=60" },
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const body = await req.json();
  const tag = createTag(body.name ?? "", body.color ?? "#6b7280");
  logAudit(auth.id, auth.username, "tag.create", "tag", tag.id, {
    tagName: tag.name,
    tagColor: tag.color,
  });
  return NextResponse.json(tag, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  const existing = listTags().find((t) => t.id === id);
  deleteTag(id);
  logAudit(auth.id, auth.username, "tag.delete", "tag", id, {
    tagName: existing?.name,
    tagColor: existing?.color,
  });
  return NextResponse.json({ ok: true });
}
