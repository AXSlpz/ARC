import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import { getTicketById } from "@/lib/portal/tickets";
import {
  MAX_FILES_PER_REQUEST,
  listAttachments,
  storeAttachment,
} from "@/lib/portal/attachments";
import { broadcastTicketEvent } from "@/lib/ws-notify";

interface Ctx {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  const ticket = getTicketById(ticketId);
  if (!ticket) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Formato inválido (multipart)." }, { status: 400 });
  }

  const commentIdRaw = form.get("commentId");
  const commentId = commentIdRaw ? Number(commentIdRaw) : null;

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  const single = form.get("file");
  if (single instanceof File) files.push(single);

  if (files.length === 0) {
    return NextResponse.json({ error: "No se recibió ningún archivo." }, { status: 400 });
  }
  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json(
      { error: `Máximo ${MAX_FILES_PER_REQUEST} archivos por envío.` },
      { status: 400 }
    );
  }

  const errors: string[] = [];
  let stored = 0;
  for (const file of files) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await storeAttachment({
      ticketId,
      commentId: Number.isInteger(commentId) ? commentId : null,
      uploaderType: "admin",
      originalName: file.name || "archivo",
      declaredMime: file.type || "",
      bytes,
    });
    if (result.ok) stored += 1;
    else errors.push(`${file.name}: ${result.error}`);
  }

  if (stored > 0) {
    broadcastTicketEvent({
      ticketId,
      portalUserId: ticket.portalUserId,
      folio: ticket.folio,
      actor: "admin",
      kind: "attachment",
    });
  }

  return NextResponse.json(
    { stored, errors, attachments: listAttachments(ticketId) },
    { status: errors.length && stored === 0 ? 400 : 201 }
  );
}
