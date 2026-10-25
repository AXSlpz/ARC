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
import { deleteProduct, getProduct, updateProduct } from "@/lib/crm/products";
import { ProductUpdateSchema } from "@/lib/crm/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireCrmRead("crm_catalog");
  if (isAuthError(auth)) return auth;
  try {
    const product = getProduct(parsePositiveId((await params).id));
    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ product });
  } catch (err) {
    return crmFail(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireCrmWrite();
  if (isAuthError(auth)) return auth;
  const parsed = parseCrmBody(ProductUpdateSchema, await readJsonBody(req));
  if (!parsed.ok) return parsed.response;
  try {
    const id = parsePositiveId((await params).id);
    const product = updateProduct(id, parsed.data);
    logAudit(auth.id, auth.username, "crm.product.update", "crm_product", id, {
      fields: Object.keys(parsed.data),
    });
    return NextResponse.json({ product });
  } catch (err) {
    return crmFail(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireCrmWrite();
  if (isAuthError(auth)) return auth;
  try {
    const id = parsePositiveId((await params).id);
    const result = deleteProduct(id);
    logAudit(auth.id, auth.username, "crm.product.delete", "crm_product", id);
    if (result) return NextResponse.json({ product: result });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return crmFail(err);
  }
}
