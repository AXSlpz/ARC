import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getLogoFilePath, writeLogoFile, getAdminSettings } from "@/lib/admin-settings";
import { isAuthError, requireAdmin, requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"],
]);

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const filePath = getLogoFilePath();
  if (!filePath) {
    return new NextResponse("Logo no encontrado", { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : "image/jpeg";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  try {
    const formData = await req.formData();
    const file = formData.get("logo");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Archivo logo requerido" }, { status: 400 });
    }

    const extension = ALLOWED_TYPES.get(file.type);
    if (!extension) {
      return NextResponse.json(
        { error: "Formato no soportado. Usa PNG, JPG o WEBP" },
        { status: 400 }
      );
    }

    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json(
        { error: "El logo debe pesar menos de 2 MB" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    writeLogoFile(buffer, extension);
    const settings = getAdminSettings();

    logAudit(auth.id, auth.username, "logo.update", "settings", 1, {
      fileType: file.type,
      fileSizeKb: Math.round(file.size / 1024),
    });

    return NextResponse.json({
      ok: true,
      logoUrl: settings.logoUrl,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al subir logo" },
      { status: 500 }
    );
  }
}
