import db from "./db-connection";
import { getSearchTokens, normalizeQuery } from "./query-enrichment";

export type ServiceRecurrence =
  | "once"
  | "daily"
  | "weekly"
  | "every_n_days"
  | "monthly";

export interface ServiceType {
  id: number;
  slug: string;
  name: string;
  keywords: string;
  sort_order: number;
  active: boolean;
}

export interface ServiceSchedule {
  id: number;
  condominio_id: number;
  service_type_id: number;
  service_type_name?: string;
  service_type_slug?: string;
  title: string | null;
  start_date: string;
  time: string | null;
  recurrence: ServiceRecurrence;
  interval_days: number | null;
  weekdays: number[] | null;
  notes: string | null;
  active: boolean;
  created_at: number;
  updated_at: number;
}

export interface ServiceScheduleInput {
  service_type_id: number;
  title?: string | null;
  start_date: string;
  time?: string | null;
  recurrence: ServiceRecurrence;
  interval_days?: number | null;
  weekdays?: number[] | null;
  notes?: string | null;
  active?: boolean;
}

type ServiceTypeRow = {
  id: number;
  slug: string;
  name: string;
  keywords: string;
  sort_order: number;
  active: number;
};

type ScheduleRow = {
  id: number;
  condominio_id: number;
  service_type_id: number;
  service_type_name?: string;
  service_type_slug?: string;
  title: string | null;
  start_date: string;
  time: string | null;
  recurrence: string;
  interval_days: number | null;
  weekdays: string | null;
  notes: string | null;
  active: number;
  created_at: number;
  updated_at: number;
};

const SEED_TYPES: Omit<ServiceType, "id" | "active">[] = [
  {
    slug: "cesped-deshierbe",
    name: "Corte de césped y deshierbe",
    keywords:
      "cesped,césped,pasto,jardin,jardín,deshierbe,desmalezado,poda,areas verdes",
    sort_order: 1,
  },
  {
    slug: "recoleccion-basura",
    name: "Recolección y programación de basura",
    keywords:
      "basura,recoleccion,recolección,trash,desechos,residuos,recolector,camión basura",
    sort_order: 2,
  },
  {
    slug: "mantenimiento-albercas",
    name: "Mantenimiento de albercas",
    keywords:
      "alberca,albercas,piscina,piscinas,mantenimiento alberca,cloro,limpieza alberca",
    sort_order: 3,
  },
  {
    slug: "asambleas-vecinos",
    name: "Asambleas de vecinos",
    keywords: "asamblea,asambleas,junta,juntas,vecinos,reunion,reunión,condominos",
    sort_order: 4,
  },
  {
    slug: "cobranza-cuotas",
    name: "Cobranza de cuotas de mantenimiento",
    keywords:
      "cobranza,cuota,cuotas,mantenimiento,pago,pagos,mensualidad,adeudo",
    sort_order: 5,
  },
];

const WEEKDAY_LABELS = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 12, 0, 0, 0);
}

function formatDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function mapServiceType(row: ServiceTypeRow): ServiceType {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    keywords: row.keywords,
    sort_order: row.sort_order,
    active: row.active === 1,
  };
}

function parseWeekdays(raw: string | null): number[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  } catch {
    return null;
  }
}

