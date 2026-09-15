import { NextResponse } from "next/server";
import {
  resolveMetaVerifyChallenge,
  verifyMetaSignature,
} from "@/lib/wa/meta-client";
import { getMetaConfig, getMetaVerifyToken } from "@/lib/wa/meta-config";
import { parseMetaWebhookMessages } from "@/lib/wa/meta-inbound";
import { enqueueMetaInbound } from "@/lib/wa/meta-inbound-queue";
import { syncMetaLineFromEnv } from "@/lib/wa/sync-meta-line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — verificación del webhook (Meta challenge).
 * POST — encola mensajes; el proceso bot (start-bot) los procesa.
 */
export async function GET(request: Request) {
  const verifyToken = getMetaVerifyToken();
  if (!verifyToken) {
    return new NextResponse("Meta verify token no configurado", { status: 503 });
  }

  const url = new URL(request.url);
  const challenge = resolveMetaVerifyChallenge({
    mode: url.searchParams.get("hub.mode"),
    token: url.searchParams.get("hub.verify_token"),
    challenge: url.searchParams.get("hub.challenge"),
    verifyToken,
  });

  if (challenge == null) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(request: Request) {
  const config = getMetaConfig();
  if (!config) {
    return NextResponse.json({ error: "Meta no configurado" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!config.appSecret) {
    console.error("[meta-webhook] META_APP_SECRET no configurado");
    return NextResponse.json(
      { error: "META_APP_SECRET requerido" },
      { status: 503 }
    );
  }

  if (!verifyMetaSignature(rawBody, signature, config.appSecret)) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  syncMetaLineFromEnv();

  const events = parseMetaWebhookMessages(body);
  for (const event of events) {
    try {
      enqueueMetaInbound(event);
    } catch (err) {
      console.error("[meta-webhook] Error encolando mensaje", err);
    }
  }

  return NextResponse.json({ ok: true, queued: events.length });
}
