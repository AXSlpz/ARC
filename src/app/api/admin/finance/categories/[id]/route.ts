import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { deleteCategory } from "@/lib/portal/finance";

interface Ctx {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const { id } = await params;
  const deleted = deleteCategory(parseInt(id, 10));
  return NextResponse.json({ deleted, deactivated: !deleted });
}
