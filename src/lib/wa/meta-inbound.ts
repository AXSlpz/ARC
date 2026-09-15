import { primaryContactPhone } from "../phone-normalize";
import { findWaLineByMetaPhoneNumberId, getWaLine } from "../db";
import { getMetaConfig } from "./meta-config";
import type { IncomingTextEvent } from "./types";

interface MetaTextMessage {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  contacts?: Array<{ profile?: { name?: string } }>;
}

interface MetaChangeValue {
  messaging_product?: string;
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: Array<{
    profile?: { name?: string };
    wa_id?: string;
  }>;
  messages?: MetaTextMessage[];
  statuses?: unknown[];
}

interface MetaWebhookBody {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: MetaChangeValue;
    }>;
  }>;
}

const seenMessageIds = new Set<string>();
const SEEN_MAX = 2_000;

function rememberMessageId(id: string): boolean {
  if (seenMessageIds.has(id)) return false;
  seenMessageIds.add(id);
  if (seenMessageIds.size > SEEN_MAX) {
    const first = seenMessageIds.values().next().value;
    if (first) seenMessageIds.delete(first);
  }
  return true;
}

export function waIdToChatKey(waId: string): string {
  const digits = waId.replace(/\D/g, "");
  return `${digits}@s.whatsapp.net`;
}

export function resolveMetaLineId(phoneNumberId: string | undefined): number | null {
  if (!phoneNumberId) return null;
  const fromDb = findWaLineByMetaPhoneNumberId(phoneNumberId);
  if (fromDb) return fromDb.id;
  const meta = getMetaConfig();
  if (meta && meta.phoneNumberId === phoneNumberId) return meta.lineId;
  return null;
}

/** Extrae eventos de texto entrantes del payload webhook Meta. */
export function parseMetaWebhookMessages(body: unknown): IncomingTextEvent[] {
  const payload = body as MetaWebhookBody;
  if (payload.object !== "whatsapp_business_account") return [];

  const events: IncomingTextEvent[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field && change.field !== "messages") continue;
      const value = change.value;
      if (!value?.messages?.length) continue;

      const lineId = resolveMetaLineId(value.metadata?.phone_number_id);
      if (lineId == null) continue;
      const line = getWaLine(lineId);
      const meta = getMetaConfig();
      const isMetaLine =
        line?.provider === "meta" ||
        (meta != null && meta.lineId === lineId);
      if (!isMetaLine) continue;

      const contactName =
        value.contacts?.[0]?.profile?.name ??
        value.messages[0]?.contacts?.[0]?.profile?.name ??
        null;

      for (const msg of value.messages) {
        if (msg.type && msg.type !== "text") continue;
        const bodyText = msg.text?.body?.trim();
        if (!bodyText || !msg.from) continue;

        if (msg.id && !rememberMessageId(msg.id)) continue;

        const contactPhone =
          primaryContactPhone(msg.from) ?? msg.from.replace(/\D/g, "");
        events.push({
          lineId,
          chatKey: waIdToChatKey(msg.from),
          contactPhone,
          pushName: contactName,
          text: bodyText,
          externalMessageId: msg.id,
        });
      }
    }
  }

  return events;
}
