import { NextResponse } from "next/server";
import { isPortalAuthError, requirePortalUser } from "@/lib/portal/auth";
import { readStoredIneFields } from "@/lib/portal/ine-fields";
import { getCurrentIdentityDocument } from "@/lib/portal/identity-documents";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;
  const doc = getCurrentIdentityDocument(auth.id, "ine");
  const fields = readStoredIneFields(doc?.ocrMetadata ?? null);
  return NextResponse.json({
    fields,
    hasFile: Boolean(doc?.storedPath),
    hasBack: Boolean(doc?.backStoredPath),
  });
}
