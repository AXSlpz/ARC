import type { WaTransport } from "../wa/types.js";
import {
  randomMs,
  randomTypingLeadMs,
  setComposing,
} from "../human-timing.js";

/**
 * Espera tras el ÚLTIMO mensaje del cliente antes de responder.
 * Si llegan más mensajes (Hola / tengo duda / la duda…), el timer se reinicia
 * para juntar el contexto completo.
 */
const MESSAGE_DEBOUNCE_MS = 15_000;

export interface PendingReplyPayload {
  conversationId: number;
  /** Transporte de envío (Baileys o Meta) */
  sock: WaTransport;
  remoteJid: string;
  phone: string;
  pushName: string | null;
  lineId: number;
  texts: string[];
  contactPhone: string | null;
  blockedReply?: string;
}

type ProcessPendingReplyFn = (payload: PendingReplyPayload) => Promise<void>;

interface DebounceState {
  payload: PendingReplyPayload;
  delayMs: number;
  typingLeadMs: number;
  replyTimer: ReturnType<typeof setTimeout>;
  composingTimer: ReturnType<typeof setTimeout> | null;
}

const pendingByConversation = new Map<number, DebounceState>();
let processFn: ProcessPendingReplyFn | null = null;

export function registerPendingReplyProcessor(
  fn: ProcessPendingReplyFn
): void {
  processFn = fn;
}

function clearTimers(state: DebounceState): void {
  clearTimeout(state.replyTimer);
  if (state.composingTimer) clearTimeout(state.composingTimer);
}

export function scheduleDebouncedReply(
  payload: PendingReplyPayload
): void {
  const existing = pendingByConversation.get(payload.conversationId);

  const mergedTexts = existing
    ? [...existing.payload.texts, ...payload.texts]
    : [...payload.texts];

  const mergedPayload: PendingReplyPayload = {
    ...payload,
    // Conservar el mejor contactPhone conocido (MSISDN, no @lid).
    contactPhone:
      payload.contactPhone ?? existing?.payload.contactPhone ?? null,
    texts: mergedTexts,
    blockedReply: payload.blockedReply ?? existing?.payload.blockedReply,
  };

  if (existing) {
    clearTimers(existing);
    setComposing(existing.payload.sock, existing.payload.remoteJid, false).catch(
      () => undefined
    );
  }

  // Siempre 15s desde el último mensaje (+ pequeño jitter si hay más de uno).
  const delayMs =
    MESSAGE_DEBOUNCE_MS + (existing ? randomMs(0, 1_500) : 0);
  const typingLeadMs = randomTypingLeadMs();
  const composingDelayMs = Math.max(0, delayMs - typingLeadMs);

  const composingTimer =
    composingDelayMs > 0
      ? setTimeout(() => {
          void setComposing(mergedPayload.sock, mergedPayload.remoteJid, true);
        }, composingDelayMs)
      : null;

  const replyTimer = setTimeout(() => {
    pendingByConversation.delete(payload.conversationId);
    if (!processFn) return;
    void processFn(mergedPayload).catch((err) => {
      console.error(
        `[bot] Error procesando respuesta diferida (conv ${payload.conversationId})`,
        err
      );
    });
  }, delayMs);

  pendingByConversation.set(payload.conversationId, {
    payload: mergedPayload,
    delayMs,
    typingLeadMs,
    replyTimer,
    composingTimer,
  });
}

export function cancelDebouncedReply(conversationId: number): void {
  const existing = pendingByConversation.get(conversationId);
  if (!existing) return;
  clearTimers(existing);
  void setComposing(
    existing.payload.sock,
    existing.payload.remoteJid,
    false
  );
  pendingByConversation.delete(conversationId);
}
