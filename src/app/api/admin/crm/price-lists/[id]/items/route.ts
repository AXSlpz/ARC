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
import { listPriceLists, upsertPriceListItem } from "@/lib/crm/products";
import { PriceListItemSchema } from "@/lib/crm/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  const auth = await requireCrmWrite();
  if (isAuthError(auth)) return auth;
  const parsed = parseCrmBody(PriceListItemSchema, await readJsonBody(req));
  if (!parsed.ok) return parsed.response;
  try {
    const id = parsePositiveId((await params).id);
    upsertPriceListItem(id, parsed.data.product_id, parsed.data.unit_price);
    logAudit(auth.id, auth.username, "crm.price_list.item", "crm_price_list", id, {
      product_id: parsed.data.product_id,
    });
    return NextResponse.json({ priceLists: listPriceLists() });
  } catch (err) {
    return crmFail(err);
  }
}
