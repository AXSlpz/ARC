const WS_BROADCAST_URL =
  process.env.WS_BROADCAST_URL ?? "http://127.0.0.1:3001/broadcast";

const WS_SECRET = process.env.WS_SECRET ?? "";

export type DashboardEvent =
  | "conversations"
  | "messages"
  | "connection"
  | "metrics"
  | "residentes"
  | "ticket"
  | "crm";

export function broadcastDashboard(
  event: DashboardEvent,
  data?: Record<string, unknown>
): void {
  const payload = JSON.stringify({ event, data, ts: Date.now() });

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (WS_SECRET) headers["Authorization"] = `Bearer ${WS_SECRET}`;

  fetch(WS_BROADCAST_URL, {
    method: "POST",
    headers,
    body: payload,
  }).catch(() => {});
}

/**
 * Evento de cambio en un ticket para tiempo real (admin + portal).
 * Payload mínimo por privacidad: NO se envía el contenido de comentarios por el
 * bus compartido; cada receptor refresca vía su API autorizada.
 */
export interface TicketEventData extends Record<string, unknown> {
  ticketId: number;
  portalUserId: number;
  folio: string;
  actor: "client" | "admin";
  kind: "comment" | "status" | "attachment" | "letter" | "created";
  toStatus?: string;
  category?: "solicitud" | "servicio";
}

export function broadcastTicketEvent(data: TicketEventData): void {
  broadcastDashboard("ticket", data);
}
