import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portal/auth";
import { listTicketsForUser } from "@/lib/portal/tickets";
import { TicketsListClient } from "@/components/portal/TicketsListClient";

export const dynamic = "force-dynamic";

export default async function TicketsListPage() {
  const user = await getPortalUser();
  if (!user) {
    redirect("/portal");
  }

  try {
    const tickets = listTicketsForUser(user.id);
    return <TicketsListClient userId={user.id} initialTickets={tickets} />;
  } catch {
    return (
      <TicketsListClient
        userId={user.id}
        initialTickets={[]}
        initialError="No se pudieron cargar tus solicitudes"
      />
    );
  }
}
