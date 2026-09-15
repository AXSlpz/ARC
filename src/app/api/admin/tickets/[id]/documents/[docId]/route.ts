import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import { getTicketDocuments } from "@/lib/portal/tickets";

interface Ctx {
  params: Promise<{ id: string; docId: string }>;
}

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id, docId } = await params;
  const ticketId = parseInt(id, 10);
  const documentId = parseInt(docId, 10);

  const doc = getTicketDocuments(ticketId).find((d) => d.id === documentId);
  if (!doc) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  try {
    const file = await readFile(doc.path);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${doc.filename}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Archivo no disponible" }, { status: 404 });
  }
}
