import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { getMetrics } from "@/lib/db-features";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const key = `user:${auth.id}:metrics`;
  if (isRateLimited(key, 10, 60_000)) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  const lineIdParam = req.nextUrl.searchParams.get("lineId");
  const lineId =
    lineIdParam != null && lineIdParam !== ""
      ? Number.parseInt(lineIdParam, 10)
      : undefined;

  if (lineId != null && (Number.isNaN(lineId) || lineId < 1 || lineId > 2)) {
    return NextResponse.json({ error: "lineId inválido" }, { status: 400 });
  }

  return NextResponse.json(getMetrics(lineId));
}
