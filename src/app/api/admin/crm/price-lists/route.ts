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
import { createPriceList, listPriceLists } from "@/lib/crm/products";
import { PriceListCreateSchema } from "@/lib/crm/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireCrmRead("crm_catalog");
  if (isAuthError(auth)) return auth;
  return NextResponse.json({ priceLists: listPriceLists() });
}

export async function POST(req: NextRequest) {
  const auth = await requireCrmWrite();
  if (isAuthError(auth)) return auth;
  const parsed = parseCrmBody(PriceListCreateSchema, await readJsonBody(req));
  if (!parsed.ok) return parsed.response;
  try {
    const priceList = createPriceList(parsed.data);
    logAudit(auth.id, auth.username, "crm.price_list.create", "crm_price_list", priceList.id, {
      name: priceList.name,
    });
    return NextResponse.json({ priceLists: listPriceLists() }, { status: 201 });
  } catch (err) {
    return crmFail(err);
  }
}
