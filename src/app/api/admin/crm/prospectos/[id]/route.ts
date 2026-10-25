import { NextRequest, NextResponse } from "next/server";
import { isAuthError } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  crmFail,
  parseCrmBody,
  parsePositiveId,
  readJsonBody,
  requireCrmRead,
  requireCrmWrite,
} from "@/lib/crm/http";
import {
  deleteProspecto,
  getProspecto,
  updateProspecto,
} from "@/lib/crm/prospectos";
import { ProspectoUpdateSchema } from "@/lib/crm/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireCrmRead("crm_prospectos");
  if (isAuthError(auth)) return auth;
  try {
    const prospecto = getProspecto(parsePositiveId((await params).id));
    if (!prospecto) {
      return NextResponse.json({ error: "Prospecto no encontrado" }, { status: 404 });
    }
    return NextResponse.json(prospecto);
  } catch (err) {
    return crmFail(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireCrmWrite();
  if (isAuthError(auth)) return auth;
  const parsed = parseCrmBody(ProspectoUpdateSchema, await readJsonBody(req));
  if (!parsed.ok) return parsed.response;
  try {
    const id = parsePositiveId((await params).id);
    const prospecto = updateProspecto(id, parsed.data);
    logAudit(auth.id, auth.username, "crm.prospecto.update", "crm_prospecto", id, {
      fields: Object.keys(parsed.data),
    });
    return NextResponse.json(prospecto);
  } catch (err) {
    return crmFail(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireCrmWrite();
  if (isAuthError(auth)) return auth;
  try {
    const id = parsePositiveId((await params).id);
    deleteProspecto(id);
    logAudit(auth.id, auth.username, "crm.prospecto.delete", "crm_prospecto", id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return crmFail(err);
  }
}
