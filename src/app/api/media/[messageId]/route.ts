import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { canUserAccessConversation } from "@/lib/db";
import db from "@/lib/db";
import { isAuthError, requireAuth } from "@/lib/auth";
import {
  assertPathInsideUploadsRoot,
  detectImageFormat,
} from "@/lib/incoming-media-security";

interface Ctx {
  params: Promise<{ messageId: string }>;
}

const UPLOADS_ROOT = path.resolve(process.cwd(), "data", "uploads");

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { messageId } = await params;
  const id = parseInt(messageId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const row = db
    .prepare(
      "SELECT conversation_id, media_type, media_path FROM messages WHERE id = ?"
    )
    .get(id) as
    | { conversation_id: number; media_type: string | null; media_path: string | null }
    | undefined;

  if (!row?.media_path || row.media_type !== "image") {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  if (!canUserAccessConversation(row.conversation_id, auth.id, auth.role, auth.allowedLineIds)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  let resolved: string;
  try {
    resolved = assertPathInsideUploadsRoot(row.media_path, UPLOADS_ROOT);
  } catch {
    return NextResponse.json({ error: "Archivo no disponible" }, { status: 404 });
  }

  if (!fs.existsSync(resolved)) {
    return NextResponse.json({ error: "Archivo no disponible" }, { status: 404 });
  }

  const buffer = fs.readFileSync(resolved);
  const format = detectImageFormat(buffer);
  if (!format) {
    return NextResponse.json({ error: "Archivo no disponible" }, { status: 404 });
  }

  const mime =
    format === "png"
      ? "image/png"
      : format === "webp"
        ? "image/webp"
        : "image/jpeg";

  const safeName = path.basename(resolved).replace(/[^\w.\-]/g, "_");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${safeName}"`,
    },
  });
}
