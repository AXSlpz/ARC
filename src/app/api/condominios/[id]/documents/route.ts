import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import { getCondominio, setDocumentacionIndexada } from "@/lib/residentes";
import {
  deleteDocument,
  listDocuments,
  saveDocument,
} from "@/lib/documents";
import { getReglamentosIndexStatus } from "@/lib/reglamentos";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function parseCondoId(id: string): number | null {
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) return null;
  return numId;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const numId = parseCondoId(id);
  if (!numId) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const condo = getCondominio(numId);
  if (!condo) {
    return NextResponse.json({ error: "Condominio no encontrado" }, { status: 404 });
  }

  const indexStatus = getReglamentosIndexStatus(numId);

  return NextResponse.json({
    condominio: { id: condo.id, name: condo.name },
    documents: listDocuments(numId),
    ...indexStatus,
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const numId = parseCondoId(id);
  if (!numId) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const condo = getCondominio(numId);
  if (!condo) {
    return NextResponse.json({ error: "Condominio no encontrado" }, { status: 404 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const saved = saveDocument(buffer, file.name, file.type, numId);

    logAudit(auth.id, auth.username, "document.upload", "condominio", numId, {
      fileName: saved.name,
      documentKind: saved.kind,
      fileSizeKb: Math.round(saved.size / 1024),
      condominioName: condo.name,
    });

    return NextResponse.json({
      ok: true,
      document: saved,
      replaced: true,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al subir archivo" },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const numId = parseCondoId(id);
  if (!numId) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const condo = getCondominio(numId);
  if (!condo) {
    return NextResponse.json({ error: "Condominio no encontrado" }, { status: 404 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name");
    if (!name) {
      return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
    }

    deleteDocument(name, numId);

    const remaining = listDocuments(numId).length;
    if (remaining === 0) {
      setDocumentacionIndexada(numId, false);
    }

    logAudit(auth.id, auth.username, "document.delete", "condominio", numId, {
      fileName: name,
      condominioName: condo.name,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al eliminar" },
      { status: 400 }
    );
  }
}
