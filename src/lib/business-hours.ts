import type { AdminSettings, WeekdayKey } from "./admin-settings-types";
import { getAdminSettings, WEEKDAY_KEYS, WEEKDAY_LABELS } from "./admin-settings";

const DAY_INDEX_TO_KEY: WeekdayKey[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

interface LocalTime {
  day: number;
  minutes: number;
  dateKey: string;
}

function getLocalTime(date: Date, timezone: string): LocalTime {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? 0
  );

  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    day: dayMap[weekday] ?? -1,
    minutes: hour * 60 + minute,
    dateKey: `${year}-${month}-${day}`,
  };
}

function parseTime(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + (minute || 0);
}

function formatTimeLabel(value: string): string {
  const [hourRaw, minuteRaw] = value.split(":").map(Number);
  const hour = hourRaw % 12 || 12;
  const suffix = hourRaw >= 12 ? "p.m." : "a.m.";
  return `${hour}:${String(minuteRaw).padStart(2, "0")} ${suffix}`;
}

const WEEKDAYS: WeekdayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
];

const WEEKEND: WeekdayKey[] = ["saturday", "sunday"];

function scheduleSignature(open: string, close: string): string {
  return `${open}|${close}`;
}

function joinSegments(segments: string[]): string {
  if (segments.length === 0) return "";
  if (segments.length === 1) return segments[0]!;
  return `${segments.slice(0, -1).join(", ")} y ${segments.at(-1)}`;
}

function formatDayRangeLabel(start: WeekdayKey, end: WeekdayKey): string {
  if (start === end) {
    return WEEKDAY_LABELS[start].toLowerCase();
  }
  if (start === "monday" && end === "friday") {
    return "de lunes a viernes";
  }
  if (start === "saturday" && end === "sunday") {
    return "fin de semana";
  }
  const startLabel = WEEKDAY_LABELS[start].toLowerCase();
  const endLabel = WEEKDAY_LABELS[end].toLowerCase();
  return `de ${startLabel} a ${endLabel}`;
}

function splitConsecutiveRuns(days: WeekdayKey[]): WeekdayKey[][] {
  const sorted = [...days].sort(
    (a, b) => WEEKDAY_KEYS.indexOf(a) - WEEKDAY_KEYS.indexOf(b)
  );
  if (sorted.length === 0) return [];

  const runs: WeekdayKey[][] = [[sorted[0]!]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;
    const prevIdx = WEEKDAY_KEYS.indexOf(prev);
    const currIdx = WEEKDAY_KEYS.indexOf(curr);
    if (currIdx === prevIdx + 1) {
      runs.at(-1)!.push(curr);
    } else {
      runs.push([curr]);
    }
  }
  return runs;
}

function formatDaySetLabel(days: WeekdayKey[]): string {
  if (days.length === 0) return "";

  if (
    days.length === WEEKDAYS.length &&
    WEEKDAYS.every((day) => days.includes(day))
  ) {
    return "de lunes a viernes";
  }

  if (
    days.length === WEEKEND.length &&
    WEEKEND.every((day) => days.includes(day))
  ) {
    return "fin de semana";
  }

  const runs = splitConsecutiveRuns(days);
  const runLabels = runs.map((run) => {
    if (run.length === 1) return WEEKDAY_LABELS[run[0]!].toLowerCase();
    return formatDayRangeLabel(run[0]!, run.at(-1)!);
  });

  return joinSegments(runLabels);
}

function formatScheduleBlock(
  dayLabel: string,
  open: string,
  close: string
): string {
  return `${dayLabel} de ${formatTimeLabel(open)} a ${formatTimeLabel(close)}`;
}

function groupEnabledDaysBySchedule(
  config: AdminSettings,
  keys: WeekdayKey[]
): Array<{ open: string; close: string; days: WeekdayKey[] }> {
  const groups = new Map<string, WeekdayKey[]>();

  for (const key of keys) {
    const schedule = config.businessHours[key];
    if (!schedule.enabled) continue;
    const signature = scheduleSignature(schedule.open, schedule.close);
    const days = groups.get(signature) ?? [];
    days.push(key);
    groups.set(signature, days);
  }

  return [...groups.entries()]
    .map(([signature, days]) => {
      const [open, close] = signature.split("|");
      return { open: open!, close: close!, days };
    })
    .sort(
      (a, b) =>
        WEEKDAY_KEYS.indexOf(a.days[0]!) - WEEKDAY_KEYS.indexOf(b.days[0]!)
    );
}

