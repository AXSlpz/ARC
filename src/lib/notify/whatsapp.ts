import {
  getOrCreateConversation,
  enqueueOutbox,
  insertMessage,
} from "../db";
import { updateConversationContact } from "../db-features";

const ARC_LINE_ID = 1;

/**
 * Normaliza un teléfono a solo dígitos con lada país para WhatsApp.
 * México: 10 dígitos locales → 521XXXXXXXXXX (formato WA móvil).
 * Si viene como 52 + 10 dígitos (sin el 1 móvil), lo corrige a 521…
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.length === 10) return `521${digits}`;
  // 52 + 10 dígitos (sin "1" de móvil MX) → 521 + 10
  if (digits.length === 12 && digits.startsWith("52") && !digits.startsWith("521")) {
    return `521${digits.slice(2)}`;
  }
  return digits;
}

export interface WhatsAppNotifyResult {
  ok: boolean;
  phone: string | null;
  conversationId?: number;
  error?: string;
}

/**
 * Encola un mensaje de WhatsApp saliente por la línea de ARC (id=1),
 * lo persiste en el chat del bot (messages) y lo deja listo para el outbox.
 */
export function sendWhatsApp(
  toPhone: string | null | undefined,
  content: string,
  name?: string | null
): WhatsAppNotifyResult {
  const phone = normalizePhone(toPhone);
  if (!phone) {
    return { ok: false, phone: null, error: "Teléfono inválido o ausente." };
  }
  const text = content.trim();
  if (!text) {
    return { ok: false, phone, error: "Mensaje vacío." };
  }
  try {
    const conversation = getOrCreateConversation(
      phone,
      name ?? null,
      ARC_LINE_ID,
      phone
    );
    updateConversationContact(conversation.id, { contactPhone: phone });
    // Persistir en el timeline del bot (igual que mensajes salientes del dashboard).
    insertMessage(conversation.id, "assistant", text);
    // Enviar por el JID canónico (521…), no por un phone legacy de la conversación.
    enqueueOutbox(conversation.id, phone, text, conversation.line_id ?? ARC_LINE_ID);
    return { ok: true, phone, conversationId: conversation.id };
  } catch (err) {
    return {
      ok: false,
      phone,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
