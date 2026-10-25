"use client";

import { useEffect, useRef } from "react";
import { getWsBaseUrl } from "@/lib/ws-client-url";

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
