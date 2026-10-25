import { readFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { isPortalAuthError, requirePortalUser } from "@/lib/portal/auth";
import { getTicketById, getTicketDocuments } from "@/lib/portal/tickets";

interface Ctx {
  params: Promise<{ id: string; docId: string }>;
}

export const dynamic = "force-dynamic";

function safePdfName(name: string): string {
  const cleaned = name.replace(/[^\w.\-]+/g, "_").replace(/^\.+/, "");
  const base = cleaned.slice(0, 180) || "carta.pdf";
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;

  const { id, docId } = await params;
  const ticketId = parseInt(id, 10);
  const documentId = parseInt(docId, 10);
  if (!Number.isInteger(ticketId) || !Number.isInteger(documentId)) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  const ticket = getTicketById(ticketId);
  if (!ticket || ticket.portalUserId !== auth.id) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const doc = getTicketDocuments(ticketId).find((d) => d.id === documentId);
  if (!doc) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  let file: Buffer;
  try {
    file = await readFile(doc.path);
  } catch {
    return NextResponse.json({ error: "Archivo no disponible" }, { status: 404 });
  }

  if (file.subarray(0, 5).toString("utf8") !== "%PDF-") {
    return NextResponse.json({ error: "Archivo no disponible" }, { status: 404 });
  }

  const mode = new URL(req.url).searchParams.get("mode");
  const inline = mode !== "download";
  const safeName = safePdfName(doc.filename);

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