function mapSchedule(row: ScheduleRow): ServiceSchedule {
  return {
    id: row.id,
    condominio_id: row.condominio_id,
    service_type_id: row.service_type_id,
    service_type_name: row.service_type_name,
    service_type_slug: row.service_type_slug,
    title: row.title,
    start_date: row.start_date,
    time: row.time,
    recurrence: row.recurrence as ServiceRecurrence,
    interval_days: row.interval_days,
    weekdays: parseWeekdays(row.weekdays),
    notes: row.notes,
    active: row.active === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function initServiceSchedulesSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS service_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      keywords TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS condominio_service_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      condominio_id INTEGER NOT NULL REFERENCES condominios(id) ON DELETE CASCADE,
      service_type_id INTEGER NOT NULL REFERENCES service_types(id),
      title TEXT,
      start_date TEXT NOT NULL,
      time TEXT,
      recurrence TEXT NOT NULL CHECK(recurrence IN ('once','daily','weekly','every_n_days','monthly')),
      interval_days INTEGER,
      weekdays TEXT,
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_service_schedules_condo
      ON condominio_service_schedules(condominio_id);
    CREATE INDEX IF NOT EXISTS idx_service_schedules_type
      ON condominio_service_schedules(condominio_id, service_type_id);
  `);

  const count = (
    db.prepare("SELECT COUNT(*) AS c FROM service_types").get() as { c: number }
  ).c;
  if (count === 0) {
    const insert = db.prepare(
      `INSERT INTO service_types (slug, name, keywords, sort_order, active)
       VALUES (?, ?, ?, ?, 1)`
    );
    for (const item of SEED_TYPES) {
      insert.run(item.slug, item.name, item.keywords, item.sort_order);
    }
  }
}

export function listServiceTypes(activeOnly = true): ServiceType[] {
  const rows = (
    activeOnly
      ? db
          .prepare(
            `SELECT * FROM service_types WHERE active = 1 ORDER BY sort_order, name`
          )
          .all()
      : db
          .prepare(`SELECT * FROM service_types ORDER BY sort_order, name`)
          .all()
  ) as ServiceTypeRow[];
  return rows.map(mapServiceType);
}

export function getServiceType(id: number): ServiceType | null {
  const row = db
    .prepare("SELECT * FROM service_types WHERE id = ?")
    .get(id) as ServiceTypeRow | undefined;
  return row ? mapServiceType(row) : null;
}

export function slugifyServiceName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || `servicio-${Date.now()}`;
}

function uniqueServiceSlug(desired: string, excludeId?: number): string {
  let slug = desired;
  let i = 2;
  while (true) {
    const row = db
      .prepare("SELECT id FROM service_types WHERE slug = ?")
      .get(slug) as { id: number } | undefined;
    if (!row || (excludeId != null && row.id === excludeId)) return slug;
    slug = `${desired}-${i}`;
    i += 1;
  }
}

export interface ServiceTypeInput {
  name: string;
  keywords?: string;
  sort_order?: number;
  active?: boolean;
}

export function createServiceType(input: ServiceTypeInput): ServiceType {
  const name = input.name.trim();
  if (!name) throw new Error("El nombre es obligatorio");
  const keywords = (input.keywords ?? "").trim();
  const slug = uniqueServiceSlug(slugifyServiceName(name));
  const maxOrder = (
    db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM service_types").get() as {
      m: number;
    }
  ).m;
  const sortOrder = input.sort_order ?? maxOrder + 1;
  const result = db
    .prepare(
      `INSERT INTO service_types (slug, name, keywords, sort_order, active)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(slug, name, keywords, sortOrder, input.active === false ? 0 : 1);
  return getServiceType(Number(result.lastInsertRowid))!;
}

export function updateServiceType(
  id: number,
  input: Partial<ServiceTypeInput>
): ServiceType | null {
  const existing = getServiceType(id);
  if (!existing) return null;

  const name = input.name !== undefined ? input.name.trim() : existing.name;
  if (!name) throw new Error("El nombre es obligatorio");
  const keywords =
    input.keywords !== undefined ? input.keywords.trim() : existing.keywords;
  const sortOrder =
    input.sort_order !== undefined ? input.sort_order : existing.sort_order;
  const active =
    input.active !== undefined ? input.active : existing.active;

  let slug = existing.slug;
  if (input.name !== undefined && name !== existing.name) {
    slug = uniqueServiceSlug(slugifyServiceName(name), id);
  }

  db.prepare(
    `UPDATE service_types
     SET slug = ?, name = ?, keywords = ?, sort_order = ?, active = ?
     WHERE id = ?`
  ).run(slug, name, keywords, sortOrder, active ? 1 : 0, id);

  return getServiceType(id);
}

export function countSchedulesUsingServiceType(serviceTypeId: number): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM condominio_service_schedules
         WHERE service_type_id = ?`
      )
      .get(serviceTypeId) as { c: number }
  ).c;
}

/** Soft-delete (active=0). If never used, hard-delete. */
export function deleteServiceType(id: number): {
  ok: boolean;
  mode: "deleted" | "deactivated";
} {
  const existing = getServiceType(id);
  if (!existing) return { ok: false, mode: "deleted" };

  const usage = countSchedulesUsingServiceType(id);
  if (usage > 0) {
    db.prepare("UPDATE service_types SET active = 0 WHERE id = ?").run(id);
    return { ok: true, mode: "deactivated" };
  }

  db.prepare("DELETE FROM service_types WHERE id = ?").run(id);
  return { ok: true, mode: "deleted" };
}

export function countSchedulesForCondominio(condominioId: number): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM condominio_service_schedules
         WHERE condominio_id = ? AND active = 1`
      )
      .get(condominioId) as { c: number }
  ).c;
}

