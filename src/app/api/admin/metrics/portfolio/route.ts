import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { getPortfolioAnalytics } from "@/lib/portfolio-analytics";
import { isRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const key = `user:${auth.id}:metrics-portfolio`;
  if (isRateLimited(key, 20, 60_000)) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  const raw = req.nextUrl.searchParams.get("condominioId");
  let condominioId: number | null = null;
  if (raw != null && raw !== "" && raw !== "all") {
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
      return NextResponse.json({ error: "condominioId inválido" }, { status: 400 });
    }
    condominioId = n;
  }

  return NextResponse.json(getPortfolioAnalytics(condominioId));
}
