import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import {
  createServiceType,
  listServiceTypes,
} from "@/lib/service-schedules";
import { parseBody, ServiceTypeSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const includeInactive =
    new URL(req.url).searchParams.get("all") === "1";
  return NextResponse.json(listServiceTypes(!includeInactive));
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const body = await req.json();
  const parsed = parseBody(ServiceTypeSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const created = createServiceType(parsed.data);
    logAudit(auth.id, auth.username, "service_type.create", "service_type", created.id, {
      name: created.name,
      slug: created.slug,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al crear tipo" },
      { status: 400 }
    );
  }
}
