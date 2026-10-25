import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portal/auth";
import { PortalAccessClient } from "@/components/portal/PortalAccessClient";

export const dynamic = "force-dynamic";

export default async function PortalAccessPage() {
  const user = await getPortalUser();
  if (user) {
    redirect("/portal/inicio");
  }
  return <PortalAccessClient mode="login" />;
}
