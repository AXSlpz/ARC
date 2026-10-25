import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portal/auth";
import { getTicketById, getTicketComments } from "@/lib/portal/tickets";
import { TicketDetailClient } from "@/components/portal/TicketDetailClient";

export const dynamic = "force-dynamic";

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getPortalUser();
  if (!user) {
    redirect("/portal");
  }

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  if (!Number.isInteger(ticketId)) {
    return (
      <TicketDetailClient
        userId={user.id}
        initialTicket={null}
        initialError="Solicitud no encontrada"
      />
    );
  }

  const ticket = getTicketById(ticketId);
  if (!ticket || ticket.portalUserId !== user.id) {
    return (
      <TicketDetailClient
        userId={user.id}
        initialTicket={null}
        initialError="Solicitud no encontrada"
      />
    );
  }

  ticket.comments = getTicketComments(ticketId, { includeInternal: false });
  return <TicketDetailClient userId={user.id} initialTicket={ticket} />;
}
