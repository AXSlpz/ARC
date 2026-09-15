"use client";

import { useEffect, useRef } from "react";
import { showBrowserNotification } from "@/lib/browser-notifications";
import { loadNotificationPreferences } from "@/lib/notification-preferences";
import {
  initNotificationSounds,
  playAdvisorRequestNotification,
  playMessageNotification,
} from "@/lib/notification-sounds";

export interface ConversationSnapshot {
  id: number;
  name: string | null;
  phone: string;
  line_name: string;
  last_message_at: number | null;
  last_message_preview: string | null;
  last_message_role?: string | null;
  human_requested?: number;
  closed_at?: number | null;
}

interface NotificationOptions {
  enabled: boolean;
  selectedId: number | null;
  businessName: string;
  chatsVisible: boolean;
}

function contactLabel(c: ConversationSnapshot): string {
  return c.name || c.phone;
}

function isViewingConversation(
  conversationId: number,
  selectedId: number | null,
  chatsVisible: boolean
): boolean {
  return (
    chatsVisible &&
    selectedId === conversationId &&
    typeof document !== "undefined" &&
    document.visibilityState === "visible"
  );
}

export function useConversationNotifications(
  conversations: ConversationSnapshot[],
  options: NotificationOptions
): void {
  const { enabled, selectedId, businessName, chatsVisible } = options;
  const prevRef = useRef<
    Map<number, { last_message_at: number | null; human_requested: number }>
  >(new Map());
  const readyRef = useRef(false);
  const prefsRef = useRef(loadNotificationPreferences());

  useEffect(() => {
    if (!enabled) return;
    initNotificationSounds();
    prefsRef.current = loadNotificationPreferences();

    const onPrefsChange = () => {
      prefsRef.current = loadNotificationPreferences();
    };
    window.addEventListener("wa:notification-prefs-changed", onPrefsChange);
    return () =>
      window.removeEventListener("wa:notification-prefs-changed", onPrefsChange);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const prev = prevRef.current;
    const prefs = prefsRef.current;

    if (!readyRef.current) {
      for (const c of conversations) {
        prev.set(c.id, {
          last_message_at: c.last_message_at,
          human_requested: c.human_requested ?? 0,
        });
      }
      readyRef.current = true;
      return;
    }

    for (const c of conversations) {
      const old = prev.get(c.id);
      const hr = c.human_requested ?? 0;
      const isNew = !old;
      const advisorJustRequested = Boolean(hr && (!old || !old.human_requested));
      const userMessageArrived =
        !c.closed_at &&
        c.last_message_role === "user" &&
        c.last_message_at != null &&
        (isNew || c.last_message_at > (old?.last_message_at ?? 0));

      const suppressBecauseViewing = isViewingConversation(
        c.id,
        selectedId,
        chatsVisible
      );

      if (advisorJustRequested && prefs.notifyAdvisor) {
        if (!suppressBecauseViewing) {
          if (prefs.soundEnabled) playAdvisorRequestNotification();
          if (prefs.desktopEnabled) {
            void showBrowserNotification({
              title: `${businessName} · Asesor solicitado`,
              body: `${contactLabel(c)} (${c.line_name}) pide atención humana`,
              tag: `wa-advisor-${c.id}`,
              conversationId: c.id,
              urgent: true,
            });
          }
        }
      } else if (
        userMessageArrived &&
        prefs.notifyMessages &&
        !advisorJustRequested
      ) {
        if (!suppressBecauseViewing) {
          if (prefs.soundEnabled) playMessageNotification();
          if (prefs.desktopEnabled) {
            void showBrowserNotification({
              title: `${businessName} · ${contactLabel(c)}`,
              body: c.last_message_preview?.trim() || "Nuevo mensaje",
              tag: `wa-msg-${c.id}`,
              conversationId: c.id,
            });
          }
        }
      }

      prev.set(c.id, {
        last_message_at: c.last_message_at,
        human_requested: hr,
      });
    }

    for (const id of [...prev.keys()]) {
      if (!conversations.some((c) => c.id === id)) prev.delete(id);
    }
  }, [conversations, enabled, selectedId, businessName, chatsVisible]);
}
