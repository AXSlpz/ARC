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
import { deletePriceList, listPriceLists, updatePriceList } from "@/lib/crm/products";
import { PriceListUpdateSchema } from "@/lib/crm/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireCrmWrite();
  if (isAuthError(auth)) return auth;
  const parsed = parseCrmBody(PriceListUpdateSchema, await readJsonBody(req));
  if (!parsed.ok) return parsed.response;
  try {
    const id = parsePositiveId((await params).id);
    updatePriceList(id, parsed.data);
    logAudit(auth.id, auth.username, "crm.price_list.update", "crm_price_list", id, {
      fields: Object.keys(parsed.data),
    });
    return NextResponse.json({ priceLists: listPriceLists() });
  } catch (err) {
    return crmFail(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireCrmWrite();
  if (isAuthError(auth)) return auth;
  try {
    const id = parsePositiveId((await params).id);
    deletePriceList(id);
    logAudit(auth.id, auth.username, "crm.price_list.delete", "crm_price_list", id);
    return NextResponse.json({ priceLists: listPriceLists() });
  } catch (err) {
    return crmFail(err);
  }
}
