/**
 * Legacy: /portal/tickets/new
 * Redirige al nuevo wizard de modificaciones.
 * Compatible con enlaces existentes.
 */
import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portal/auth";

export const dynamic = "force-dynamic";

export default async function NewTicketPage() {
  const user = await getPortalUser();
  if (!user) {
    redirect("/portal");
  }
  redirect("/portal/modificaciones/nueva");
}
