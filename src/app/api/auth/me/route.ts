import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { listEnabledModules } from "@/lib/app-modules";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return NextResponse.json({
    user: { ...user, enabledModules: listEnabledModules(user.role) },
  });
}
