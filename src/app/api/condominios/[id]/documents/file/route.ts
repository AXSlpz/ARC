import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { isAuthError, requireAuth } from "@/lib/auth";
import { getCondominio } from "@/lib/residentes";
import { resolveDocumentPath } from "@/lib/documents";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const condo = getCondominio(numId);
  if (!condo) {
    return NextResponse.json({ error: "Condominio no encontrado" }, { status: 404 });
  }

  const name = new URL(req.url).searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  }

  try {
    const filePath = resolveDocumentPath(numId, name);
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=60",
        "Content-Disposition": `inline; filename="${path.basename(filePath)}"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Archivo no encontrado" },
      { status: 404 }
    );
  }
}
