/**
 * GET /api/admin/portal-catalog/template
 * Descarga la plantilla CSV para importar viviendas del catálogo.
 * Solo expone columnas de identificación — sin PII.
 */
import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { getViviendasCsvTemplate } from "@/lib/portal/catalog-import";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const csv = getViviendasCsvTemplate();
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="machote_viviendas.csv"',
    },
  });
}
