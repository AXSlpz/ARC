import { NextRequest, NextResponse } from "next/server";
import { isPortalAuthError, requirePortalUser } from "@/lib/portal/auth";
import { identityUploadRateLimiter } from "@/lib/portal/rate-limiter";
import { acceptIneImage, IneFileError } from "@/lib/portal/ine-files";
import { openIneReview } from "@/lib/portal/ine-review";
import { readStoredIneFields } from "@/lib/portal/ine-fields";
import { getCurrentIdentityDocument } from "@/lib/portal/identity-documents";

export const dynamic = "force-dynamic";

async function imageFrom(form: FormData, key: string, label: string): Promise<Buffer> {
  const file = form.get(key);
  if (!(file instanceof File)) {
    throw new IneFileError(`Falta la foto del ${label}.`);
  }
  return acceptIneImage(Buffer.from(await file.arrayBuffer()), label);
}

/** Lee la INE de una solicitud. La comparación con el perfil ocurre al confirmar los datos. */
export async function POST(req: NextRequest) {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;
  if (!identityUploadRateLimiter.check(`identity-match:${auth.id}`)) {
    return NextResponse.json(
      { error: "Demasiadas lecturas de credencial. Intenta más tarde." },
      { status: 429 }
    );
  }
  const current = getCurrentIdentityDocument(auth.id, "ine");
  const stored = readStoredIneFields(current?.ocrMetadata ?? null);
  if (!stored) {
    return NextResponse.json(
      {
        error:
          "Primero registra tu INE en Mi perfil. Ahí se leen y se guardan los datos de tu credencial.",
        code: "missing_profile",
      },
      { status: 409 }
    );
  }
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "No se recibieron las fotos." }, { status: 400 });
  }
  try {
    const front = await imageFrom(form, "front", "frente");
    const back = await imageFrom(form, "back", "reverso");
    const review = await openIneReview({
      frontJpeg: front,
      backJpeg: back,
      purpose: "match",
      portalUserId: auth.id,
    });
    return NextResponse.json(review);
  } catch (err) {
    if (err instanceof IneFileError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[ine/match]", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "No se pudo validar la credencial." }, { status: 500 });
  }
}
