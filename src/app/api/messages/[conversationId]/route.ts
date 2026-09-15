import { NextRequest, NextResponse } from "next/server";
import {
  getMessages,
  getConversationById,
  insertMessage,
  enqueueOutbox,
  canUserAccessConversation,
} from "@/lib/db";
import { isAuthError, requireAuth } from "@/lib/auth";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";
import { MessageSchema, parseBody } from "@/lib/validation";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: Ctx) {
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

  const messages = getMessages(id, 50);
  return NextResponse.json(messages.reverse());
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  if (isRateLimited(`user:${auth.id}:messages`, 120, 60_000)) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

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

  if (convo.closed_at) {
    return NextResponse.json(
      { error: "La conversación está cerrada. Reábrela para enviar mensajes." },
      { status: 400 }
    );
  }

  const rawBody = await req.json().catch(() => null);
  const parsed = parseBody(MessageSchema, rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { content } = parsed.data;

  const messageId = insertMessage(id, "human", content);
  enqueueOutbox(id, convo.phone, content, convo.line_id);

  return NextResponse.json({ ok: true, messageId });
}
