import { NextRequest, NextResponse } from "next/server";
import { isAuthError } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  crmFail,
  parseCrmBody,
  readJsonBody,
  requireCrmRead,
  requireCrmWrite,
} from "@/lib/crm/http";
import { createProspecto, listProspectos } from "@/lib/crm/prospectos";
import { ProspectoCreateSchema } from "@/lib/crm/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireCrmRead("crm_prospectos");
  if (isAuthError(auth)) return auth;

  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? undefined;
  const page = Number(url.searchParams.get("page") ?? "1");
  const limit = Number(url.searchParams.get("limit") ?? "20");
  return NextResponse.json(
    listProspectos({
      search,
      page: Number.isFinite(page) ? page : 1,
      limit: Number.isFinite(limit) ? limit : 20,
    }),
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireCrmWrite();
  if (isAuthError(auth)) return auth;

  const parsed = parseCrmBody(ProspectoCreateSchema, await readJsonBody(req));
  if (!parsed.ok) return parsed.response;

  try {
    const prospecto = createProspecto(parsed.data);
    logAudit(auth.id, auth.username, "crm.prospecto.create", "crm_prospecto", prospecto.id, {
      name: prospecto.name,
    });
    return NextResponse.json(prospecto, { status: 201 });
  } catch (err) {
    return crmFail(err);
  }
}
