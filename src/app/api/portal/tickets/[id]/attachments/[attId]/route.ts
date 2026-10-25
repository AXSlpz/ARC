import { readFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { isPortalAuthError, requirePortalUser } from "@/lib/portal/auth";
import { getTicketById } from "@/lib/portal/tickets";
import { getAttachmentStoredPath } from "@/lib/portal/attachments";
import { fileExtension, inlineMime } from "@/lib/portal/attachment-kind";
import { previewDocx, previewXlsx } from "@/lib/portal/office-preview";

interface Ctx {
  params: Promise<{ id: string; attId: string }>;
}

export const dynamic = "force-dynamic";

function safeFilename(name: string): string {
  const cleaned = name.replace(/[^\w.\-]+/g, "_").replace(/^\.+/, "");
  return cleaned.slice(0, 180) || "archivo";
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;

  const { id, attId } = await params;
  const ticketId = parseInt(id, 10);
  const attachmentId = parseInt(attId, 10);
  if (!Number.isInteger(ticketId) || !Number.isInteger(attachmentId)) {
    return NextResponse.json({ error: "Archivo no disponible" }, { status: 404 });
  }

  const ticket = getTicketById(ticketId);
  if (!ticket || ticket.portalUserId !== auth.id) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const found = getAttachmentStoredPath(ticketId, attachmentId);
  if (!found) {
    return NextResponse.json({ error: "Archivo no disponible" }, { status: 404 });
  }

  const file = await readFile(found.path);
  const mode = new URL(req.url).searchParams.get("mode");
  const ext = fileExtension(found.originalName);

  if (mode === "text") {
    let text: string | null = null;
    if (ext === "txt") text = file.toString("utf8");
    else if (ext === "docx") text = previewDocx(file);
    else if (ext === "xlsx") text = previewXlsx(file);
    if (text == null) {
      return NextResponse.json(
        { error: "Este archivo se abre descargándolo." },
        { status: 415 }
      );
    }
    return NextResponse.json({ text: text.slice(0, 20_000) });
  }

  const safeName = safeFilename(found.originalName);
  const mime = mode === "inline" ? inlineMime(found.originalName, "") : null;
  if (mode === "inline" && !mime) {
    return NextResponse.json(
      { error: "Este archivo no se puede mostrar en el navegador." },
      { status: 415 }
    );
  }

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": mime ?? "application/octet-stream",
      "Content-Disposition": `${mime ? "inline" : "attachment"}; filename="${safeName}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
