import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portal/auth";
import { PortalInicioClient } from "@/components/portal/PortalInicioClient";

export const dynamic = "force-dynamic";

export default async function PortalInicioPage() {
  const user = await getPortalUser();
  if (!user) {
    redirect("/portal");
  }
  return <PortalInicioClient user={user} />;
}
