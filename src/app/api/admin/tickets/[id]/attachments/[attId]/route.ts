import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import { getAttachmentStoredPath } from "@/lib/portal/attachments";

interface Ctx {
  params: Promise<{ id: string; attId: string }>;
}

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id, attId } = await params;
  const ticketId = parseInt(id, 10);
  const attachmentId = parseInt(attId, 10);

  const found = getAttachmentStoredPath(ticketId, attachmentId);
  if (!found) {
    return NextResponse.json({ error: "Archivo no disponible" }, { status: 404 });
  }

  const file = await readFile(found.path);
  const safeName = found.originalName.replace(/[^\w.\-]+/g, "_");
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
