import { readFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { isPortalAuthError, requirePortalUser } from "@/lib/portal/auth";
import { getCurrentIdentityDocument } from "@/lib/portal/identity-documents";
import { pathInsideIdentity, identityContentType } from "@/lib/portal/ine-files";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;
  const side = req.nextUrl.searchParams.get("side") === "back" ? "back" : "front";
  const doc = getCurrentIdentityDocument(auth.id, "ine");
  const raw = side === "back" ? doc?.backStoredPath : doc?.storedPath;
  if (!raw) {
    return NextResponse.json({ error: "No hay archivo." }, { status: 404 });
  }
  const filePath = pathInsideIdentity(raw);
  if (!filePath) {
    return NextResponse.json({ error: "Archivo no disponible." }, { status: 404 });
  }
  const bytes = await readFile(filePath);
  const kind = identityContentType(bytes);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": kind.type,
      "Content-Disposition": `inline; filename="ine-${side}.${kind.ext}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
