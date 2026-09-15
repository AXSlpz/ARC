import { getHandle } from "../baileys/client";
import { getWaLine } from "../db";
import { createBaileysTransport } from "./baileys-transport";
import { getMetaConfig } from "./meta-config";
import { createMetaTransport } from "./meta-transport";
import type { WaProvider, WaTransport } from "./types";

export function getLineProvider(lineId: number): WaProvider {
  const line = getWaLine(lineId);
  if (line?.provider === "meta") return "meta";
  const meta = getMetaConfig();
  if (meta && meta.lineId === lineId) return "meta";
  return "baileys";
}

export function getTransport(lineId: number): WaTransport | null {
  const provider = getLineProvider(lineId);

  if (provider === "meta") {
    const meta = getMetaConfig();
    if (!meta || meta.lineId !== lineId) return null;
    return createMetaTransport(lineId);
  }

  const handle = getHandle(lineId);
  if (!handle) return null;
  return createBaileysTransport(handle.sock, lineId);
}