export function listSchedulesForCondominio(
  condominioId: number,
  options?: { activeOnly?: boolean }
): ServiceSchedule[] {
  const activeOnly = options?.activeOnly ?? false;
  const rows = (
    activeOnly
      ? db
          .prepare(
            `SELECT s.*, t.name AS service_type_name, t.slug AS service_type_slug
             FROM condominio_service_schedules s
             JOIN service_types t ON t.id = s.service_type_id
             WHERE s.condominio_id = ? AND s.active = 1
             ORDER BY s.start_date, t.sort_order, s.id`
          )
          .all(condominioId)
      : db
          .prepare(
            `SELECT s.*, t.name AS service_type_name, t.slug AS service_type_slug
             FROM condominio_service_schedules s
             JOIN service_types t ON t.id = s.service_type_id
             WHERE s.condominio_id = ?
             ORDER BY s.active DESC, s.start_date, t.sort_order, s.id`
          )
          .all(condominioId)
  ) as ScheduleRow[];
  return rows.map(mapSchedule);
}

export function getSchedule(
  condominioId: number,
  scheduleId: number
): ServiceSchedule | null {
  const row = db
    .prepare(
      `SELECT s.*, t.name AS service_type_name, t.slug AS service_type_slug
       FROM condominio_service_schedules s
       JOIN service_types t ON t.id = s.service_type_id
       WHERE s.condominio_id = ? AND s.id = ?`
    )
    .get(condominioId, scheduleId) as ScheduleRow | undefined;
  return row ? mapSchedule(row) : null;
}

function validateScheduleInput(input: ServiceScheduleInput): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.start_date)) {
    throw new Error("Fecha inválida (usa YYYY-MM-DD)");
  }
  if (input.time != null && input.time !== "" && !/^\d{2}:\d{2}$/.test(input.time)) {
    throw new Error("Hora inválida (usa HH:MM)");
  }
  if (!getServiceType(input.service_type_id)) {
    throw new Error("Tipo de servicio no encontrado");
  }
  if (input.recurrence === "every_n_days") {
    if (!input.interval_days || input.interval_days < 1) {
      throw new Error("Indica cada cuántos días (mínimo 1)");
    }
  }
  if (input.recurrence === "weekly") {
    const days = input.weekdays ?? [];
    if (days.length === 0) {
      throw new Error("Selecciona al menos un día de la semana");
    }
  }
}

