import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import {
  createQuickReply,
  deleteQuickReply,
  listQuickReplies,
} from "@/lib/db-features";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  return NextResponse.json(listQuickReplies());
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const body = await req.json();
  const item = createQuickReply(body.label ?? "", body.content ?? "");
  logAudit(auth.id, auth.username, "quick_reply.create", "quick_reply", item.id, {
    label: item.label,
    contentPreview: item.content.slice(0, 120),
  });
  return NextResponse.json(item, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  const existing = listQuickReplies().find((q) => q.id === id);
  deleteQuickReply(id);
  logAudit(auth.id, auth.username, "quick_reply.delete", "quick_reply", id, {
    label: existing?.label,
    contentPreview: existing?.content?.slice(0, 120),
  });
  return NextResponse.json({ ok: true });
}
