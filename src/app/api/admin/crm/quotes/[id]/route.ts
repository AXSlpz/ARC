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
import { getQuote, updateQuote } from "@/lib/crm/quotes";
import { QuoteUpdateSchema } from "@/lib/crm/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireCrmRead("crm_quotes");
  if (isAuthError(auth)) return auth;
  try {
    const quote = getQuote(parsePositiveId((await params).id));
    if (!quote) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
    }
    return NextResponse.json({ quote });
  } catch (err) {
    return crmFail(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireCrmWrite();
  if (isAuthError(auth)) return auth;
  const parsed = parseCrmBody(QuoteUpdateSchema, await readJsonBody(req));
  if (!parsed.ok) return parsed.response;
  try {
    const id = parsePositiveId((await params).id);
    const quote = updateQuote(id, parsed.data);
    logAudit(auth.id, auth.username, "crm.quote.update", "crm_quote", id, {
      fields: Object.keys(parsed.data),
    });
    return NextResponse.json({ quote });
  } catch (err) {
    return crmFail(err);
  }
}
