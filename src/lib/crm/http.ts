import { NextRequest, NextResponse } from "next/server";
import { can, isAuthError, requireAuth, requirePermission } from "@/lib/auth";
import type { Permission } from "@/lib/permissions";
import { parseBody } from "@/lib/validation";
import type { z } from "zod";
import { CrmError } from "./errors";

export async function requireCrmRead(permission: Permission) {
  return requirePermission(permission);
}

export async function requireCrmWrite() {
  const user = await requireAuth();
  if (isAuthError(user)) return user;
  if (!can(user, "crm_write")) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }
  return user;
}

export function parsePositiveId(raw: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new CrmError("Identificador inválido", 400);
  }
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    throw new CrmError("Identificador inválido", 400);
  }
  return id;
}

export async function readJsonBody(req: NextRequest): Promise<unknown> {
  return req.json().catch(() => null);
}

export function parseCrmBody<T extends z.ZodTypeAny>(schema: T, body: unknown) {
  const parsed = parseBody(schema, body);
  if (!parsed.success) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: parsed.error }, { status: 400 }),
    };
  }
  return { ok: true as const, data: parsed.data };
}

export function crmFail(err: unknown): NextResponse {
  if (err instanceof CrmError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  return NextResponse.json(
    { error: "No se pudo completar la operación" },
    { status: 500 },
  );
}
