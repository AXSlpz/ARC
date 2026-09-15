import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import { exportResidentesTemplateCsv } from "@/lib/residentes";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const csv = exportResidentesTemplateCsv();

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="machote_residentes.csv"',
    },
  });
}
