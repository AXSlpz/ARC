import { NextRequest, NextResponse } from "next/server";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
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

/** Lectura previa al crear la cuenta. No guarda la credencial en el perfil. */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(`ine-read:${ip}`, 8, 15 * 60_000)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos." },
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
    const review = await openIneReview({ frontJpeg: front, backJpeg: back, purpose: "register" });
    return NextResponse.json(review);
  } catch (err) {
    if (err instanceof IneFileError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[ine/read]", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "No se pudo leer la credencial." }, { status: 500 });
  }
}
