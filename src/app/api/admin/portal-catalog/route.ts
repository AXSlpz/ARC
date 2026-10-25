/**
 * GET    /api/admin/portal-catalog — lista mapeos dev → condominios con counts.
 * POST   /api/admin/portal-catalog — vincula condominio a desarrollo.
 * DELETE /api/admin/portal-catalog — desvincula condominio de desarrollo.
 *
 * Requiere admin+. Validación con Zod.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth";
import {
  linkCondominioToDevelopment,
  unlinkCondominioFromDevelopment,
  listCondominiosLinkedToDevelopment,
  listPublicDevelopments,
} from "@/lib/portal/catalog";

export const dynamic = "force-dynamic";

// ── Zod schemas ───────────────────────────────────────────────────────────────

const LinkSchema = z.object({
  developmentId: z.coerce.number().int().positive(),
  condominioId: z.coerce.number().int().positive(),
});

function parseZod<T>(schema: z.ZodSchema<T>, data: unknown):
  | { ok: true; data: T }
  | { ok: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, data: result.data };
  const msg = result.error.issues.map((i) => i.message).join("; ");
  return { ok: false, error: msg };
}

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const developments = listPublicDevelopments();
  const result = developments.map((dev) => ({
    ...dev,
    condominios: listCondominiosLinkedToDevelopment(dev.id),
  }));

  return NextResponse.json({ developments: result });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const rawBody = await req.json().catch(() => null);
  const parsed = parseZod(LinkSchema, rawBody);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    linkCondominioToDevelopment(parsed.data.developmentId, parsed.data.condominioId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al vincular";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const rawBody = await req.json().catch(() => null);
  const parsed = parseZod(LinkSchema, rawBody);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  unlinkCondominioFromDevelopment(parsed.data.developmentId, parsed.data.condominioId);
  return NextResponse.json({ ok: true });
}
