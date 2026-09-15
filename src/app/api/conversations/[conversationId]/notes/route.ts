import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import { canUserAccessConversation, getConversationById } from "@/lib/db";
import { addNote, listNotes } from "@/lib/db-features";
import { conversationAuditDetails, logAudit } from "@/lib/audit";
import { NoteSchema, parseBody } from "@/lib/validation";

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
  return NextResponse.json(listNotes(id));
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);
  if (!canUserAccessConversation(id, auth.id, auth.role, auth.allowedLineIds)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }
  const rawBody = await req.json().catch(() => null);
  const parsed = parseBody(NoteSchema, rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const note = addNote(
    id,
    auth.id,
    auth.displayName ?? auth.username,
    parsed.data.content
  );
  const convo = getConversationById(id);
  logAudit(
    auth.id,
    auth.username,
    "note.create",
    "conversation",
    id,
    convo
      ? conversationAuditDetails(convo, {
          noteId: note.id,
          notePreview: parsed.data.content.slice(0, 200),
        })
      : { noteId: note.id, notePreview: parsed.data.content.slice(0, 200) }
  );
  return NextResponse.json(note, { status: 201 });
}
