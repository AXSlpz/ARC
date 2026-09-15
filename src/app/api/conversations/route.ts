import { NextRequest, NextResponse } from "next/server";
import { listConversations } from "@/lib/db";
import { isAuthError, requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const lineIdParam = req.nextUrl.searchParams.get("lineId");
  let lineId: number | undefined;
  if (lineIdParam) {
    lineId = parseInt(lineIdParam, 10);
    if (isNaN(lineId)) {
      return NextResponse.json({ error: "lineId inválido" }, { status: 400 });
    }
    if (
      auth.role === "atencion" &&
      auth.allowedLineIds != null &&
      !auth.allowedLineIds.includes(lineId)
    ) {
      return NextResponse.json([]);
    }
  }

  const conversations = listConversations(
    lineId,
    auth.id,
    auth.role,
    auth.allowedLineIds
  );
  return NextResponse.json(conversations);
}
