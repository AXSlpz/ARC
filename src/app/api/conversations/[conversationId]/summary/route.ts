import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import { getConversationById, canUserAccessConversation } from "@/lib/db";
import { clearHandoffSummary } from "@/lib/db-features";
import { conversationAuditDetails, logAudit } from "@/lib/audit";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

function shouldShowHandoffSummary(
  convo: NonNullable<ReturnType<typeof getConversationById>>
): boolean {
  if (convo.closed_at) return false;
  if (!convo.handoff_summary?.trim()) return false;
  return convo.human_requested === 1 || convo.mode === "HUMAN";
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);
  if (!canUserAccessConversation(id, auth.id, auth.role, auth.allowedLineIds)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }
  const convo = getConversationById(id);
  if (!convo) {
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  }

  const visible = shouldShowHandoffSummary(convo);
  return NextResponse.json({
    summary: visible ? convo.handoff_summary : null,
    handoffAt: visible ? convo.handoff_at : null,
    category: convo.category,
    priority: convo.priority,
    humanRequested: convo.human_requested === 1,
    mode: convo.mode,
  });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);
  if (!canUserAccessConversation(id, auth.id, auth.role, auth.allowedLineIds)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }
  const convo = getConversationById(id);
  if (!convo) {
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  }

  clearHandoffSummary(id);
  logAudit(
    auth.id,
    auth.username,
    "conversation.dismiss_summary",
    "conversation",
    id,
    conversationAuditDetails(convo)
  );
  return NextResponse.json({ ok: true });
}