export function createSchedule(
  condominioId: number,
  input: ServiceScheduleInput
): ServiceSchedule {
  validateScheduleInput(input);
  const result = db
    .prepare(
      `INSERT INTO condominio_service_schedules
        (condominio_id, service_type_id, title, start_date, time, recurrence,
         interval_days, weekdays, notes, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      condominioId,
      input.service_type_id,
      input.title?.trim() || null,
      input.start_date,
      input.time?.trim() || null,
      input.recurrence,
      input.recurrence === "every_n_days" ? input.interval_days ?? null : null,
      input.recurrence === "weekly"
        ? JSON.stringify(input.weekdays ?? [])
        : null,
      input.notes?.trim() || null,
      input.active === false ? 0 : 1
    );
  return getSchedule(condominioId, Number(result.lastInsertRowid))!;
}

export function updateSchedule(
  condominioId: number,
  scheduleId: number,
  input: Partial<ServiceScheduleInput>
): ServiceSchedule | null {
  const existing = getSchedule(condominioId, scheduleId);
  if (!existing) return null;

  const merged: ServiceScheduleInput = {
    service_type_id: input.service_type_id ?? existing.service_type_id,
    title: input.title !== undefined ? input.title : existing.title,
    start_date: input.start_date ?? existing.start_date,
    time: input.time !== undefined ? input.time : existing.time,
    recurrence: input.recurrence ?? existing.recurrence,
    interval_days:
      input.interval_days !== undefined
        ? input.interval_days
        : existing.interval_days,
    weekdays:
      input.weekdays !== undefined ? input.weekdays : existing.weekdays,
    notes: input.notes !== undefined ? input.notes : existing.notes,
    active: input.active !== undefined ? input.active : existing.active,
  };

  validateScheduleInput(merged);

  db.prepare(
    `UPDATE condominio_service_schedules
     SET service_type_id = ?, title = ?, start_date = ?, time = ?, recurrence = ?,
         interval_days = ?, weekdays = ?, notes = ?, active = ?,
         updated_at = unixepoch()
     WHERE id = ? AND condominio_id = ?`
  ).run(
    merged.service_type_id,
    merged.title?.trim() || null,
    merged.start_date,
    merged.time?.trim() || null,
    merged.recurrence,
    merged.recurrence === "every_n_days" ? merged.interval_days ?? null : null,
    merged.recurrence === "weekly"
      ? JSON.stringify(merged.weekdays ?? [])
      : null,
    merged.notes?.trim() || null,
    merged.active === false ? 0 : 1,
    scheduleId,
    condominioId
  );

  return getSchedule(condominioId, scheduleId);
}

export function deleteSchedule(
  condominioId: number,
  scheduleId: number
): boolean {
  const result = db
    .prepare(
      "DELETE FROM condominio_service_schedules WHERE id = ? AND condominio_id = ?"
    )
    .run(scheduleId, condominioId);
  return result.changes > 0;
}

export function formatRecurrenceLabel(schedule: ServiceSchedule): string {
  switch (schedule.recurrence) {
    case "once":
      return "Una sola vez";
    case "daily":
      return "Todos los días";
    case "weekly": {
      const days = (schedule.weekdays ?? [])
        .slice()
        .sort((a, b) => a - b)
        .map((d) => WEEKDAY_LABELS[d] ?? String(d));
      return days.length > 0
        ? `Cada ${days.join(", ")}`
        : "Semanal";
    }
    case "every_n_days":
      return `Cada ${schedule.interval_days ?? "?"} días`;
    case "monthly":
      return "Cada mes (mismo día)";
    default:
      return schedule.recurrence;
  }
}

export function computeNextOccurrences(
  schedule: Pick<
    ServiceSchedule,
    "start_date" | "recurrence" | "interval_days" | "weekdays"
  >,
  fromDate: Date = new Date(),
  limit = 3
): string[] {
  const from = parseDateOnly(formatDateOnly(fromDate));
  const start = parseDateOnly(schedule.start_date);
  const results: string[] = [];

  if (schedule.recurrence === "once") {
    if (start >= from) results.push(formatDateOnly(start));
    return results.slice(0, limit);
  }

  if (schedule.recurrence === "daily") {
    let cursor = start < from ? from : start;
    while (results.length < limit) {
      results.push(formatDateOnly(cursor));
      cursor = addDays(cursor, 1);
    }
    return results;
  }

  if (schedule.recurrence === "every_n_days") {
    const interval = Math.max(1, schedule.interval_days ?? 1);
    let cursor = start;
    while (cursor < from) {
      cursor = addDays(cursor, interval);
    }
    while (results.length < limit) {
      results.push(formatDateOnly(cursor));
      cursor = addDays(cursor, interval);
    }
    return results;
  }

  if (schedule.recurrence === "weekly") {
    const days = new Set(schedule.weekdays ?? []);
    if (days.size === 0) return [];
    let cursor = from < start ? start : from;
    let guard = 0;
    while (results.length < limit && guard < 400) {
      if (cursor >= start && days.has(cursor.getDay())) {
        results.push(formatDateOnly(cursor));
      }
      cursor = addDays(cursor, 1);
      guard += 1;
    }
    return results;
  }

  if (schedule.recurrence === "monthly") {
    const dayOfMonth = start.getDate();
    let year = from.getFullYear();
    let month = from.getMonth();
    let guard = 0;
    while (results.length < limit && guard < 48) {
      const candidate = new Date(year, month, dayOfMonth, 12, 0, 0, 0);
      // Skip invalid dates (e.g. Feb 31 → rolls over)
      if (
        candidate.getMonth() === month &&
        candidate.getDate() === dayOfMonth &&
        candidate >= start &&
        candidate >= from
      ) {
        results.push(formatDateOnly(candidate));
      }
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
      guard += 1;
    }
    return results;
  }

  return results;
}

export function matchServiceTypeFromQuery(
  query: string
): { type: ServiceType; score: number } | null {
  const tokens = getSearchTokens(query);
  const hay = normalizeQuery(query);
  if (tokens.length === 0 && !hay) return null;

  let best: { type: ServiceType; score: number } | null = null;
  for (const type of listServiceTypes(true)) {
    const keywords = type.keywords
      .split(",")
      .map((k) => normalizeQuery(k.trim()))
      .filter(Boolean);
    const nameTokens = getSearchTokens(type.name);
    let score = 0;

    for (const kw of keywords) {
      if (kw.length >= 3 && hay.includes(kw)) score += 4;
      for (const token of tokens) {
        if (token === kw || (kw.length >= 4 && token.includes(kw))) score += 3;
        if (kw.includes(token) && token.length >= 4) score += 2;
      }
    }

    for (const nt of nameTokens) {
      if (hay.includes(nt)) score += 2;
      if (tokens.includes(nt)) score += 2;
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { type, score };
    }
  }

  return best && best.score >= 2 ? best : null;
}

export function looksLikeServiceScheduleQuestion(query: string): boolean {
  const hay = normalizeQuery(query);
  const hints = [
    "cuando",
    "cuándo",
    "horario",
    "pasa",
    "pasan",
    "programacion",
    "programación",
    "fecha",
    "dia",
    "día",
    "semana",
    "cada cuanto",
    "cada cuánto",
  ];
  if (hints.some((h) => hay.includes(normalizeQuery(h)))) return true;
  return matchServiceTypeFromQuery(query) != null;
}

export function buildServiceScheduleContext(
  condominioId: number,
  query?: string
): string {
  const match = query ? matchServiceTypeFromQuery(query) : null;
  let schedules = listSchedulesForCondominio(condominioId, {
    activeOnly: true,
  });

  if (match) {
    const filtered = schedules.filter(
      (s) => s.service_type_id === match.type.id
    );
    if (filtered.length > 0) schedules = filtered;
  }

  if (schedules.length === 0) return "";

  const today = new Date();
  return schedules
    .map((s) => {
      const label = s.title?.trim() || s.service_type_name || "Servicio";
      const next = computeNextOccurrences(s, today, 3);
      const timePart = s.time ? ` a las ${s.time}` : "";
      const nextPart =
        next.length > 0
          ? `Próximas fechas: ${next.join(", ")}${timePart}.`
          : "Sin próximas fechas calculadas.";
      const notes = s.notes?.trim() ? ` Notas: ${s.notes.trim()}.` : "";
      return `- ${label}: ${formatRecurrenceLabel(s)}. ${nextPart}${notes}`;
    })
    .join("\n");
}

export function formatDirectServiceScheduleReply(
  condominioId: number,
  condominioName: string,
  query: string
): string | null {
  if (!looksLikeServiceScheduleQuestion(query)) return null;
  const match = matchServiceTypeFromQuery(query);
  if (!match) return null;

  const schedules = listSchedulesForCondominio(condominioId, {
    activeOnly: true,
  }).filter((s) => s.service_type_id === match.type.id);

  if (schedules.length === 0) return null;

  const today = new Date();
  const lines = schedules.map((s) => {
    const next = computeNextOccurrences(s, today, 3);
    const timePart = s.time ? ` a las ${s.time}` : "";
    const nextPart =
      next.length > 0
        ? `Próximas fechas: ${next.join(", ")}${timePart}`
        : formatRecurrenceLabel(s);
    const notes = s.notes?.trim() ? `\n${s.notes.trim()}` : "";
    return `• ${formatRecurrenceLabel(s)}. ${nextPart}.${notes}`;
  });

  return (
    `En ${condominioName}, la programación de ${match.type.name} es:\n` +
    lines.join("\n")
  );
}

initServiceSchedulesSchema();
