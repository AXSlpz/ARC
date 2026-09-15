import { NextRequest, NextResponse } from "next/server";
import {
  assertSameOrigin,
  can,
  isAuthError,
  requireAuth,
} from "@/lib/auth";
import { assignConversation } from "@/lib/db-features";
import { conversationAuditDetails, logAudit } from "@/lib/audit";
import { canUserAccessConversation, getConversationById } from "@/lib/db";
import { getAdminUserById } from "@/lib/admin-settings";
import { ConversationAssignSchema, parseBody } from "@/lib/validation";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const originErr = assertSameOrigin(req);
  if (originErr) return originErr;

  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  if (
    !canUserAccessConversation(
      id,
      auth.id,
      auth.role,
      auth.allowedLineIds
    )
  ) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(ConversationAssignSchema, rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const userId =
    parsed.data.userId === null || parsed.data.userId === undefined
      ? auth.id
      : Number(parsed.data.userId);

  const targetId = Number.isFinite(userId) ? userId : auth.id;
  if (
    !can(auth, "assign_chat_to_others") &&
    targetId !== auth.id
  ) {
    return NextResponse.json(
      { error: "Solo puedes asignarte conversaciones a ti mismo" },
      { status: 403 }
    );
  }

  assignConversation(id, targetId);

  const convo = getConversationById(id);
  const assignedUser = getAdminUserById(targetId);
  if (convo) {
    logAudit(
      auth.id,
      auth.username,
      "conversation.assign",
      "conversation",
      id,
      conversationAuditDetails(convo, {
        assignedTo: assignedUser?.id ?? targetId,
        assignedToName:
          assignedUser?.displayName ?? assignedUser?.username ?? "—",
      })
    );
  }
  return NextResponse.json({ ok: true });
}
