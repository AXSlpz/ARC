export type NotificationPermissionState = NotificationPermission | "unsupported";

export function getNotificationPermission(): NotificationPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (getNotificationPermission() === "unsupported") return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export interface ShowBrowserNotificationInput {
  title: string;
  body: string;
  tag: string;
  conversationId?: number;
  urgent?: boolean;
}

export async function showBrowserNotification(
  input: ShowBrowserNotificationInput
): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const options: NotificationOptions = {
    body: input.body,
    tag: input.tag,
    icon: "/icon.svg",
    badge: "/icon.svg",
    data: { conversationId: input.conversationId },
    requireInteraction: Boolean(input.urgent),
    silent: false,
  };

  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(input.title, options);
      return;
    }
  } catch {}

  try {
    const notification = new Notification(input.title, options);
    notification.onclick = () => {
      window.focus();
      notification.close();
      if (input.conversationId != null) {
        window.dispatchEvent(
          new CustomEvent("wa:open-conversation", {
            detail: { conversationId: input.conversationId },
          })
        );
      }
    };
  } catch {}
}
