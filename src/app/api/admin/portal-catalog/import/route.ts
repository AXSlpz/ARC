/**
 * POST /api/admin/portal-catalog/import
 * Importa viviendas de un CSV al catálogo del portal.
 *
 * Soporta:
 *   - preview=1 → solo valida, no inserta
 *   - preview=0 (default) → valida + inserta
 *
 * FormData:
 *   file  — archivo CSV (campo "file")
 *
 * Respuesta:
 *   { totalRows, inserted, skipped, errors, preview: boolean }
 */
import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import {
  importViviendasFromCsv,
  previewViviendasCsv,
} from "@/lib/portal/catalog-import";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const url = new URL(req.url);
  const isPreview = url.searchParams.get("preview") === "1";

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "FormData requerido." }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "Campo 'file' requerido." }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json(
      { error: "Solo se aceptan archivos CSV (.csv). Para XLSX, exporta como CSV primero." },
      { status: 400 }
    );
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json(
      { error: "El archivo no puede superar 5 MB." },
      { status: 400 }
    );
  }

  const text = await file.text();

  if (isPreview) {
    const result = previewViviendasCsv(text);
    return NextResponse.json({ ...result, preview: true });
  }

  const result = importViviendasFromCsv(text);

  // Auditoría
  logAudit(auth.id, auth.username, "portal_catalog.import", "viviendas", null, {
    fileName: file.name,
    totalRows: result.totalRows,
    inserted: result.inserted,
    skipped: result.skipped,
    errors: result.errors.length,
  });

  return NextResponse.json({ ...result, preview: false });
}
