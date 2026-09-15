import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { isPortalAuthError, requirePortalUser } from "@/lib/portal/auth";
import { getTicketById } from "@/lib/portal/tickets";
import { getAttachmentStoredPath } from "@/lib/portal/attachments";

interface Ctx {
  params: Promise<{ id: string; attId: string }>;
}

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;

  const { id, attId } = await params;
  const ticketId = parseInt(id, 10);
  const attachmentId = parseInt(attId, 10);

  const ticket = getTicketById(ticketId);
  if (!ticket || ticket.portalUserId !== auth.id) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const found = getAttachmentStoredPath(ticketId, attachmentId);
  if (!found) {
    return NextResponse.json({ error: "Archivo no disponible" }, { status: 404 });
  }

  const file = await readFile(found.path);
  const safeName = found.originalName.replace(/[^\w.\-]+/g, "_");
  return new NextResponse(new Uint8Array(file), {
    headers: {
      // Descarga forzada: el servidor nunca interpreta el archivo.
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
