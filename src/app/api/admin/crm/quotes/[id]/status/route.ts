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
import { changeQuoteStatus } from "@/lib/crm/quotes";
import { QuoteStatusSchema } from "@/lib/crm/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireCrmWrite();
  if (isAuthError(auth)) return auth;
  const parsed = parseCrmBody(QuoteStatusSchema, await readJsonBody(req));
  if (!parsed.ok) return parsed.response;
  try {
    const id = parsePositiveId((await params).id);
    const quote = changeQuoteStatus(id, parsed.data.status);
    logAudit(auth.id, auth.username, "crm.quote.status", "crm_quote", id, {
      status: quote.status,
    });
    return NextResponse.json({ quote });
  } catch (err) {
    return crmFail(err);
  }
}
