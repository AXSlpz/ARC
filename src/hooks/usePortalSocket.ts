"use client";

import { useEffect, useRef } from "react";

function getWsBaseUrl(): string {
  if (typeof window === "undefined") return "";
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const hostname = window.location.hostname;
  const port = window.location.port;

  if (process.env.NEXT_PUBLIC_WS_SAME_ORIGIN === "true") {
    return `${proto}://${window.location.host}/ws`;
  }
  if (!port || port === "3000") {
    const wsPort = process.env.NEXT_PUBLIC_WS_PORT || "3001";
    return `${proto}://${hostname}:${wsPort}/ws`;
  }
  return `${proto}://${window.location.host}/ws`;
}

async function fetchPortalTicket(): Promise<string | null> {
  try {
    const res = await fetch("/api/portal/ws-ticket");
    if (!res.ok) return null;
    const data = (await res.json()) as { ticket?: string };
    return data.ticket ?? null;
  } catch {
    return null;
  }
}

/**
 * Socket de tiempo real para el portal de clientes. Reutiliza el mismo bus WS
 * que el panel admin, autenticando con un ticket efímero del portal.
 * Llama a `onEvent(event, data)` por cada mensaje recibido.
 */
export function usePortalSocket(
  enabled: boolean,
  onEvent: (event: string, data?: Record<string, unknown>) => void
): void {
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = async () => {
      const base = getWsBaseUrl();
      if (!base) return;
      const ticket = await fetchPortalTicket();
      const url = ticket ? `${base}?ticket=${encodeURIComponent(ticket)}` : base;
      ws = new WebSocket(url);

      ws.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(msg.data as string) as {
            event?: string;
            data?: Record<string, unknown>;
          };
          if (parsed.event) callbackRef.current(parsed.event, parsed.data);
        } catch {}
      };

      ws.onclose = () => {
        if (!closed) reconnectTimer = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [enabled]);
}
