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
import { createDeal, listDeals } from "@/lib/crm/pipelines";
import { DealCreateSchema } from "@/lib/crm/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireCrmRead("crm_pipelines");
  if (isAuthError(auth)) return auth;
  const raw = new URL(req.url).searchParams.get("pipeline_id");
  try {
    const pipelineId = raw ? parsePositiveId(raw) : undefined;
    return NextResponse.json({ deals: listDeals(pipelineId) });
  } catch (err) {
    return crmFail(err);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireCrmWrite();
  if (isAuthError(auth)) return auth;
  const parsed = parseCrmBody(DealCreateSchema, await readJsonBody(req));
  if (!parsed.ok) return parsed.response;
  try {
    const deal = createDeal(parsed.data);
    logAudit(auth.id, auth.username, "crm.deal.create", "crm_deal", deal.id, {
      title: deal.title,
    });
    return NextResponse.json({ deals: listDeals(deal.pipeline_id) }, { status: 201 });
  } catch (err) {
    return crmFail(err);
  }
}
