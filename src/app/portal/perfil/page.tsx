import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portal/auth";
import { PortalProfileClient } from "@/components/portal/PortalProfileClient";

export const dynamic = "force-dynamic";

export default async function PortalProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ cuenta?: string }>;
}) {
  const user = await getPortalUser();
  if (!user) {
    redirect("/portal");
  }
  const params = await searchParams;
  return (
    <PortalProfileClient
      initialUser={user}
      justCreated={params.cuenta === "nueva"}
    />
  );
}
