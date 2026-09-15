import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { listAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  return NextResponse.json(listAuditLog(150));
}