function formatDayGroups(
  config: AdminSettings,
  keys: WeekdayKey[]
): string | null {
  const groups = groupEnabledDaysBySchedule(config, keys);
  if (groups.length === 0) return null;

  const segments = groups.map((group) =>
    formatScheduleBlock(
      formatDaySetLabel(group.days),
      group.open,
      group.close
    )
  );

  return joinSegments(segments);
}

function formatWeekdaySection(config: AdminSettings): string | null {
  const enabledWeekdays = WEEKDAYS.filter(
    (key) => config.businessHours[key].enabled
  );
  if (enabledWeekdays.length === 0) return null;

  if (enabledWeekdays.length === WEEKDAYS.length) {
    const signatures = enabledWeekdays.map((key) => {
      const schedule = config.businessHours[key];
      return scheduleSignature(schedule.open, schedule.close);
    });
    const allSame = signatures.every((sig) => sig === signatures[0]);

    if (allSame) {
      const schedule = config.businessHours.monday;
      return formatScheduleBlock(
        "de lunes a viernes",
        schedule.open,
        schedule.close
      );
    }

    const bySignature = groupEnabledDaysBySchedule(config, WEEKDAYS);
    if (bySignature.length === 2) {
      const [majority, outlier] = [...bySignature].sort(
        (a, b) => b.days.length - a.days.length
      );
      if (
        majority &&
        outlier &&
        majority.days.length === 4 &&
        outlier.days.length === 1 &&
        majority.open === outlier.open &&
        majority.close !== outlier.close
      ) {
        const outlierDay = outlier.days[0]!;
        return `${formatScheduleBlock(
          "de lunes a viernes",
          majority.open,
          majority.close
        )} (${WEEKDAY_LABELS[outlierDay].toLowerCase()} cierra a las ${formatTimeLabel(outlier.close)})`;
      }
    }
  }

  return formatDayGroups(config, WEEKDAYS);
}

function formatWeekendSection(config: AdminSettings): string | null {
  const enabledWeekend = WEEKEND.filter(
    (key) => config.businessHours[key].enabled
  );
  if (enabledWeekend.length === 0) return null;

  if (enabledWeekend.length === 2) {
    const saturday = config.businessHours.saturday;
    const sunday = config.businessHours.sunday;
    if (
      saturday.open === sunday.open &&
      saturday.close === sunday.close
    ) {
      return formatScheduleBlock(
        "fin de semana",
        saturday.open,
        saturday.close
      );
    }
  }

  return formatDayGroups(config, WEEKEND);
}

export function getBusinessHoursLabel(settings?: AdminSettings): string {
  const config = settings ?? getAdminSettings();
  const weekdaySection = formatWeekdaySection(config);
  const weekendSection = formatWeekendSection(config);
  const sections = [weekdaySection, weekendSection].filter(
    (section): section is string => Boolean(section)
  );

  if (sections.length === 0) return "sin horario configurado";
  if (sections.length === 1) return sections[0]!;
  return sections.join("; ");
}

export function getHandoffOutOfHoursMessage(settings?: AdminSettings): string {
  const label = getBusinessHoursLabel(settings);

  return `Gracias por contactarnos. En este momento el servicio de atención a clientes se encuentra fuera de horario (${label}).

Su solicitud quedó registrada en lista de espera y será atendida con prioridad al iniciar el siguiente horario laboral.

Mientras tanto, puedo ayudarle con ARC, el reglamento de construcción y los documentos cargados de su condominio.`;
}

export function isWithinBusinessHours(
  date = new Date(),
  settings = getAdminSettings()
): boolean {
  const local = getLocalTime(date, settings.timezone);

  if (settings.holidays.includes(local.dateKey)) {
    return false;
  }

  const dayKey = DAY_INDEX_TO_KEY[local.day];
  if (!dayKey) return false;

  const schedule = settings.businessHours[dayKey];
  if (!schedule.enabled) return false;

  const open = parseTime(schedule.open);
  const close = parseTime(schedule.close);
  return local.minutes >= open && local.minutes <= close;
}
