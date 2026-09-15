import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import db from "../db.js";
import { insertMessage } from "../db.js";
import { broadcastDashboard, broadcastTicketEvent } from "../ws-notify.js";
import { sendHumanLikeText } from "../human-timing.js";
import { isAffirmativeReply, isNegativeReply } from "../handoff.js";
import {
  addComment,
  changeStatus,
  getActiveTicketsByPhone,
  getTicketById,
  setTicketAwaiting,
} from "../portal/tickets.js";
import { storeAttachment } from "../portal/attachments.js";
import {
  clearWaTicketState,
  getWaTicketState,
  setWaTicketState,
} from "../portal/wa-ticket-state.js";
import type { Ticket } from "../portal/types.js";
import type { WaTransport } from "../wa/types.js";

export interface TicketRouterParams {
  transport: WaTransport;
  jid: string;
  conversationId: number;
  contactPhone: string;
  text: string;
}

const KEYWORDS =
  /(solicitud|ticket|tr[aá]mite|folio|estatus|estado|avance|autoriz|carta|cancel|confirm|tanque|instalaci[oó]n|arc-?\d+)/i;

function normalizeFolio(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function matchByFolio(text: string, tickets: Ticket[]): Ticket | null {
  const norm = normalizeFolio(text);
  const digits = (text.match(/\d+/g) ?? []).join("");
  return (
    tickets.find((t) => norm.includes(normalizeFolio(t.folio))) ??
    tickets.find((t) => {
      const folioDigits = t.folio.replace(/\D/g, "");
      return digits.length >= 3 && folioDigits.endsWith(digits);
    }) ??
    null
  );
}

function looksAboutTicket(text: string): boolean {
  return KEYWORDS.test(text);
}

function folioList(tickets: Ticket[]): string {
  return tickets.map((t) => `• ${t.folio} (${t.ticketTypeName ?? "solicitud"})`).join("\n");
}

function statusSummary(t: Ticket): string {
  const labels: Record<string, string> = {
    nuevo: "Nuevo",
    en_revision: "En revisión",
    autorizado: "Autorizado",
    rechazado: "Rechazado",
    en_proceso: "En proceso",
    completado: "Completado",
    cerrado: "Cerrado",
    cancelado: "Cancelado",
  };
  return `Tu solicitud *${t.folio}* está en estatus *${labels[t.status] ?? t.status}*.`;
}

function menuText(t: Ticket): string {
  return `¿Qué deseas hacer con *${t.folio}*?\nResponde *1* para *cancelar* la solicitud, *2* para *confirmar* que tus datos son correctos, o escribe tu mensaje para dejar un comentario a la administración.`;
}

async function reply(
  transport: WaTransport,
  jid: string,
  conversationId: number,
  text: string
): Promise<void> {
  await sendHumanLikeText(transport, jid, text);
  insertMessage(conversationId, "assistant", text);
  broadcastDashboard("conversations");
}

function notifyClientAction(
  t: Ticket,
  kind: "comment" | "status",
  toStatus?: string
): void {
  broadcastTicketEvent({
    ticketId: t.id,
    portalUserId: t.portalUserId,
    folio: t.folio,
    actor: "client",
    kind,
    toStatus,
  });
}

/** Autor visible en portal + admin: deja claro que vino por WhatsApp. */
function waClientAuthorName(t: Ticket): string {
  const base = t.clientName?.trim() || "Cliente";
  return `${base} (WhatsApp)`;
}

function getLatestUserImagePath(conversationId: number): string | null {
  const row = db
    .prepare(
      `SELECT media_path FROM messages
       WHERE conversation_id = ? AND media_type = 'image' AND media_path IS NOT NULL
       ORDER BY id DESC LIMIT 1`
    )
    .get(conversationId) as { media_path: string | null } | undefined;
  return row?.media_path ?? null;
}

/**
 * Adjunta al ticket la última imagen recibida y la deja visible en el chat
 * del ticket (comentario del cliente + adjunto vinculado).
 */
async function attachLatestImage(
  conversationId: number,
  ticket: Ticket,
  commentBody?: string | null
): Promise<boolean> {
  const path = getLatestUserImagePath(conversationId);
  if (!path || !existsSync(path)) return false;
  try {
    const bytes = await readFile(path);
    const body =
      (commentBody?.trim() &&
      !/^\[Imagen del cliente\]/i.test(commentBody.trim())
        ? commentBody.trim()
        : null) ?? "Archivo enviado por WhatsApp";
    const comment = addComment({
      ticketId: ticket.id,
      authorType: "client",
      authorName: waClientAuthorName(ticket),
      body,
    });
    const res = await storeAttachment({
      ticketId: ticket.id,
      commentId: comment?.id ?? null,
      uploaderType: "client",
      originalName: "whatsapp.jpg",
      declaredMime: "image/jpeg",
      bytes,
    });
    if (res.ok) {
      notifyClientAction(ticket, "comment");
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Enrutador de mensajes entrantes hacia tickets activos del cliente/residente.
 * Devuelve `true` si consumió el mensaje (no debe seguir el flujo normal del bot).
 */
export async function handleIncomingTicketMessage(
  params: TicketRouterParams
): Promise<boolean> {
  const { transport, jid, conversationId, contactPhone, text } = params;
  const trimmed = text.trim();
  if (!trimmed) return false;

  const state = getWaTicketState(conversationId);
  const active = getActiveTicketsByPhone(contactPhone);

  // ── Estado: elegir folio (varios tickets activos) ──────────────────
  if (state?.mode === "choose_folio") {
    const chosen = matchByFolio(trimmed, active);
    if (!chosen) {
      await reply(
        transport,
        jid,
        conversationId,
        `No reconocí el folio. Responde con uno de tus folios activos:\n${folioList(active)}`
      );
      return true;
    }
    setWaTicketState(conversationId, "menu", chosen.id);
    await reply(transport, jid, conversationId, `${statusSummary(chosen)}\n\n${menuText(chosen)}`);
    return true;
  }

  // ── Estado: confirmar si es sobre el ticket ────────────────────────
  if (state?.mode === "confirm" && state.ticketId) {
    if (isAffirmativeReply(trimmed)) {
      if (active.length > 1) {
        setWaTicketState(conversationId, "choose_folio", null);
        await reply(
          transport,
          jid,
          conversationId,
          `¿Sobre cuál solicitud? Responde con el folio:\n${folioList(active)}`
        );
        return true;
      }
      const t = getTicketById(state.ticketId);
      if (!t) {
        clearWaTicketState(conversationId);
        return false;
      }
      setWaTicketState(conversationId, "menu", t.id);
      await reply(transport, jid, conversationId, `${statusSummary(t)}\n\n${menuText(t)}`);
      return true;
    }
    if (isNegativeReply(trimmed)) {
      clearWaTicketState(conversationId);
      return false; // dejar que el bot responda dudas generales
    }
    await reply(
      transport,
      jid,
      conversationId,
      "Por favor responde *sí* o *no*: ¿tu mensaje es sobre tu solicitud activa?"
    );
    return true;
  }

  // ── Estado: menú guiado (cancelar / confirmar / comentario) ────────
  if (state?.mode === "menu" && state.ticketId) {
    const t = getTicketById(state.ticketId);
    if (!t) {
      clearWaTicketState(conversationId);
      return false;
    }
    if (/^\s*1\s*$/.test(trimmed) || /cancel/i.test(trimmed)) {
      changeStatus({
        ticketId: t.id,
        toStatus: "cancelado",
        changedBy: "cliente (WhatsApp)",
        note: "Cancelado por el cliente vía WhatsApp",
      });
      setTicketAwaiting(t.id, "none");
      notifyClientAction(t, "status", "cancelado");
      clearWaTicketState(conversationId);
      await reply(
        transport,
        jid,
        conversationId,
        `Listo, tu solicitud *${t.folio}* fue *cancelada*. Si fue un error, puedes crear una nueva desde el portal.`
      );
      return true;
    }
    if (/^\s*2\s*$/.test(trimmed) || /confirm/i.test(trimmed)) {
      addComment({
        ticketId: t.id,
        authorType: "client",
        authorName: waClientAuthorName(t),
        body: "El cliente confirmó por WhatsApp que sus datos son correctos.",
      });
      setTicketAwaiting(t.id, "none");
      notifyClientAction(t, "comment");
      clearWaTicketState(conversationId);
      await reply(
        transport,
        jid,
        conversationId,
        `Gracias, registré tu confirmación en la solicitud *${t.folio}*.`
      );
      return true;
    }
    // Texto y/o archivo → quedan en el chat del ticket.
    const attached = await attachLatestImage(conversationId, t, trimmed);
    if (!attached) {
      addComment({
        ticketId: t.id,
        authorType: "client",
        authorName: waClientAuthorName(t),
        body: trimmed,
      });
      notifyClientAction(t, "comment");
    }
    setTicketAwaiting(t.id, "none");
    clearWaTicketState(conversationId);
    await reply(
      transport,
      jid,
      conversationId,
      attached
        ? `Recibí tu archivo para la solicitud *${t.folio}*. ¡Gracias!`
        : `Registré tu mensaje en la solicitud *${t.folio}*. La administración te responderá pronto.`
    );
    return true;
  }

  // ── Sin estado previo ──────────────────────────────────────────────
  if (active.length === 0) return false; // sin tickets activos → flujo normal

  // Si algún ticket espera respuesta del cliente, este mensaje ES la respuesta.
  const awaiting = active.find((t) => t.awaitingKind !== "none");
  if (awaiting) {
    if (awaiting.awaitingKind === "file") {
      const attached = await attachLatestImage(conversationId, awaiting, trimmed);
      if (attached) {
        setTicketAwaiting(awaiting.id, "none");
        await reply(
          transport,
          jid,
          conversationId,
          `Recibí tu archivo para la solicitud *${awaiting.folio}*. ¡Gracias!`
        );
        return true;
      }
      // No mandó imagen: registrar texto y guiar para documentos.
      if (trimmed) {
        addComment({
          ticketId: awaiting.id,
          authorType: "client",
          authorName: waClientAuthorName(awaiting),
          body: trimmed,
        });
        notifyClientAction(awaiting, "comment");
      }
      await reply(
        transport,
        jid,
        conversationId,
        `Para la solicitud *${awaiting.folio}* necesitamos un archivo. Envía una *foto* por aquí, o sube documentos (PDF/Word) desde tu portal por seguridad.`
      );
      return true;
    }
    // info / answer
    const attached = await attachLatestImage(conversationId, awaiting, trimmed);
    if (!attached) {
      addComment({
        ticketId: awaiting.id,
        authorType: "client",
        authorName: waClientAuthorName(awaiting),
        body: trimmed,
      });
      notifyClientAction(awaiting, "comment");
    }
    setTicketAwaiting(awaiting.id, "none");
    await reply(
      transport,
      jid,
      conversationId,
      attached
        ? `Recibí tu archivo para la solicitud *${awaiting.folio}*. ¡Gracias!`
        : `Gracias, registré tu respuesta en la solicitud *${awaiting.folio}*.`
    );
    return true;
  }

  // ¿El mensaje parece ser sobre el ticket?
  if (looksAboutTicket(trimmed)) {
    const target = matchByFolio(trimmed, active) ?? (active.length === 1 ? active[0]! : null);
    if (!target) {
      setWaTicketState(conversationId, "choose_folio", null);
      await reply(
        transport,
        jid,
        conversationId,
        `¿Sobre cuál solicitud? Responde con el folio:\n${folioList(active)}`
      );
      return true;
    }
    const attached = await attachLatestImage(conversationId, target, trimmed);
    if (!attached) {
      addComment({
        ticketId: target.id,
        authorType: "client",
        authorName: waClientAuthorName(target),
        body: trimmed,
      });
      notifyClientAction(target, "comment");
    }
    setWaTicketState(conversationId, "menu", target.id);
    await reply(
      transport,
      jid,
      conversationId,
      attached
        ? `Recibí tu archivo para la solicitud *${target.folio}*.\n\n${menuText(target)}`
        : `${statusSummary(target)}\n\n${menuText(target)}`
    );
    return true;
  }

  // No parece del ticket → preguntar (desambiguación).
  const ref = active[0]!;
  setWaTicketState(conversationId, "confirm", ref.id);
  const prompt =
    active.length > 1
      ? `Tienes solicitudes activas:\n${folioList(active)}\n¿Tu mensaje es sobre alguna de ellas? Responde *sí* o *no*.`
      : `Veo que tienes la solicitud *${ref.folio}* activa. ¿Tu mensaje es sobre ella? Responde *sí* o *no*.`;
  await reply(transport, jid, conversationId, prompt);
  return true;
}
