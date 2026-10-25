import { NextRequest, NextResponse } from "next/server";
import { isAuthError } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  crmFail,
  parseCrmBody,
  parsePositiveId,
  readJsonBody,
  requireCrmWrite,
} from "@/lib/crm/http";
import { deleteDeal, listDeals, updateDeal } from "@/lib/crm/pipelines";
import { DealUpdateSchema } from "@/lib/crm/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireCrmWrite();
  if (isAuthError(auth)) return auth;
  const parsed = parseCrmBody(DealUpdateSchema, await readJsonBody(req));
  if (!parsed.ok) return parsed.response;
  try {
    const id = parsePositiveId((await params).id);
    const deal = updateDeal(id, parsed.data);
    logAudit(auth.id, auth.username, "crm.deal.update", "crm_deal", id, {
      fields: Object.keys(parsed.data),
    });
    return NextResponse.json({ deals: listDeals(deal.pipeline_id) });
  } catch (err) {
    return crmFail(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireCrmWrite();
  if (isAuthError(auth)) return auth;
  try {
    const id = parsePositiveId((await params).id);
    deleteDeal(id);
    logAudit(auth.id, auth.username, "crm.deal.delete", "crm_deal", id);
    return NextResponse.json({ deals: listDeals() });
  } catch (err) {
    return crmFail(err);
  }
}
