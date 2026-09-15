import {
  setWaLineProvider,
  setWaLineState,
  getWaLine,
  listWaLines,
} from "../db";
import { getMetaConfig } from "./meta-config";

function readEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * Aplica META_* env a wa_lines.
 * Con META_LINE_ID + META_PHONE_NUMBER_ID basta para marcar provider=meta
 * (así start-bot no arranca Baileys/QR en esa línea).
 * Las demás líneas que estaban en meta vuelven a baileys.
 */
export function syncMetaLineFromEnv(): {
  configured: boolean;
  lineId: number | null;
} {
  const lineId = Number(readEnv("META_LINE_ID"));
  const phoneNumberId = readEnv("META_PHONE_NUMBER_ID");
  const displayPhone = readEnv("META_DISPLAY_PHONE") || null;

  if (!Number.isInteger(lineId) || lineId < 1 || !phoneNumberId) {
    return { configured: false, lineId: null };
  }

  const line = getWaLine(lineId);
  if (!line) {
    console.warn(
      `[meta] META_LINE_ID=${lineId} no existe en wa_lines — ignora`
    );
    return { configured: false, lineId: null };
  }

  // Otras líneas: si estaban en meta, vuelven a Baileys
  for (const other of listWaLines()) {
    if (other.id === lineId) continue;
    if (other.provider === "meta") {
      setWaLineProvider(other.id, "baileys", null);
      setWaLineState(other.id, {
        status: "disconnected",
        qr_string: null,
        phone: null,
      });
      console.log(`[meta] Línea ${other.id} → provider=baileys (QR)`);
    }
  }

  setWaLineProvider(lineId, "meta", phoneNumberId);

  const full = getMetaConfig();
  if (full) {
    setWaLineState(lineId, {
      status: "connected",
      qr_string: null,
      phone: full.displayPhone ?? displayPhone,
    });
    console.log(
      `[meta] Línea ${lineId} → provider=meta (completo) phone_number_id=${phoneNumberId}`
    );
  } else {
    setWaLineState(lineId, {
      status: "disconnected",
      qr_string: null,
      phone: displayPhone,
    });
    console.log(
      `[meta] Línea ${lineId} → provider=meta (parcial, faltan ACCESS_TOKEN/APP_SECRET)`
    );
  }

  return { configured: true, lineId };
}
