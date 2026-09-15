import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { listWaLines } from "@/lib/db";
import { isAuthError, isAdminOrAbove, requireAuth } from "@/lib/auth";
import { syncMetaLineFromEnv } from "@/lib/wa/sync-meta-line";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const canSeeQr = isAdminOrAbove(auth.role);

  syncMetaLineFromEnv();
  const lines = listWaLines();
  const enriched = await Promise.all(
    lines.map(async (line) => {
      // Línea Meta: sin QR Baileys
      if (line.provider === "meta") {
        return {
          id: line.id,
          name: line.name,
          status: line.status,
          phone: line.phone,
          qrPng: null,
          provider: line.provider,
          updatedAt: line.updated_at,
        };
      }

      const shouldShowQr =
        canSeeQr &&
        !!line.qr_string &&
        (line.status === "qr" || line.status === "connecting");

      if (shouldShowQr && line.qr_string) {
        const qrPng = await QRCode.toDataURL(line.qr_string, {
          width: 280,
          margin: 2,
        });
        return {
          id: line.id,
          name: line.name,
          status: "qr" as const,
          phone: line.phone,
          qrPng,
          provider: line.provider,
          updatedAt: line.updated_at,
        };
      }

      return {
        id: line.id,
        name: line.name,
        status: line.status,
        phone: line.phone,
        qrPng: null,
        provider: line.provider,
        updatedAt: line.updated_at,
      };
    })
  );

  const connectedCount = enriched.filter((l) => l.status === "connected").length;

  return NextResponse.json({ lines: enriched, connectedCount });
}
