import { NextRequest, NextResponse } from "next/server";
import { setMode, getConversationById, canUserAccessConversation } from "@/lib/db";
import { isAuthError, requireAuth } from "@/lib/auth";
import { conversationAuditDetails, logAudit } from "@/lib/audit";
import { ModeSchema, parseBody } from "@/lib/validation";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export async function POST(req: NextRequest, { params }: Ctx) {
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

  const rawBody = await req.json().catch(() => null);
  const parsed = parseBody(ModeSchema, rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { mode } = parsed.data;

  setMode(id, mode);
  logAudit(
    auth.id,
    auth.username,
    "conversation.mode",
    "conversation",
    id,
    conversationAuditDetails(convo, {
      previousMode: convo.mode,
      mode,
    })
  );
  return NextResponse.json({ ok: true, mode });
}
