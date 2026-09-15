import type { WASocket, proto } from "@whiskeysockets/baileys";
import { jidToPhoneDigits, primaryContactPhone } from "../phone-normalize.js";

export interface ResolvedContact {
  /** JID used for sendMessage / conversation key */
  chatJid: string;
  /** Normalized digits for residente lookup (10-digit MX when possible) */
  contactPhone: string | null;
}

export async function resolveContactPhone(
  sock: WASocket,
  msg: proto.IWebMessageInfo
): Promise<ResolvedContact | null> {
  const chatJid = msg.key?.remoteJid;
  if (!chatJid) return null;

  const key = msg.key as proto.IMessageKey & {
    remoteJidAlt?: string;
    participantAlt?: string;
  };
  const altJid = key.remoteJidAlt ?? undefined;

  if (chatJid.endsWith("@s.whatsapp.net")) {
    return {
      chatJid,
      contactPhone: primaryContactPhone(chatJid),
    };
  }

  if (altJid?.endsWith("@s.whatsapp.net")) {
    return {
      chatJid,
      contactPhone: primaryContactPhone(altJid),
    };
  }

  if (chatJid.endsWith("@lid")) {
    try {
      const pnJid = await sock.signalRepository.lidMapping.getPNForLID(chatJid);
      if (pnJid?.endsWith("@s.whatsapp.net")) {
        return {
          chatJid,
          contactPhone: primaryContactPhone(pnJid),
        };
      }
    } catch {
      // LID mapping may be unavailable during reconnect
    }

    const altDigits = altJid ? jidToPhoneDigits(altJid) : null;
    return {
      chatJid,
      contactPhone: altDigits ? primaryContactPhone(altDigits) : null,
    };
  }

  return {
    chatJid,
    contactPhone: primaryContactPhone(chatJid),
  };
}
