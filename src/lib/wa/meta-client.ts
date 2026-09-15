import crypto from "node:crypto";
import { getMetaConfig, type MetaConfig } from "./meta-config";

export function toMetaRecipient(to: string): string {
  return to.replace(/@.+$/, "").replace(/\D/g, "");
}

export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): boolean {
  if (!appSecret) return true;
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = signatureHeader.slice("sha256=".length);
  const hmac = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hmac, "utf8"),
      Buffer.from(expected, "utf8")
    );
  } catch {
    return false;
  }
}

export async function metaSendText(
  to: string,
  text: string,
  config: MetaConfig = getMetaConfig()!
): Promise<void> {
  if (!config) {
    throw new Error("Meta no configurado");
  }

  const recipient = toMetaRecipient(to);
  if (!recipient) {
    throw new Error("Destinatario Meta inválido");
  }

  const url = `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "text",
      text: { preview_url: false, body: text },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Meta send failed (${res.status}): ${body.slice(0, 300)}`);
  }
}

export function resolveMetaVerifyChallenge(params: {
  mode: string | null;
  token: string | null;
  challenge: string | null;
  verifyToken: string;
}): string | null {
  if (params.mode !== "subscribe") return null;
  if (!params.token || params.token !== params.verifyToken) return null;
  return params.challenge;
}
