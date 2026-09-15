import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import { getConversationById, canUserAccessConversation } from "@/lib/db";
import { reopenConversation } from "@/lib/db-features";
import { conversationAuditDetails, logAudit } from "@/lib/audit";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);

  if (isNaN(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  if (!canUserAccessConversation(id, auth.id, auth.role, auth.allowedLineIds)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const convo = getConversationById(id);
  if (!convo) {
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  }

  if (!convo.closed_at) {
    return NextResponse.json(
      { error: "La conversación ya está abierta" },
      { status: 400 }
    );
  }

  reopenConversation(id);

  logAudit(
    auth.id,
    auth.username,
    "conversation.reopen",
    "conversation",
    id,
    conversationAuditDetails(convo)
  );

  return NextResponse.json({
    ok: true,
    message: "Conversación reabierta",
  });
}
