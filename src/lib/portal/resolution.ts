/**
 * Resolución del comité sobre un ticket de modificación.
 * La decisión y el SLA se guardan primero. Carta y avisos van después
 * y un fallo de correo o WhatsApp no revierte el expediente.
 */
import { createHash } from "node:crypto";
import db from "../db";
import { checkExpediente, getRequiredDocCategories } from "./modification-docs";
import { getCatalogItem } from "./modification-catalog";
import { pauseSla, completeSla, getSlaState } from "./sla";
import { changeStatus, getTicketById, setTicketAwaiting } from "./tickets";
import {
  RESOLUTION_DECISIONS,
  type ResolutionDecision,
  type TicketStatus,
} from "./types";

export interface ReviewChecklistItem {
  key: string;
  label: string;
  present: boolean;
  required: boolean;
}

export interface TicketReview {
  decision: ResolutionDecision | null;
  note: string | null;
  hash: string | null;
  slaStatus: string | null;
  slaTargetAt: number | null;
  documents: ReviewChecklistItem[];
  technical: ReviewChecklistItem[];
}

const STATUS_FOR_DECISION: Record<ResolutionDecision, TicketStatus> = {
  autorizada: "autorizado",
  autorizada_con_condiciones: "autorizado",
  requiere_correcciones: "en_revision",
  no_autorizada: "rechazado",
};

export function isResolutionDecision(value: string): value is ResolutionDecision {
  return (RESOLUTION_DECISIONS as string[]).includes(value);
}

export function getTicketReview(ticketId: number): TicketReview | null {
  const ticket = getTicketById(ticketId);
  if (!ticket) return null;

  const slug = ticket.modificationCatalogId
    ? getCatalogItem(ticket.modificationCatalogId)?.slug ?? ""
    : "";
  const requirements = slug ? getRequiredDocCategories(slug) : [];
  const expediente = slug ? checkExpediente(ticketId, slug) : null;

  let signature = false;
  try {
    const row = db
      .prepare(
        `SELECT id FROM request_signatures
         WHERE ticket_id = ? ORDER BY id DESC LIMIT 1`
      )
      .get(ticketId) as { id: number } | undefined;
    signature = Boolean(row);
  } catch {
    signature = false;
  }

  const sla = getSlaState(ticketId);

  return {
    decision: ticket.resolutionDecision ?? null,
    note: ticket.resolutionNote ?? null,
    hash: ticket.resolutionHash ?? null,
    slaStatus: sla?.slaStatus ?? ticket.slaStatus ?? null,
    slaTargetAt: sla?.slaTargetAt ?? ticket.slaTargetAt ?? null,
    documents: requirements.map((item) => ({
      key: item.category,
      label: item.label,
      present: expediente?.uploaded.includes(item.category) ?? false,
      required: item.required,
    })),
    technical: [
      {
        key: "firma_propietario",
        label: "Firma del propietario",
        present: signature,
        required: ticket.requestKind === "modification",
      },
      {
        key: "expediente",
        label: "Expediente documental completo",
        present: Boolean(expediente?.complete),
        required: ticket.requestKind === "modification",
      },
    ],
  };
}

export type ApplyResolutionResult =
  | { ok: true; ticketId: number; decision: ResolutionDecision; hash: string }
  | { ok: false; error: string };

export function applyResolution(input: {
  ticketId: number;
  decision: ResolutionDecision;
  note?: string | null;
  changedBy: string;
}): ApplyResolutionResult {
  const ticket = getTicketById(input.ticketId);
  if (!ticket) return { ok: false, error: "No encontrado" };
  if (ticket.status === "held") {
    return {
      ok: false,
      error: "La cuenta del cliente sigue en verificación. La solicitud permanece en espera.",
    };
  }

  const note = (input.note ?? "").trim().slice(0, 2000);
  if (
    (input.decision === "autorizada_con_condiciones" ||
      input.decision === "requiere_correcciones" ||
      input.decision === "no_autorizada") &&
    note.length < 3
  ) {
    return {
      ok: false,
      error: "Escribe las condiciones, correcciones o el motivo (mínimo 3 caracteres).",
    };
  }

  const hash = createHash("sha256")
    .update(`${ticket.folio}|${input.decision}|${note}|${ticket.id}`)
    .digest("hex");

  const toStatus = STATUS_FOR_DECISION[input.decision];

  db.prepare(
    `UPDATE tickets
     SET resolution_decision = ?, resolution_note = ?, resolution_hash = ?, updated_at = unixepoch()
     WHERE id = ?`
  ).run(input.decision, note || null, hash, input.ticketId);

  const updated = changeStatus({
    ticketId: input.ticketId,
    toStatus,
    changedBy: input.changedBy,
    note: note || RESOLUTION_LABEL(input.decision),
  });
  if (!updated) return { ok: false, error: "No se pudo actualizar el estatus." };

  if (input.decision === "requiere_correcciones") {
    setTicketAwaiting(input.ticketId, "info", note);
    pauseSla(input.ticketId, {
      reason: "En espera de correcciones del cliente",
      createdBy: input.changedBy,
    });
  } else {
    setTicketAwaiting(input.ticketId, "none");
    completeSla(input.ticketId, { createdBy: input.changedBy });
  }

  return { ok: true, ticketId: input.ticketId, decision: input.decision, hash };
}

function RESOLUTION_LABEL(decision: ResolutionDecision): string {
  if (decision === "autorizada") return "Autorizada";
  if (decision === "autorizada_con_condiciones") return "Autorizada con condiciones";
  if (decision === "requiere_correcciones") return "Requiere correcciones";
  return "No autorizada";
}
