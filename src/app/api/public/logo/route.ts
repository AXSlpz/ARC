import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getLogoFilePath } from "@/lib/admin-settings";

export const dynamic = "force-dynamic";

export async function GET() {
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
      "Cache-Control": "public, max-age=300",
    },
  });
}
