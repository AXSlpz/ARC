import { NextRequest, NextResponse } from "next/server";
import { deleteConversation, getConversationById } from "@/lib/db";
import { isAuthError, requireSuperAdmin } from "@/lib/auth";
import { conversationAuditDetails, logAudit } from "@/lib/audit";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireSuperAdmin();
  if (isAuthError(auth)) return auth;

  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);

  if (isNaN(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const convo = getConversationById(id);
  if (!convo) {
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  }

  deleteConversation(id);
  logAudit(
    auth.id,
    auth.username,
    "conversation.delete",
    "conversation",
    id,
    conversationAuditDetails(convo)
  );
  return NextResponse.json({ ok: true });
}
