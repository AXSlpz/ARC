export type WaProvider = "baileys" | "meta";

export interface WaTransport {
  readonly provider: WaProvider;
  readonly lineId: number;
  sendText(to: string, text: string): Promise<void>;
  setComposing(to: string, composing: boolean): Promise<void>;
}

export interface IncomingTextEvent {
  lineId: number;
  /** Clave de conversación (JID-like: digits@s.whatsapp.net) */
  chatKey: string;
  /** Teléfono en dígitos para matching de residentes */
  contactPhone: string;
  pushName: string | null;
  text: string;
  externalMessageId?: string;
}
