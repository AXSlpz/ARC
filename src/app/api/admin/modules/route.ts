import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { isRateLimited } from "@/lib/rate-limit";
import {
  isAppModuleKey,
  isModuleRole,
  listModuleMatrix,
  setModuleEnabled,
} from "@/lib/app-modules";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  role: z.enum(["super_admin", "admin"]),
  module: z.string().min(1).max(40),
  enabled: z.boolean(),
});

export async function GET(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth || !isSuperAdmin(auth.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (isRateLimited(`admin-modules:${auth.id}:${ip}`, 60, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Demasiados intentos" }, { status: 429 });
  }
  return NextResponse.json({ modules: listModuleMatrix() });
}

export async function PATCH(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth || !isSuperAdmin(auth.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (isRateLimited(`admin-modules-write:${auth.id}:${ip}`, 40, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Demasiados intentos" }, { status: 429 });
  }

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  if (!isModuleRole(body.role) || !isAppModuleKey(body.module)) {
    return NextResponse.json({ error: "Módulo o perfil inválido" }, { status: 400 });
  }

  try {
    setModuleEnabled(body.role, body.module, body.enabled);
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo guardar";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  logAudit(auth.id, auth.username, "module.toggle", "role_module", null, {
    role: body.role,
    module: body.module,
    enabled: body.enabled,
  });

  return NextResponse.json({ modules: listModuleMatrix() });
}
