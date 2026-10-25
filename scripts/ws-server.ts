import "./env-loader.js";

import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import { consumeWsTicket } from "../src/lib/ws-ticket-store.js";

const PORT = Number(process.env.WS_PORT ?? 3001);
const isProd = process.env.NODE_ENV === "production";
const HOST = process.env.WS_HOST ?? (isProd ? "127.0.0.1" : "0.0.0.0");
const WS_SECRET = process.env.WS_SECRET ?? "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";
const MAX_BROADCAST_BYTES = 64 * 1024;

if (isProd && !WS_SECRET) {
  console.error("[ws] FATAL: WS_SECRET requerido en producción");
  process.exit(1);
}

if (isProd && !APP_URL) {
  console.error("[ws] FATAL: NEXT_PUBLIC_APP_URL requerido en producción");
  process.exit(1);
}

if (!WS_SECRET) {
  console.warn("[ws] ADVERTENCIA: WS_SECRET no configurado — /broadcast sin protección");
}

type TaggedSocket = WebSocket & { portalUserId: number | null };

const clients = new Set<TaggedSocket>();

function clientMayReceive(client: TaggedSocket, body: string): boolean {
  if (client.portalUserId == null) return true;
  let parsed: { event?: string; data?: { portalUserId?: unknown } };
  try {
    parsed = JSON.parse(body) as { event?: string; data?: { portalUserId?: unknown } };
  } catch {
    return false;
  }
  if (parsed.event !== "ticket") return false;
  return Number(parsed.data?.portalUserId) === client.portalUserId;
}

function isValidOrigin(origin: string | undefined): boolean {
  if (!APP_URL) return !isProd;
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(APP_URL).origin;
  } catch {
    return false;
  }
}

function safeBearerEqual(header: string, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/broadcast") {
    const authHeader = String(req.headers["authorization"] ?? "");
    if (!WS_SECRET || !safeBearerEqual(authHeader, WS_SECRET)) {
      res.writeHead(401, { "Content-Type": "text/plain" });
      res.end("Unauthorized");
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BROADCAST_BYTES) {
        tooLarge = true;
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) {
        res.writeHead(413, { "Content-Type": "text/plain" });
        res.end("Payload too large");
        return;
      }
      const body = Buffer.concat(chunks).toString("utf8");
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN && clientMayReceive(client, body)) {
          client.send(body);
        }
      }
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    });
    req.on("error", () => {
      if (!res.headersSent) {
        res.writeHead(400);
        res.end();
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  const origin = req.headers.origin;
  if (!isValidOrigin(origin)) {
    ws.close(4003, "Forbidden origin");
    return;
  }

  const url = new URL(req.url ?? "/", `http://localhost`);
  const ticket = url.searchParams.get("ticket") ?? "";

  const consumed = ticket ? consumeWsTicket(ticket) : null;
  if (!consumed) {
    ws.close(4001, "Invalid ticket");
    return;
  }

  const tagged = ws as TaggedSocket;
  tagged.portalUserId = consumed.portalUserId;
  clients.add(tagged);
  tagged.on("close", () => clients.delete(tagged));
});

server.listen(PORT, HOST, () => {
  console.log(`[ws] WebSocket en ws://${HOST}:${PORT}/ws (ticket requerido)`);
});
