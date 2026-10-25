import { NextRequest, NextResponse } from "next/server";
import { isPortalAuthError, requirePortalUser } from "@/lib/portal/auth";
import { identityUploadRateLimiter } from "@/lib/portal/rate-limiter";
import { acceptIneImage, IneFileError } from "@/lib/portal/ine-files";
import { openIneReview } from "@/lib/portal/ine-review";

export const dynamic = "force-dynamic";

async function imageFrom(form: FormData, key: string, label: string): Promise<Buffer> {
  const file = form.get(key);
  if (!(file instanceof File)) {
    throw new IneFileError(`Falta la foto del ${label}.`);
  }
  return acceptIneImage(Buffer.from(await file.arrayBuffer()), label);
}

/** Lee la INE del perfil y deja los datos listos para corregir. Aún no la guarda. */
export async function POST(req: NextRequest) {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;
  if (!identityUploadRateLimiter.check(`identity:${auth.id}`)) {
    return NextResponse.json(
      { error: "Demasiadas lecturas de credencial. Intenta más tarde." },
      { status: 429 }
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
      purpose: "profile",
      portalUserId: auth.id,
    });
    return NextResponse.json(review);
  } catch (err) {
    if (err instanceof IneFileError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[ine/save]", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "No se pudo leer la credencial." }, { status: 500 });
  }
}
