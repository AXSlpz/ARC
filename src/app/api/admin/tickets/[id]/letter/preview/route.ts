import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import { buildLetterHtml } from "@/lib/portal/authorization-letter";

interface Ctx {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

/** Devuelve el HTML de la carta (vista previa) sin generar/guardar el PDF. */
export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  const built = buildLetterHtml(ticketId, auth.id);
  if ("error" in built) {
    return NextResponse.json({ error: built.error }, { status: 404 });
  }

  return new NextResponse(built.html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; img-src * data:; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
