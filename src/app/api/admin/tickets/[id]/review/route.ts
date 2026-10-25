import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import { getTicketReview } from "@/lib/portal/resolution";

interface Ctx {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  const review = getTicketReview(ticketId);
  if (!review) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ review });
}
