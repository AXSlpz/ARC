import "./env-loader.js";

import path from "node:path";
import fs from "node:fs";
import {
  startLine,
  setMessageHandler,
  forceRestart,
  migrateLegacyAuthDir,
} from "../src/lib/baileys/client.js";
import { registerMessageHandler } from "../src/lib/baileys/handler.js";
import {
  getPendingOutbox,
  claimOutboxItem,
  releaseOutboxItem,
  getConversationById,
  listWaLines,
  setWaLineState,
} from "../src/lib/db.js";
import { sendHumanLikeText } from "../src/lib/human-timing.js";
import {
  sendSurveyToConversation,
  processInactiveConversations,
  processExpiredSurveyConversations,
  ingestIncomingTextEvent,
  ensureBotProcessorRegistered,
} from "../src/lib/baileys/handler.js";
import { ensureAllCondominioReglamentosIndexes } from "../src/lib/reglamentos.js";
import { syncComunidadFelizAccounts } from "../src/lib/comunidad-feliz-accounts.js";
import { isComunidadFelizConfigured } from "../src/lib/comunidad-feliz-client.js";
import { getLineProvider, getTransport } from "../src/lib/wa/registry.js";
import { syncMetaLineFromEnv } from "../src/lib/wa/sync-meta-line.js";
import {
  deleteMetaInbound,
  listMetaInboundBatch,
} from "../src/lib/wa/meta-inbound-queue.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const CF_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

function restartFlagPath(lineId: number): string {
  return path.join(DATA_DIR, `.restart-${lineId}`);
}

function authDirForLine(lineId: number): string {
  return path.resolve(process.cwd(), "auth", `line-${lineId}`);
}

setMessageHandler((sock, lineId) => {
  registerMessageHandler(sock, lineId);
});

console.log("[bot] Iniciando agente WhatsApp (híbrido Baileys + Meta)...");
migrateLegacyAuthDir();
ensureBotProcessorRegistered();
const metaSync = syncMetaLineFromEnv();
if (metaSync.configured) {
  console.log(`[bot] Meta activo en línea ${metaSync.lineId}`);
}

await ensureAllCondominioReglamentosIndexes();

async function runComunidadFelizSync(reason: string): Promise<void> {
  if (!isComunidadFelizConfigured()) return;
  try {
    console.log(`[bot] Sync ComunidadFeliz (${reason})...`);
    const result = await syncComunidadFelizAccounts();
    for (const s of result.summaries) {
      console.log(
        `[bot] CF sync condo=${s.condominioId} matched=${s.matched} unmatched=${s.unmatched} props=${s.properties}` +
          (s.errors.length ? ` errors=${s.errors.join("; ")}` : "")
      );
    }
  } catch (err) {
    console.error("[bot] Error sync ComunidadFeliz:", err);
  }
}

void runComunidadFelizSync("startup");
setInterval(() => {
  void runComunidadFelizSync("interval");
}, CF_SYNC_INTERVAL_MS);

const lines = listWaLines();
for (const line of lines) {
  if (getLineProvider(line.id) === "meta") {
    console.log(
      `[bot] Línea ${line.id} (${line.name}): Meta Cloud API — sin QR Baileys`
    );
    continue;
  }

  fs.mkdirSync(authDirForLine(line.id), { recursive: true });
  await startLine(line.id);
}

// Poll cola Meta (webhook → SQLite → bot)
setInterval(() => {
  try {
    const batch = listMetaInboundBatch(20);
    for (const item of batch) {
      try {
        ingestIncomingTextEvent(item);
        deleteMetaInbound(item.queueId);
      } catch (err) {
        console.error(
          `[bot] Error procesando Meta queue id=${item.queueId}:`,
          err
        );
      }
    }
  } catch (err) {
    console.error("[bot] Error leyendo cola Meta:", err);
  }
}, 1000);

