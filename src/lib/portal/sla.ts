/**
 * Servicio: SLA (Service Level Agreement) para tickets.
 *
 * - Un SLA tiene un deadline en días hábiles desde la creación.
 * - El SLA puede pausarse (ej. esperando respuesta del cliente) y reanudarse.
 * - Los días hábiles excluyen sábados, domingos y días festivos configurados.
 * - Al reanudar, el deadline se recalcula sumando los días hábiles restantes
 *   a partir del momento de la reanudación.
 *
 * Estados del SLA: active | paused | completed | escalated
 */
import db from "../db-connection";
import { initPhase3Schema } from "./schema-phase3";

initPhase3Schema();

// ── Días festivos MX (base) ──────────────────────────────────────────────────
// Lista de festivos fijos en formato "MM-DD". Extensible por config.
const FIXED_HOLIDAYS_MX: ReadonlySet<string> = new Set([
  "01-01", // Año Nuevo
  "02-05", // Constitución
  "03-21", // Natalicio Juárez
  "05-01", // Día del Trabajo
  "09-16", // Independencia
  "11-02", // Día de Muertos (no oficial federal, pero común)
  "11-20", // Revolución
  "12-25", // Navidad
]);

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type SlaStatus = "active" | "paused" | "completed" | "escalated";

export interface SlaState {
  ticketId: number;
  slaStatus: SlaStatus;
  slaTargetAt: number | null;
  slaPausedAt: number | null;
  /** Días hábiles restantes (estimado, solo cuando está activo) */
  businessDaysRemaining: number | null;
  isOverdue: boolean;
}

export interface SlaEvent {
  id: number;
  ticketId: number;
  eventType: "started" | "paused" | "resumed" | "completed" | "escalated";
  reason: string | null;
  targetAt: number | null;
  pausedAt: number | null;
  resumedAt: number | null;
  createdBy: string | null;
  createdAt: number;
}

interface SlaEventRow {
  id: number;
  ticket_id: number;
  event_type: string;
  reason: string | null;
  target_at: number | null;
  paused_at: number | null;
  resumed_at: number | null;
  created_by: string | null;
  created_at: number;
}

function mapEvent(row: SlaEventRow): SlaEvent {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    eventType: row.event_type as SlaEvent["eventType"],
    reason: row.reason,
    targetAt: row.target_at,
    pausedAt: row.paused_at,
    resumedAt: row.resumed_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

// ── Business-day helpers ──────────────────────────────────────────────────────

/**
 * Verifica si una fecha es día hábil (lunes–viernes, no festivo fijo MX).
 * Usa siempre métodos UTC para evitar desfase por zona horaria.
 * @param date Fecha a evaluar
 * @param extraHolidays Festivos adicionales en formato "YYYY-MM-DD" o "MM-DD"
 */
export function isBusinessDay(date: Date, extraHolidays: string[] = []): boolean {
  const day = date.getUTCDay(); // 0=Dom, 6=Sáb  (UTC)
  if (day === 0 || day === 6) return false;

  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const yyyy = String(date.getUTCFullYear());
  const monthDay = `${mm}-${dd}`;
  const iso = `${yyyy}-${mm}-${dd}`; // "YYYY-MM-DD" en UTC

  if (FIXED_HOLIDAYS_MX.has(monthDay)) return false;
  if (extraHolidays.includes(monthDay) || extraHolidays.includes(iso)) return false;

  return true;
}

/**
 * Calcula la fecha (unix epoch) que resulta de avanzar N días hábiles
 * desde `fromDate` (inclusive si es hábil, o primer hábil siguiente).
 *
 * @param fromDate  Fecha/hora de inicio
 * @param days      Días hábiles a avanzar (>= 0)
 * @param extraHolidays Festivos adicionales
 * @returns Unix epoch (segundos) del deadline al final del día hábil
 */
export function addBusinessDays(
  fromDate: Date,
  days: number,
  extraHolidays: string[] = []
): number {
  if (days < 0) throw new Error("Los días hábiles deben ser >= 0");

  // Trabajamos en UTC para evitar problemas de DST
  let cursor = new Date(fromDate);
  cursor.setUTCHours(0, 0, 0, 0);

  let added = 0;
  // Avanzar hasta llegar al día hábil número `days`
  while (added < days) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isBusinessDay(cursor, extraHolidays)) {
      added += 1;
    }
  }

  // Deadline al final del día hábil (23:59:59 UTC)
  cursor.setUTCHours(23, 59, 59, 0);
  return Math.floor(cursor.getTime() / 1000);
}

