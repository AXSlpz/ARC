import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import { canUserAccessConversation, getConversationById } from "@/lib/db";
import {
  getConversationTags,
  setConversationTags,
  listTags,
} from "@/lib/db-features";
import { conversationAuditDetails, logAudit } from "@/lib/audit";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);
  if (!canUserAccessConversation(id, auth.id, auth.role, auth.allowedLineIds)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }
  return NextResponse.json({
    tags: getConversationTags(id),
    allTags: listTags(),
  });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);
  if (!canUserAccessConversation(id, auth.id, auth.role, auth.allowedLineIds)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }
  const body = await req.json();
  const tagIds = Array.isArray(body.tagIds)
    ? body.tagIds.map((v: unknown) => Number(v)).filter((n: number) => !isNaN(n))
    : [];
  const allTags = listTags();
  const tagNames = allTags
    .filter((t) => tagIds.includes(t.id))
    .map((t) => t.name)
    .join(", ");
  setConversationTags(id, tagIds);
  const convo = getConversationById(id);
  logAudit(
    auth.id,
    auth.username,
    "conversation.tags",
    "conversation",
    id,
    convo
      ? conversationAuditDetails(convo, { tagIds, tagNames: tagNames || "—" })
      : { tagIds, tagNames: tagNames || "—" }
  );
  return NextResponse.json({ ok: true, tags: getConversationTags(id) });
}
