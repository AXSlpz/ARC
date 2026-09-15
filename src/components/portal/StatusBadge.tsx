import type { TicketStatus } from "@/lib/portal/types";
import { STATUS_BADGE_CLASSES, statusLabel } from "./portalClient";

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[status] ?? "bg-slate-100 text-slate-700 border-slate-200"}`}
    >
      {statusLabel(status)}
    </span>
  );
}