/**
 * Cuenta cuántos días hábiles hay en el intervalo [from, to).
 *   - `from` es INCLUSIVO (se cuenta si es hábil).
 *   - `to`   es EXCLUSIVO (no se cuenta).
 *
 * Ejemplos:
 *   countBusinessDays(lunes, sábado) = 5  (lun–vie inclusive)
 *   countBusinessDays(d, d) = 0
 *   countBusinessDays(miércoles, viernes) = 2  (mié, jue)
 */
export function countBusinessDays(
  from: Date,
  to: Date,
  extraHolidays: string[] = []
): number {
  let count = 0;
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(0, 0, 0, 0);

  while (cursor.getTime() < end.getTime()) {
    if (isBusinessDay(cursor, extraHolidays)) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

// ── SLA Operations ────────────────────────────────────────────────────────────

interface TicketSlaRow {
  sla_status: string | null;
  sla_target_at: number | null;
  sla_paused_at: number | null;
}

function getTicketSlaRow(ticketId: number): TicketSlaRow | null {
  return (
    (db
      .prepare("SELECT sla_status, sla_target_at, sla_paused_at FROM tickets WHERE id = ?")
      .get(ticketId) as TicketSlaRow | undefined) ?? null
  );
}

export function getSlaState(ticketId: number): SlaState | null {
  const row = getTicketSlaRow(ticketId);
  if (!row) return null;

  const status = (row.sla_status ?? "active") as SlaStatus;
  const now = Math.floor(Date.now() / 1000);
  const isOverdue =
    status === "active" &&
    row.sla_target_at != null &&
    row.sla_target_at < now;

  let businessDaysRemaining: number | null = null;
  if (status === "active" && row.sla_target_at != null && !isOverdue) {
    businessDaysRemaining = countBusinessDays(new Date(), new Date(row.sla_target_at * 1000));
  }

  return {
    ticketId,
    slaStatus: status,
    slaTargetAt: row.sla_target_at,
    slaPausedAt: row.sla_paused_at,
    businessDaysRemaining,
    isOverdue,
  };
}

/** Verifica si el SLA de un ticket está en estado terminal (no debe modificarse). */
function isSlaTerminal(row: TicketSlaRow): boolean {
  return row.sla_status === "completed" || row.sla_status === "escalated";
}

/**
 * Inicia el SLA de un ticket con N días hábiles de deadline.
 *
 * Idempotente:
 * - Si ya está activo o pausado → devuelve el estado actual.
 * - Si está completed → NO reinicia (devuelve estado sin cambios).
 * Atómico: actualiza ticket y registra evento en una sola transacción.
 */
export function startSla(
  ticketId: number,
  businessDays: number,
  opts: { createdBy?: string; extraHolidays?: string[] } = {}
): SlaState | null {
  const current = getTicketSlaRow(ticketId);
  if (!current) return null;

  // Si ya hay target (activo/pausado) o está terminado, no reiniciar.
  if (current.sla_target_at != null || isSlaTerminal(current)) {
    return getSlaState(ticketId);
  }

  const targetAt = addBusinessDays(new Date(), businessDays, opts.extraHolidays);

  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE tickets SET sla_target_at = ?, sla_status = 'active', sla_paused_at = NULL WHERE id = ?"
    ).run(targetAt, ticketId);

    db.prepare(
      `INSERT INTO sla_events (ticket_id, event_type, target_at, created_by)
       VALUES (?, 'started', ?, ?)`
    ).run(ticketId, targetAt, opts.createdBy ?? null);
  });
  tx();

  return getSlaState(ticketId);
}

/**
 * Pausa el SLA. El tiempo consumido se "congela" hasta la reanudación.
 *
 * Idempotente:
 * - Si ya está pausado → devuelve estado sin cambios.
 * - Si está completed/escalated → devuelve estado sin cambios (no pausar un SLA terminal).
 * Atómico: ticket + evento en una sola transacción.
 */
