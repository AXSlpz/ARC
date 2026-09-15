import { NextResponse } from "next/server";
import { getAdminSettings } from "@/lib/admin-settings";
import { getCaptivePortalLogoUrl } from "@/lib/branding-logo";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = getAdminSettings();

  return NextResponse.json(
    {
      businessName: settings.businessName,
      logoUrl: getCaptivePortalLogoUrl(settings.logoFilename),
    },
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}
