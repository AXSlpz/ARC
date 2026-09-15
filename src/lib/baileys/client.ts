import makeWASocket, {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason,
  type WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
import path from "node:path";
import { maskPhone } from "../logger.js";
import fs from "node:fs";
import qrTerminal from "qrcode-terminal";
import { setWaLineState, getWaLine } from "../db.js";
import { broadcastDashboard } from "../ws-notify.js";
import { logAudit } from "../audit.js";
import { maskPhone as maskPhoneAudit } from "../audit-settings.js";

const logger = pino({ level: "silent" });

export interface BaileysHandle {
  lineId: number;
  sock: WASocket;
  shutdown: () => Promise<void>;
}

type MessageHandler = (sock: WASocket, lineId: number) => void;

const handles = new Map<number, BaileysHandle>();
const reconnectTimers = new Map<number, ReturnType<typeof setTimeout>>();
const restartInProgress = new Map<number, boolean>();
let messageHandler: MessageHandler | null = null;
let sharedVersion: [number, number, number] | undefined;

function authDirForLine(lineId: number): string {
  return path.resolve(process.cwd(), "auth", `line-${lineId}`);
}

export function migrateLegacyAuthDir(): void {
  const legacyAuth = path.resolve(process.cwd(), "auth");
  const line1Auth = authDirForLine(1);

  if (!fs.existsSync(legacyAuth)) return;

  const entries = fs.readdirSync(legacyAuth);
  const hasLineDirs = entries.some((e) => e.startsWith("line-"));
  if (hasLineDirs) return;

  const sessionFiles = entries.filter((e) => e !== ".gitkeep");
  if (sessionFiles.length === 0) return;

  fs.mkdirSync(line1Auth, { recursive: true });
  for (const entry of sessionFiles) {
    const src = path.join(legacyAuth, entry);
    const dest = path.join(line1Auth, entry);
    if (!fs.existsSync(dest)) {
      fs.renameSync(src, dest);
    }
  }
}

export function setMessageHandler(handler: MessageHandler): void {
  messageHandler = handler;
}

async function resolveWaVersion(): Promise<[number, number, number] | undefined> {
  if (sharedVersion) return sharedVersion;
  try {
    const fetched = await fetchLatestBaileysVersion();
    sharedVersion = fetched.version;
    console.log(`[bot] Versión WhatsApp Web: ${sharedVersion.join(".")}`);
    return sharedVersion;
  } catch (err) {
    console.warn("[bot] No se pudo obtener última versión WA:", err);
    return undefined;
  }
}

export async function startLine(lineId: number): Promise<BaileysHandle> {
  const authDir = authDirForLine(lineId);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const version = await resolveWaVersion();
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    browser: Browsers.macOS("Desktop"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    getMessage: async () => {
      return undefined;
    },
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log(`[bot] Línea ${lineId}: QR generado — escanea desde el dashboard`);
      if (process.env.NODE_ENV !== "production") {
        qrTerminal.generate(qr, { small: true });
      }
      setWaLineState(lineId, { status: "qr", qr_string: qr, phone: null });
      broadcastDashboard("connection", { lineId });
    }

    if (connection === "connecting") {
      const current = getWaLine(lineId);
      if (current?.status === "disconnected") {
        setWaLineState(lineId, { status: "connecting" });
        broadcastDashboard("connection", { lineId });
      }
    }

    if (connection === "open") {
      const phoneRaw = sock.user?.id ?? "";
      const phone = phoneRaw.split(":")[0].replace("@s.whatsapp.net", "");
      console.log(`[bot] Línea ${lineId} conectada como ${maskPhone(phone)}`);
      setWaLineState(lineId, { status: "connected", qr_string: null, phone });
      const line = getWaLine(lineId);
      logAudit(null, "sistema", "line.connect", "wa_line", lineId, {
        lineId,
        lineName: line?.name ?? `Línea ${lineId}`,
        phoneMasked: phone ? maskPhoneAudit(phone) : "—",
      });
      broadcastDashboard("connection", { lineId });
    }

    if (connection === "close") {
      const code =
        (lastDisconnect?.error as { output?: { statusCode?: number } })?.output
          ?.statusCode ?? DisconnectReason.connectionLost;

      console.log(`[bot] Línea ${lineId}: conexión cerrada — code: ${code}`);

      if (restartInProgress.get(lineId)) {
        console.log(`[bot] Línea ${lineId}: restart en progreso — ignorando close`);
        return;
      }

      if (code === DisconnectReason.loggedOut) {
        console.log(`[bot] Línea ${lineId}: sesión cerrada (logout). Limpiando auth...`);
        setWaLineState(lineId, {
          status: "disconnected",
          qr_string: null,
          phone: null,
        });
        broadcastDashboard("connection", { lineId });
        const dir = authDirForLine(lineId);
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
        scheduleReconnect(lineId, code);
      } else {
        scheduleReconnect(lineId, code);
      }
    }
  });

  if (messageHandler) {
    messageHandler(sock, lineId);
  }

  const handle: BaileysHandle = {
    lineId,
    sock,
    shutdown: async () => {
      try {
        sock.end(undefined);
      } catch {}
    },
  };

  handles.set(lineId, handle);
  return handle;
}

function scheduleReconnect(lineId: number, code: number): void {
  if (reconnectTimers.has(lineId)) return;

  const delay =
    code === DisconnectReason.loggedOut ? 3000 : code === 440 ? 15000 : 5000;
  console.log(
    `[bot] Línea ${lineId}: reconectando en ${delay / 1000}s (code=${code})...`
  );

  const timer = setTimeout(() => {
    reconnectTimers.delete(lineId);
    const handle = handles.get(lineId);
    if (handle) {
      try {
        handle.sock.end(undefined);
      } catch {}
      handles.delete(lineId);
    }
    startLine(lineId);
  }, delay);

  reconnectTimers.set(lineId, timer);
}

export function forceRestart(lineId: number): void {
  restartInProgress.set(lineId, true);

  const timer = reconnectTimers.get(lineId);
  if (timer) {
    clearTimeout(timer);
    reconnectTimers.delete(lineId);
  }

  const handle = handles.get(lineId);
  if (handle) {
    try {
      handle.sock.end(undefined);
    } catch {}
    handles.delete(lineId);
  }

  setTimeout(() => {
    restartInProgress.set(lineId, false);
    startLine(lineId);
  }, 1000);
}

export function getHandle(lineId: number): BaileysHandle | null {
  return handles.get(lineId) ?? null;
}

/** @deprecated Use startLine */
export async function start(): Promise<BaileysHandle> {
  return startLine(1);
}
