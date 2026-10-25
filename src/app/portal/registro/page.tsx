import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portal/auth";
import { listPublicCondominios, listPublicDevelopments } from "@/lib/portal/catalog";
import { PortalAccessClient } from "@/components/portal/PortalAccessClient";

export const dynamic = "force-dynamic";

export default async function PortalRegistroPage() {
  const user = await getPortalUser();
  if (user) {
    redirect("/portal/inicio");
  }
  return (
    <PortalAccessClient
      mode="register"
      initialDevelopments={listPublicDevelopments()}
      initialCondominios={listPublicCondominios()}
    />
  );
}
