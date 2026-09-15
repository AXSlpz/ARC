"use client";

import { useEffect, useRef } from "react";

function getWsBaseUrl(): string {
  if (typeof window === "undefined") return "";

  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const hostname = window.location.hostname;
  const port = window.location.port;

  const sameOriginWs = process.env.NEXT_PUBLIC_WS_SAME_ORIGIN === "true";
  if (sameOriginWs) {
    return `${proto}://${window.location.host}/ws`;
  }

  // Sin proxy nginx: el WS corre en puerto dedicado (p. ej. acceso LAN :3000 → WS :3001)
  if (!port || port === "3000") {
    const wsPort = process.env.NEXT_PUBLIC_WS_PORT || "3001";
    return `${proto}://${hostname}:${wsPort}/ws`;
  }

  return `${proto}://${window.location.host}/ws`;
}

async function fetchTicket(): Promise<string | null> {
  try {
    const res = await fetch("/api/ws-ticket");
    if (!res.ok) return null;
    const data = (await res.json()) as { ticket?: string };
    return data.ticket ?? null;
  } catch {
    return null;
  }
}

export function useDashboardSocket(
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

      const ticket = await fetchTicket();
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
        if (!closed) {
          reconnectTimer = setTimeout(connect, 3000);
        }
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
