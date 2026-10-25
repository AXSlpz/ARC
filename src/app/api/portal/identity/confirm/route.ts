import { NextRequest, NextResponse } from "next/server";
import { isPortalAuthError, requirePortalUser } from "@/lib/portal/auth";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import {
  parseIneFields,
  readStoredIneFields,
  sameCredential,
  samePerson,
} from "@/lib/portal/ine-fields";
import { commitProfileIne, updateIneCaptureFields } from "@/lib/portal/ine-captures";
import { getCurrentIdentityDocument } from "@/lib/portal/identity-documents";
import db from "@/lib/db-connection";

export const dynamic = "force-dynamic";

/** Confirma los datos de la INE, incluidos los que la persona corrigió a mano. */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(`ine-confirm:${ip}`, 12, 15 * 60_000)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos." },
      { status: 429 }
    );
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token : "";
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return NextResponse.json({ error: "La lectura de la INE expiró. Vuelve a tomar las fotos." }, { status: 400 });
  }
  const parsed = parseIneFields(body as Record<string, unknown>);
  if (!parsed.fields) {
    const names = parsed.issues.map((issue) => issue.field).join(", ");
    return NextResponse.json(
      { error: `Revisa estos datos: ${names}.`, issues: parsed.issues },
      { status: 422 }
    );
  }
  if (parsed.fields.expired) {
    return NextResponse.json(
      {
        error: `Esta credencial venció en ${parsed.fields.anioVencimiento}. Necesitas una vigente.`,
        issues: [{ field: "vigencia", side: "frente" }],
      },
      { status: 422 }
    );
  }

  const row = db
    .prepare(
      `SELECT purpose, portal_user_id FROM ine_capture_tokens
       WHERE token = ? AND expires_at >= unixepoch()`
    )
    .get(token) as { purpose: "register" | "match" | "profile"; portal_user_id: number | null } | undefined;
  if (!row) {
    return NextResponse.json(
      { error: "La lectura de la INE expiró. Vuelve a tomar las fotos." },
      { status: 400 }
    );
  }

  if (row.purpose === "register") {
    const saved = updateIneCaptureFields(token, "register", parsed.fields);
    if (!saved) {
      return NextResponse.json({ error: "La lectura de la INE expiró. Vuelve a tomar las fotos." }, { status: 400 });
    }
    return NextResponse.json({ token, fields: parsed.fields });
  }

  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;
  if (row.portal_user_id !== auth.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (row.purpose === "profile") {
    const previous = readStoredIneFields(
      getCurrentIdentityDocument(auth.id, "ine")?.ocrMetadata ?? null
    );
    if (previous && !samePerson(previous, parsed.fields)) {
      return NextResponse.json(
        {
          error:
            "Esta credencial no coincide con tu nombre, CURP o fecha de nacimiento. No se actualizó el perfil.",
        },
        { status: 409 }
      );
    }
    const updated = updateIneCaptureFields(token, "profile", parsed.fields, auth.id);
    if (!updated) {
      return NextResponse.json({ error: "La lectura de la INE expiró. Vuelve a tomar las fotos." }, { status: 400 });
    }
    const committed = await commitProfileIne(token, auth.id);
    if (!committed.ok) {
      return NextResponse.json({ error: committed.error }, { status: 500 });
    }
    return NextResponse.json({ fields: parsed.fields });
  }

  const stored = readStoredIneFields(
    getCurrentIdentityDocument(auth.id, "ine")?.ocrMetadata ?? null
  );
  if (!stored) {
    return NextResponse.json(
      {
        error: "Primero registra tu INE en Mi perfil.",
        code: "missing_profile",
      },
      { status: 409 }
    );
  }
  if (!sameCredential(stored, parsed.fields)) {
    return NextResponse.json(
      {
        error:
          "Esta INE no coincide con la de tu perfil. Actualízala primero en Mi perfil y vuelve a solicitar.",
        code: "mismatch",
      },
      { status: 409 }
    );
  }
  const updated = updateIneCaptureFields(token, "match", parsed.fields, auth.id);
  if (!updated) {
    return NextResponse.json({ error: "La lectura de la INE expiró. Vuelve a tomar las fotos." }, { status: 400 });
  }
  return NextResponse.json({ token, fields: parsed.fields });
}
