import { NextResponse } from "next/server";
import { isPortalAuthError, requirePortalUser } from "@/lib/portal/auth";

export const dynamic = "force-dynamic";

/** La INE ya no se reemplaza con un solo archivo. El perfil lee frente y reverso. */
export async function POST() {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;
  return NextResponse.json(
    { error: "La INE se actualiza en Mi perfil, con el frente y el reverso." },
    { status: 410 }
  );
}
