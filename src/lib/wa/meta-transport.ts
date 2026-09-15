import { metaSendText } from "./meta-client";
import { getMetaConfig } from "./meta-config";
import type { WaTransport } from "./types";

export function createMetaTransport(lineId: number): WaTransport {
  return {
    provider: "meta",
    lineId,
    async sendText(to, text) {
      const config = getMetaConfig();
      if (!config || config.lineId !== lineId) {
        throw new Error(`Línea Meta ${lineId} no configurada`);
      }
      await metaSendText(to, text, config);
    },
    async setComposing(_to, _composing) {
      // Cloud API no expone composing equivalente fiable; no-op.
    },
  };
}
