import type { AdminSettings, WeekdayKey } from "./admin-settings-types";
import { WEEKDAY_KEYS, WEEKDAY_LABELS } from "./admin-settings-types";
import { logAudit } from "./audit";

export function maskUsername(username: string): string {
  const u = username.trim();
  if (u.length <= 2) return "***";
  return `${u[0]}${"*".repeat(Math.min(u.length - 2, 5))}${u.slice(-1)}`;
}

export function truncatePreview(text: string, max = 100): string {
  const t = text.trim();
  if (!t) return "—";
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function maskPhone(phone: string): string {
  if (phone.length < 6) return "***";
  return `${phone.slice(0, 4)}****${phone.slice(-3)}`;
}

export function auditSettingsChanges(
  userId: number,
  username: string,
  before: AdminSettings,
  after: AdminSettings
): void {
  if (
    before.businessName !== after.businessName ||
    before.timezone !== after.timezone
  ) {
    logAudit(userId, username, "settings.general", "settings", 1, {
      businessNameFrom: before.businessName,
      businessNameTo: after.businessName,
      timezoneFrom: before.timezone,
      timezoneTo: after.timezone,
    });
  }

  const holidaysBefore = [...before.holidays].sort().join(",");
  const holidaysAfter = [...after.holidays].sort().join(",");
  if (holidaysBefore !== holidaysAfter) {
    const added = after.holidays.filter((h) => !before.holidays.includes(h));
    const removed = before.holidays.filter((h) => !after.holidays.includes(h));
    logAudit(userId, username, "settings.holidays", "settings", 1, {
      holidayCount: after.holidays.length,
      holidays: after.holidays.join(", ") || "—",
      holidaysAdded: added.length ? added.join(", ") : "—",
      holidaysRemoved: removed.length ? removed.join(", ") : "—",
    });
  }

  const changedDays: string[] = [];
  for (const day of WEEKDAY_KEYS) {
    const b = before.businessHours[day as WeekdayKey];
    const a = after.businessHours[day as WeekdayKey];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      const label = WEEKDAY_LABELS[day as WeekdayKey];
      changedDays.push(
        `${label}: ${a.enabled ? `${a.open}–${a.close}` : "cerrado"}`
      );
    }
  }
  if (changedDays.length > 0) {
    logAudit(userId, username, "settings.schedule", "settings", 1, {
      daysChanged: changedDays.join(" · "),
    });
  }

  if (
    before.welcomeMessage !== after.welcomeMessage ||
    before.menuEnabled !== after.menuEnabled ||
    JSON.stringify(before.urgencyKeywords) !==
      JSON.stringify(after.urgencyKeywords)
  ) {
    logAudit(userId, username, "settings.ai_menu", "settings", 1, {
      menuEnabled: after.menuEnabled ? "Sí" : "No",
      welcomePreview: truncatePreview(after.welcomeMessage, 120),
      urgencyKeywordCount: after.urgencyKeywords.length,
      urgencyKeywords: after.urgencyKeywords.join(", ") || "—",
    });
  }

  if (
    before.inactivityFarewellMessage !== after.inactivityFarewellMessage ||
    before.inactivityAutoCloseEnabled !== after.inactivityAutoCloseEnabled
  ) {
    logAudit(userId, username, "settings.inactivity", "settings", 1, {
      autoCloseEnabled: after.inactivityAutoCloseEnabled ? "Sí" : "No",
      messagePreview: truncatePreview(after.inactivityFarewellMessage, 160),
    });
  }

  if (JSON.stringify(before.chatColors) !== JSON.stringify(after.chatColors)) {
    const changedColorKeys = (
      Object.keys(after.chatColors) as (keyof typeof after.chatColors)[]
    ).filter((key) => before.chatColors[key] !== after.chatColors[key]);
    logAudit(userId, username, "settings.appearance", "settings", 1, {
      colorsChanged: changedColorKeys.length
        ? changedColorKeys.join(", ")
        : "paleta actualizada",
    });
  }
}
