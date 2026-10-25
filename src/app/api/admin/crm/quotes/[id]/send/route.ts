import { NextRequest, NextResponse } from "next/server";
import { isAuthError } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { crmFail, parsePositiveId, requireCrmWrite } from "@/lib/crm/http";
import { sendQuote } from "@/lib/crm/quote-send";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const auth = await requireCrmWrite();
  if (isAuthError(auth)) return auth;
  try {
    const id = parsePositiveId((await params).id);
    const quote = await sendQuote(id);
    logAudit(auth.id, auth.username, "crm.quote.send", "crm_quote", id, {
      number: quote.number,
    });
    return NextResponse.json({ quote });
  } catch (err) {
    return crmFail(err);
  }
}