// Poll outbox cada 2s: enviar mensajes humanos pendientes
setInterval(async () => {
  const pending = getPendingOutbox(20);
  for (const item of pending) {
    if (!claimOutboxItem(item.id)) continue;

    const transport = getTransport(item.line_id);
    if (!transport) {
      releaseOutboxItem(item.id);
      continue;
    }

    try {
      const jid = item.phone.includes("@")
        ? item.phone
        : `${item.phone}@s.whatsapp.net`;
      // Typing + ritmo humano (~30–35 ppm) también para notificaciones de tickets.
      await sendHumanLikeText(transport, jid, item.content);
      console.log(
        `[bot] → Outbox (línea ${item.line_id}/${transport.provider}) a ${item.phone}: "${item.content.slice(0, 40)}..."`
      );
    } catch (err) {
      releaseOutboxItem(item.id);
      console.error(`[bot] Error enviando outbox id=${item.id}:`, err);
    }
  }
}, 2000);

// Cierre por inactividad (30 min sin respuesta)
setInterval(async () => {
  try {
    await processInactiveConversations();
    await processExpiredSurveyConversations();
  } catch (err) {
    console.error("[bot] Error procesando inactividad:", err);
  }
}, 60_000);

// Encuestas de satisfacción pendientes
const surveyInFlight = new Set<number>();

setInterval(async () => {
  if (!fs.existsSync(DATA_DIR)) return;

  for (const file of fs.readdirSync(DATA_DIR)) {
    if (!file.startsWith(".survey-") || file.endsWith(".claimed")) continue;

    const convId = parseInt(file.replace(".survey-", ""), 10);
    if (isNaN(convId) || surveyInFlight.has(convId)) continue;

    const surveyPath = path.join(DATA_DIR, file);
    const claimedPath = `${surveyPath}.claimed`;

    try {
      fs.renameSync(surveyPath, claimedPath);
    } catch {
      continue;
    }

    let phone = "";
    try {
      const raw = JSON.parse(fs.readFileSync(claimedPath, "utf8")) as {
        phone?: string;
      };
      phone = raw.phone ?? "";
    } catch {
      try {
        fs.unlinkSync(claimedPath);
      } catch {
        /* ignore */
      }
      continue;
    } finally {
      try {
        fs.unlinkSync(claimedPath);
      } catch {
        /* ignore */
      }
    }

    const convo = getConversationById(convId);
    if (!convo) continue;

    const transport = getTransport(convo.line_id);
    if (!transport) continue;

    surveyInFlight.add(convId);
    try {
      await sendSurveyToConversation(
        transport,
        convId,
        phone || convo.phone
      );
      console.log(`[bot] Encuesta enviada a conversación ${convId}`);
    } catch (err) {
      console.error(`[bot] Error enviando encuesta ${convId}:`, err);
    } finally {
      surveyInFlight.delete(convId);
    }
  }
}, 2000);

// Poll restart flags cada 1s: reiniciar línea Baileys específica
setInterval(() => {
  if (!fs.existsSync(DATA_DIR)) return;

  for (const line of listWaLines()) {
    if (getLineProvider(line.id) === "meta") continue;

    const flag = restartFlagPath(line.id);
    if (!fs.existsSync(flag)) continue;

    console.log(`[bot] Flag .restart-${line.id} detectado — reiniciando línea...`);
    fs.unlinkSync(flag);

    const authDir = authDirForLine(line.id);
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true });
    }

    setWaLineState(line.id, {
      status: "disconnected",
      qr_string: null,
      phone: null,
    });
    forceRestart(line.id);
  }

  // Compatibilidad con flag global legado
  const legacyFlag = path.join(DATA_DIR, ".restart");
  if (fs.existsSync(legacyFlag)) {
    console.log("[bot] Flag .restart legado detectado — reiniciando línea 1...");
    fs.unlinkSync(legacyFlag);
    if (getLineProvider(1) === "meta") return;
    const authDir = authDirForLine(1);
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true });
    }
    setWaLineState(1, {
      status: "disconnected",
      qr_string: null,
      phone: null,
    });
    forceRestart(1);
  }
}, 1000);
