import { NextRequest, NextResponse } from "next/server";
import { acknowledgeHumanRequest, getConversationById, canUserAccessConversation } from "@/lib/db";
import { isAuthError, requireAuth } from "@/lib/auth";
import { assignConversation } from "@/lib/db-features";
import { conversationAuditDetails, logAudit } from "@/lib/audit";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAuth();
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

  if (!canUserAccessConversation(id, auth.id, auth.role, auth.allowedLineIds)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  acknowledgeHumanRequest(id);
  // Solo Atención se auto-asigna al reconocer; admins supervisan sin tomar el chat.
  if (auth.role === "atencion") {
    assignConversation(id, auth.id);
  }
  logAudit(
    auth.id,
    auth.username,
    "conversation.acknowledge",
    "conversation",
    id,
    conversationAuditDetails(convo)
  );
  return NextResponse.json({ ok: true });
}
