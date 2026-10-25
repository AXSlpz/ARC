/**
 * POST /api/portal/register
 * Registro escalonado: crea portal_user + property_claim en una transacción.
 * Rate limiting: 10 intentos / 15 min por IP.
 *
 * Body esperado:
 *   developmentId  number   — ID del desarrollo
 *   condominioId   number   — ID del condominio
 *   numVivienda    number   — Número de vivienda
 *   name           string   — Nombre completo del propietario
 *   email          string   — Correo electrónico
 *   phone          string?  — Teléfono (opcional)
 *   password       string   — Contraseña (≥ 8 chars)
 *   confirmPassword string  — Confirmación de contraseña
 *
 * Respuesta 201:  { user, claim }
 * Respuesta 400:  { error }
 * Respuesta 422:  { error } — validación Zod
 * Respuesta 429:  { error } — rate limit
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPortalSession, setPortalCookie } from "@/lib/portal/auth";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import { registerWithClaim } from "@/lib/portal/registration-admin";
import { commitRegisterIne, peekIneCapture } from "@/lib/portal/ine-captures";

export const dynamic = "force-dynamic";

const DwellingSchema = z.object({
  developmentId: z.coerce.number().int().positive(),
  condominioId: z.coerce.number().int().positive(),
  numVivienda: z.coerce.number().int().positive().max(999999),
});

const RegisterSchema = z.object({
  developmentId: z.coerce.number().int().positive(),
  condominioId: z.coerce.number().int().positive(),
  numVivienda: z.coerce.number().int().positive().max(999999),
  properties: z.array(DwellingSchema).min(1).max(10).optional(),
  name: z.string().trim().max(180).optional(),
  ineToken: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  email: z.string().email(),
  phone: z.string().max(30).nullable().optional(),
  password: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(`portal-register:${ip}`, 10, 15 * 60_000)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos antes de intentar de nuevo." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos. Verifica los campos e intenta de nuevo." },
      { status: 422 }
    );
  }

  const ineToken = parsed.data.ineToken;
  let name = parsed.data.name?.trim() ?? "";
  if (ineToken) {
    const capture = peekIneCapture(ineToken, "register");
    if (!capture || capture.fields.expired) {
      return NextResponse.json(
        { error: "La lectura de la INE expiró o no es válida. Vuelve a tomar las fotos." },
        { status: 400 }
      );
    }
    name = capture.fields.nombreCompleto;
  } else if (name.length < 2) {
    return NextResponse.json(
      { error: "Escribe tu nombre completo para crear la cuenta." },
      { status: 422 }
    );
  }

  const result = registerWithClaim({
    ...parsed.data,
    name,
    phone: parsed.data.phone ?? "",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  let attached: { ok: true } | { ok: false; error: string } = {
    ok: false,
    error: "No se pudo guardar la credencial.",
  };
  try {
    if (ineToken) attached = await commitRegisterIne(ineToken, result.user.id);
    else attached = { ok: true };
  } catch (err) {
    console.error("[register] ine", err instanceof Error ? err.name : "error");
  }

  const sessionId = createPortalSession(result.user.id);
  const response = NextResponse.json(
    {
      user: result.user,
      claim: result.claim,
      ...(attached.ok ? {} : { warning: attached.error }),
    },
    { status: 201 }
  );
  setPortalCookie(response, sessionId);
  return response;
}
