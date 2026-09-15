import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import { exportResidentesCsv } from "@/lib/residentes";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const url = new URL(req.url);
  const filters = {
    condominio_id: url.searchParams.get("condominio_id")
      ? Number(url.searchParams.get("condominio_id"))
      : undefined,
    active: url.searchParams.get("active") !== "0",
  };

  const csv = exportResidentesCsv(filters);
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="residentes_${date}.csv"`,
    },
  });
}
