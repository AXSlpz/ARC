import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { currentMonth, monthlyReport } from "@/lib/portal/finance";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const month = new URL(req.url).searchParams.get("month") || currentMonth();
  return NextResponse.json({ report: monthlyReport(month) });
}
