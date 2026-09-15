import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/portal/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getPortalUser();
  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  return NextResponse.json({ user });
}
