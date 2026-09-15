import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { deleteEntry } from "@/lib/portal/finance";
import { logAudit } from "@/lib/audit";

interface Ctx {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const { id } = await params;
  const entryId = parseInt(id, 10);
  const deleted = deleteEntry(entryId);
  if (deleted) {
    logAudit(auth.id, auth.username, "finance.delete", "finance_entry", entryId, {});
  }
  return NextResponse.json({ deleted });
}
