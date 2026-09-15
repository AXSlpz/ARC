"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "wa_conversation_read_at";

function loadReadAt(): Record<number, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    const out: Record<number, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const id = parseInt(key, 10);
      if (!isNaN(id) && typeof value === "number") out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function saveReadAt(readAt: Record<number, number>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(readAt));
  } catch {}
}

export function useReadConversations() {
  const [readAt, setReadAt] = useState<Record<number, number>>({});

  useEffect(() => {
    setReadAt(loadReadAt());
  }, []);

  const markRead = useCallback((conversationId: number, at?: number | null) => {
    const ts = at ?? Math.floor(Date.now() / 1000);
    setReadAt((prev) => {
      const current = prev[conversationId] ?? 0;
      if (ts <= current) return prev;
      const next = { ...prev, [conversationId]: ts };
      saveReadAt(next);
      return next;
    });
  }, []);

  const isUnread = useCallback(
    (
      conversation: {
        id: number;
        closed_at?: number | null;
        last_message_at: number | null;
        last_message_role?: string | null;
      }
    ): boolean => {
      if (conversation.closed_at) return false;
      if (!conversation.last_message_at) return false;
      if (conversation.last_message_role !== "user") return false;
      const read = readAt[conversation.id] ?? 0;
      return conversation.last_message_at > read;
    },
    [readAt]
  );

  return { readAt, markRead, isUnread };
}
