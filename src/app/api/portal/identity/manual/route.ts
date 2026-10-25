import { NextRequest, NextResponse } from "next/server";
import { isPortalAuthError, requirePortalUser } from "@/lib/portal/auth";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import {
  fieldsFromManualEntry,
  readStoredIneFields,
  sameCredential,
  samePerson,
} from "@/lib/portal/ine-fields";
import { saveManualMatchToken } from "@/lib/portal/ine-captures";
import {
  getCurrentIdentityDocument,
  updateCurrentIneMetadata,
} from "@/lib/portal/identity-documents";

export const dynamic = "force-dynamic";

function text(body: Record<string, unknown>, key: string): string {
  return typeof body[key] === "string" ? body[key] : "";
}

/** Guarda una INE escrita a mano y la compara con la credencial ya guardada. */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(`ine-manual:${ip}`, 12, 15 * 60_000)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos." },
      { status: 429 }
    );
  }

  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }
  const purpose = body.purpose === "match" ? "match" : body.purpose === "profile" ? "profile" : "";
  if (!purpose) {
    return NextResponse.json(
      { error: "El ingreso manual se usa cuando ya hay una INE guardada." },
      { status: 400 }
    );
  }

  const stored = readStoredIneFields(
    getCurrentIdentityDocument(auth.id, "ine")?.ocrMetadata ?? null
  );
  if (!stored) {
    return NextResponse.json(
      {
        error: "No hay una INE guardada para comparar el nombre.",
        code: "missing_profile",
      },
      { status: 409 }
    );
  }

  const manual = fieldsFromManualEntry(
    {
      nombre: text(body, "nombre"),
      fechaNacimiento: text(body, "fechaNacimiento"),
      curp: text(body, "curp"),
      anioVencimiento: text(body, "anioVencimiento"),
      claveElector: text(body, "claveElector"),
    },
    stored
  );
  if (!manual.fields) {
    return NextResponse.json({ error: manual.error }, { status: 422 });
  }

  if (purpose === "profile") {
    if (!samePerson(stored, manual.fields)) {
      return NextResponse.json(
        {
          error:
            "Esta credencial no coincide con tu nombre, CURP o fecha de nacimiento. No se actualizó el perfil.",
        },
        { status: 409 }
      );
    }
    const saved = updateCurrentIneMetadata(auth.id, { ...manual.fields });
    if (!saved) {
      return NextResponse.json(
        { error: "No se pudo guardar la INE." },
        { status: 500 }
      );
    }
    return NextResponse.json({ fields: manual.fields });
  }

  if (!sameCredential(stored, manual.fields)) {
    return NextResponse.json(
      {
        error:
          "Esta INE no coincide con la de tu perfil. Actualízala primero en Mi perfil y vuelve a solicitar.",
        code: "mismatch",
      },
      { status: 409 }
    );
  }
  const token = saveManualMatchToken(auth.id, manual.fields);
  return NextResponse.json({ token, fields: manual.fields });
}
