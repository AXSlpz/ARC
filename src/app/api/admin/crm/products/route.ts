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
import { createProduct, listProducts } from "@/lib/crm/products";
import { ProductCreateSchema } from "@/lib/crm/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireCrmRead("crm_catalog");
  if (isAuthError(auth)) return auth;
  const url = new URL(req.url);
  return NextResponse.json({
    products: listProducts({
      search: url.searchParams.get("search") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    }),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireCrmWrite();
  if (isAuthError(auth)) return auth;
  const parsed = parseCrmBody(ProductCreateSchema, await readJsonBody(req));
  if (!parsed.ok) return parsed.response;
  try {
    const product = createProduct(parsed.data);
    logAudit(auth.id, auth.username, "crm.product.create", "crm_product", product.id, {
      sku: product.sku,
    });
    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    return crmFail(err);
  }
}
