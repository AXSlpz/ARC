import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const GONE = {
  error:
    "Los documentos ahora se gestionan por condominio. Usa Residentes → Condominios → Documentos.",
  code: "DOCUMENTS_MOVED_TO_CONDOMINIO",
};

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  return NextResponse.json(GONE, { status: 410 });
}

export async function POST() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  return NextResponse.json(GONE, { status: 410 });
}

export async function DELETE() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  return NextResponse.json(GONE, { status: 410 });
}
