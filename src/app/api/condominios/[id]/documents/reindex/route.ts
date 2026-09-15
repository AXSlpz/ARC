import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import { getCondominio, setDocumentacionIndexada } from "@/lib/residentes";
import { runReglamentosIndexCli } from "@/lib/run-reglamentos-index";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
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

  try {
    const index = await runReglamentosIndexCli(numId);
    setDocumentacionIndexada(numId, index.chunks > 0);

    logAudit(auth.id, auth.username, "document.reindex", "condominio", numId, {
      chunkCount: index.chunks,
      sourceCount: index.sources,
      condominioName: condo.name,
    });

    return NextResponse.json({
      ok: true,
      chunks: index.chunks,
      sources: index.sources,
      generatedAt: index.generatedAt,
      condominioId: numId,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Error al re-indexar documentos",
      },
      { status: 500 }
    );
  }
}