export function pauseSla(
  ticketId: number,
  opts: { reason?: string; createdBy?: string } = {}
): SlaState | null {
  const row = getTicketSlaRow(ticketId);
  if (!row) return null;
  // No modificar SLA terminal ni ya pausado.
  if (isSlaTerminal(row) || row.sla_status !== "active") {
    return getSlaState(ticketId);
  }

  const now = Math.floor(Date.now() / 1000);

  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE tickets SET sla_status = 'paused', sla_paused_at = ? WHERE id = ?"
    ).run(now, ticketId);

    db.prepare(
      `INSERT INTO sla_events (ticket_id, event_type, reason, paused_at, target_at, created_by)
       VALUES (?, 'paused', ?, ?, ?, ?)`
    ).run(ticketId, opts.reason ?? null, now, row.sla_target_at, opts.createdBy ?? null);
  });
  tx();

  return getSlaState(ticketId);
}

/**
 * Reanuda un SLA pausado.
 * El deadline se recalcula sumando los días hábiles restantes al momento de la
 * reanudación (preserva el tiempo ya consumido antes de la pausa).
 *
 * Idempotente:
 * - Si ya está activo → devuelve estado sin cambios.
 * - Si está completed/escalated → devuelve estado sin cambios.
 * Atómico: ticket + evento en una sola transacción.
 */
export function resumeSla(
  ticketId: number,
  opts: { reason?: string; createdBy?: string; extraHolidays?: string[] } = {}
): SlaState | null {
  const row = getTicketSlaRow(ticketId);
  if (!row) return null;
  // No modificar SLA terminal ni ya activo.
  if (isSlaTerminal(row) || row.sla_status !== "paused") {
    return getSlaState(ticketId);
  }

  const now = new Date();
  const nowEpoch = Math.floor(now.getTime() / 1000);

  // Calcular días hábiles restantes desde el momento en que se pausó hasta el target.
  // El deadline se almacena como 23:59:59 del día límite; usamos el DÍA SIGUIENTE como
  // extremo exclusivo para que el día del deadline cuente como día hábil completo.
  let remainingDays = 0;
  if (row.sla_paused_at != null && row.sla_target_at != null) {
    const pausedDate = new Date(row.sla_paused_at * 1000);
    const targetPlusOne = new Date(row.sla_target_at * 1000);
    targetPlusOne.setUTCDate(targetPlusOne.getUTCDate() + 1); // exclusivo
    remainingDays = countBusinessDays(pausedDate, targetPlusOne, opts.extraHolidays);
  }

  const newTargetAt = addBusinessDays(now, remainingDays, opts.extraHolidays);

  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE tickets SET sla_status = 'active', sla_paused_at = NULL, sla_target_at = ? WHERE id = ?"
    ).run(newTargetAt, ticketId);

    db.prepare(
      `INSERT INTO sla_events (ticket_id, event_type, reason, resumed_at, target_at, created_by)
       VALUES (?, 'resumed', ?, ?, ?, ?)`
    ).run(ticketId, opts.reason ?? null, nowEpoch, newTargetAt, opts.createdBy ?? null);
  });
  tx();

  return getSlaState(ticketId);
}

/**
 * Marca el SLA de un ticket como completado.
 * Idempotente si ya está completado.
 * Atómico: ticket + evento en una sola transacción.
 */
export function completeSla(
  ticketId: number,
  opts: { createdBy?: string } = {}
): SlaState | null {
  const row = getTicketSlaRow(ticketId);
  if (!row) return null;
  if (row.sla_status === "completed") return getSlaState(ticketId); // idempotente

  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE tickets SET sla_status = 'completed' WHERE id = ?"
    ).run(ticketId);

    db.prepare(
      `INSERT INTO sla_events (ticket_id, event_type, created_by)
       VALUES (?, 'completed', ?)`
    ).run(ticketId, opts.createdBy ?? null);
  });
  tx();

  return getSlaState(ticketId);
}

/** Historial de eventos SLA de un ticket. */
export function getSlaEvents(ticketId: number): SlaEvent[] {
  const rows = db
    .prepare(
      "SELECT * FROM sla_events WHERE ticket_id = ? ORDER BY created_at"
    )
    .all(ticketId) as SlaEventRow[];
  return rows.map(mapEvent);
}
