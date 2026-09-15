import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  return NextResponse.json(
    {
      error:
        "La re-indexación ahora es por condominio. Usa Residentes → Condominios → Documentos → Re-indexar.",
      code: "DOCUMENTS_MOVED_TO_CONDOMINIO",
    },
    { status: 410 }
  );
}
