import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portal/auth";
import {
  listServicesForPortal,
  getPortalPriceListId,
  getDefaultPriceListId,
} from "@/lib/portal/services-catalog";
import { listTicketTypes } from "@/lib/portal/ticket-types";
import { ServiciosCatalogClient } from "@/components/portal/ServiciosCatalogClient";

export const dynamic = "force-dynamic";

export default async function ServiciosPage() {
  const user = await getPortalUser();
  if (!user) {
    redirect("/portal");
  }

  // Selección determinista de lista de precios
  const defaultId = getDefaultPriceListId() ?? 0;
  const priceListId = getPortalPriceListId(defaultId);

  let services: import("@/lib/portal/services-catalog").ServiceCatalogItem[] = [];
  try {
    services = listServicesForPortal(priceListId);
  } catch {
    services = [];
  }

  // Obtener ticket type 'servicio-arc' activo
  const ticketTypes = listTicketTypes({ activeOnly: true });
  const serviceType = ticketTypes.find((t) => t.slug === "servicio-arc") ?? null;

  return (
    <ServiciosCatalogClient
      user={user}
      initialServices={services}
      ticketTypeId={serviceType?.id ?? null}
      priceListId={priceListId}
    />
  );
}
