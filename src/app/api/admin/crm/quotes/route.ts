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
import { createQuote, listQuotes } from "@/lib/crm/quotes";
import { QuoteCreateSchema } from "@/lib/crm/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireCrmRead("crm_quotes");
  if (isAuthError(auth)) return auth;
  const url = new URL(req.url);
  return NextResponse.json({
    quotes: listQuotes({
      status: url.searchParams.get("status") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
    }),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireCrmWrite();
  if (isAuthError(auth)) return auth;
  const parsed = parseCrmBody(QuoteCreateSchema, await readJsonBody(req));
  if (!parsed.ok) return parsed.response;
  try {
    const quote = createQuote(parsed.data);
    logAudit(auth.id, auth.username, "crm.quote.create", "crm_quote", quote.id, {
      number: quote.number,
    });
    return NextResponse.json({ quote }, { status: 201 });
  } catch (err) {
    return crmFail(err);
  }
}
