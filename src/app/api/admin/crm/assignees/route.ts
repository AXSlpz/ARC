import { NextResponse } from "next/server";
import { isAuthError } from "@/lib/auth";
import { listAdminUsers } from "@/lib/admin-settings";
import { requireCrmRead } from "@/lib/crm/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireCrmRead("crm_pipelines");
  if (isAuthError(auth)) return auth;
  const users = listAdminUsers().map((user) => ({
    id: user.id,
    name: user.displayName?.trim() || user.username,
  }));
  return NextResponse.json({ users });
}
