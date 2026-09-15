export interface NotificationPreferences {
  soundEnabled: boolean;
  desktopEnabled: boolean;
  notifyMessages: boolean;
  notifyAdvisor: boolean;
}

const STORAGE_KEY = "wa_notification_prefs";

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  soundEnabled: true,
  desktopEnabled: true,
  notifyMessages: true,
  notifyAdvisor: true,
};

export function loadNotificationPreferences(): NotificationPreferences {
  if (typeof window === "undefined") return DEFAULT_NOTIFICATION_PREFERENCES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_NOTIFICATION_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
    return {
      soundEnabled: parsed.soundEnabled ?? true,
      desktopEnabled: parsed.desktopEnabled ?? true,
      notifyMessages: parsed.notifyMessages ?? true,
      notifyAdvisor: parsed.notifyAdvisor ?? true,
    };
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

export function saveNotificationPreferences(
  prefs: NotificationPreferences
): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {}
}
