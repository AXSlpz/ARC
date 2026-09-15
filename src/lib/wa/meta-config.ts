export interface MetaConfig {
  accessToken: string;
  phoneNumberId: string;
  appSecret: string;
  verifyToken: string;
  lineId: number;
  graphVersion: string;
  /** Display phone digits if known (optional) */
  displayPhone: string | null;
}

function readEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

/** Solo para GET verify del webhook (Meta challenge). */
export function getMetaVerifyToken(): string | null {
  const verifyToken = readEnv("META_WEBHOOK_VERIFY_TOKEN");
  return verifyToken || null;
}

/** Config Meta completa. null si faltan vars para enviar/recibir. */
export function getMetaConfig(): MetaConfig | null {
  const accessToken = readEnv("META_ACCESS_TOKEN");
  const phoneNumberId = readEnv("META_PHONE_NUMBER_ID");
  const appSecret = readEnv("META_APP_SECRET");
  const verifyToken = readEnv("META_WEBHOOK_VERIFY_TOKEN");
  const lineIdRaw = readEnv("META_LINE_ID");
  const lineId = Number(lineIdRaw);

  if (!accessToken || !phoneNumberId || !verifyToken || !appSecret) return null;
  if (!Number.isInteger(lineId) || lineId < 1) return null;

  return {
    accessToken,
    phoneNumberId,
    appSecret,
    verifyToken,
    lineId,
    graphVersion: readEnv("META_GRAPH_VERSION") || "v21.0",
    displayPhone: readEnv("META_DISPLAY_PHONE") || null,
  };
}

export function isMetaConfigured(): boolean {
  return getMetaConfig() != null;
}
