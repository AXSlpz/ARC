import { readFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import db from "@/lib/db";
import { readStoredIneFields } from "@/lib/portal/ine-fields";
import { getCurrentIdentityDocument } from "@/lib/portal/identity-documents";

export const dynamic = "force-dynamic";

function portalUserIdFrom(req: NextRequest): number | null {
  const direct = Number(req.nextUrl.searchParams.get("portalUserId"));
  if (Number.isInteger(direct) && direct > 0) return direct;
  const residenteId = Number(req.nextUrl.searchParams.get("residenteId"));
  if (!Number.isInteger(residenteId) || residenteId <= 0) return null;
  const row = db
    .prepare("SELECT id FROM portal_users WHERE residente_id = ? ORDER BY id DESC LIMIT 1")
    .get(residenteId) as { id: number } | undefined;
  return row?.id ?? null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const portalUserId = portalUserIdFrom(req);
  if (!portalUserId) {
    return NextResponse.json({
      linked: false,
      portalUserId: null,
      fields: null,
      hasFile: false,
      hasBack: false,
    });
  }
  const doc = getCurrentIdentityDocument(portalUserId, "ine");
  return NextResponse.json({
    linked: true,
    portalUserId,
    fields: readStoredIneFields(doc?.ocrMetadata ?? null),
    hasFile: Boolean(doc?.storedPath),
    hasBack: Boolean(doc?.backStoredPath),
  });
}
