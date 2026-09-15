import type { WASocket } from "@whiskeysockets/baileys";
import type { WaTransport } from "./types";

function toJid(to: string): string {
  if (to.includes("@")) return to;
  const digits = to.replace(/\D/g, "");
  return `${digits}@s.whatsapp.net`;
}

export function createBaileysTransport(
  sock: WASocket,
  lineId: number
): WaTransport {
  return {
    provider: "baileys",
    lineId,
    async sendText(to, text) {
      await sock.sendMessage(toJid(to), { text });
    },
    async setComposing(to, composing) {
      try {
        await sock.sendPresenceUpdate(
          composing ? "composing" : "paused",
          toJid(to)
        );
      } catch {
        // Presence puede fallar si el socket reconecta
      }
    },
  };
}
