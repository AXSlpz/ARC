import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { isAuthError, requireAuth } from "@/lib/auth";
import { getConversationById, canUserAccessConversation } from "@/lib/db";
import { clearHandoffSummary, setAwaitingSurvey } from "@/lib/db-features";
import { conversationAuditDetails, logAudit } from "@/lib/audit";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export async function POST(_req: NextRequest, { params }: Ctx) {
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

  if (convo.awaiting_survey) {
    return NextResponse.json({
      ok: true,
      message: "La encuesta ya está pendiente para este cliente",
    });
  }

  setAwaitingSurvey(id, true);
  clearHandoffSummary(id);

  const dataDir = path.resolve(process.cwd(), "data");
  fs.writeFileSync(
    path.join(dataDir, `.survey-${id}`),
    JSON.stringify({ phone: convo.phone, at: Date.now() })
  );

  logAudit(
    auth.id,
    auth.username,
    "conversation.close_survey",
    "conversation",
    id,
    conversationAuditDetails(convo)
  );
  return NextResponse.json({
    ok: true,
    message: "Encuesta enviada al cliente",
  });
}
