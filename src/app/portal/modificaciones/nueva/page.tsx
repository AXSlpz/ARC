import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portal/auth";
import { buildPortalModificationCatalog } from "@/lib/portal/modification-catalog";
import { ModificationWizard } from "@/components/portal/wizard/ModificationWizard";

export const dynamic = "force-dynamic";

export default async function NuevaModificacionPage() {
  const user = await getPortalUser();
  if (!user) {
    redirect("/portal");
  }
  const initialCatalog = buildPortalModificationCatalog(user.id);
  return <ModificationWizard user={user} initialCatalog={initialCatalog} />;
}
