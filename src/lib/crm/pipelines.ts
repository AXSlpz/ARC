import db from "../db-connection";
import { broadcastDashboard } from "../ws-notify";
import { CrmError } from "./errors";
import { requireProspecto } from "./prospectos";
import { insertDefaultStages } from "./schema";
import type { Deal, DealStatus, Pipeline, PipelineStage } from "./types";

function now(): number {
  return Math.floor(Date.now() / 1000);
}

interface PipelineRow {
  id: number;
  name: string;
  created_at: number;
  updated_at: number;
}

interface StageRow {
  id: number;
  pipeline_id: number;
  name: string;
  position: number;
  color: string;
}

function mapStage(row: StageRow): PipelineStage {
  return {
    id: row.id,
    pipeline_id: row.pipeline_id,
    name: row.name,
    position: row.position,
    color: row.color,
  };
}

function stagesFor(pipelineId: number): PipelineStage[] {
  return (
    db
      .prepare(
        "SELECT * FROM pipeline_stages WHERE pipeline_id = ? ORDER BY position, id",
      )
      .all(pipelineId) as StageRow[]
  ).map(mapStage);
}

function mapPipeline(row: PipelineRow): Pipeline {
  return {
    id: row.id,
    name: row.name,
    created_at: row.created_at,
    updated_at: row.updated_at,
    stages: stagesFor(row.id),
  };
}

export function listPipelines(): Pipeline[] {
  const rows = db
    .prepare("SELECT * FROM pipelines ORDER BY id")
    .all() as PipelineRow[];
  return rows.map(mapPipeline);
}

export function getPipeline(id: number): Pipeline | null {
  const row = db
    .prepare("SELECT * FROM pipelines WHERE id = ?")
    .get(id) as PipelineRow | undefined;
  return row ? mapPipeline(row) : null;
}

export function requirePipeline(id: number): Pipeline {
  const item = getPipeline(id);
  if (!item) throw new CrmError("Embudo no encontrado", 404);
  return item;
}

export function createPipeline(name: string): Pipeline {
  const ts = now();
  const result = db
    .prepare("INSERT INTO pipelines (name, created_at, updated_at) VALUES (?, ?, ?)")
    .run(name.trim(), ts, ts);
  insertDefaultStages(Number(result.lastInsertRowid));
  broadcastDashboard("crm");
  return requirePipeline(Number(result.lastInsertRowid));
}

export function updatePipeline(id: number, name: string): Pipeline {
  requirePipeline(id);
  db.prepare("UPDATE pipelines SET name = ?, updated_at = ? WHERE id = ?").run(
    name.trim(),
    now(),
    id,
  );
  broadcastDashboard("crm");
  return requirePipeline(id);
}

export function deletePipeline(id: number): void {
  requirePipeline(id);
  const quotes = db
    .prepare(
      `SELECT COUNT(*) AS n
       FROM quotes q
       JOIN deals d ON d.id = q.deal_id
       WHERE d.pipeline_id = ?`,
    )
    .get(id) as { n: number };
  if (quotes.n > 0) {
    throw new CrmError(
      "No se puede eliminar: hay cotizaciones ligadas a tratos de este embudo",
      409,
    );
  }
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM deals WHERE pipeline_id = ?").run(id);
    db.prepare("DELETE FROM pipelines WHERE id = ?").run(id);
  });
  tx();
  broadcastDashboard("crm");
}

export function replacePipelineStages(
  pipelineId: number,
  stages: Array<{ id?: number; name: string; position: number; color?: string }>,
): Pipeline {
  const pipeline = requirePipeline(pipelineId);
  const incomingIds = new Set(
    stages.map((s) => s.id).filter((id): id is number => typeof id === "number"),
  );

  const tx = db.transaction(() => {
    for (const existing of pipeline.stages) {
      if (incomingIds.has(existing.id)) continue;
      const used = db
        .prepare("SELECT COUNT(*) AS n FROM deals WHERE stage_id = ?")
        .get(existing.id) as { n: number };
      if (used.n > 0) {
        throw new CrmError(
          `No se puede quitar la etapa "${existing.name}": tiene oportunidades`,
          409,
        );
      }
      db.prepare("DELETE FROM pipeline_stages WHERE id = ? AND pipeline_id = ?").run(
        existing.id,
        pipelineId,
      );
    }

    for (const stage of stages) {
      const color = stage.color ?? "#3b82f6";
      if (stage.id) {
        const owned = pipeline.stages.some((s) => s.id === stage.id);
        if (!owned) throw new CrmError("Etapa inválida para este embudo", 400);
        db.prepare(
          `UPDATE pipeline_stages
           SET name = ?, position = ?, color = ?
           WHERE id = ? AND pipeline_id = ?`,
        ).run(stage.name.trim(), stage.position, color, stage.id, pipelineId);
      } else {
        db.prepare(
          `INSERT INTO pipeline_stages (pipeline_id, name, position, color)
           VALUES (?, ?, ?, ?)`,
        ).run(pipelineId, stage.name.trim(), stage.position, color);
      }
    }
    db.prepare("UPDATE pipelines SET updated_at = ? WHERE id = ?").run(
      now(),
      pipelineId,
    );
  });
  tx();
  broadcastDashboard("crm");
  return requirePipeline(pipelineId);
}

interface DealRow {
  id: number;
  pipeline_id: number;
  stage_id: number;
  prospecto_id: number;
  prospecto_name: string;
  assigned_to_user_id: number | null;
  assignee_name: string | null;
  title: string;
  value: number;
  currency: string;
  notes: string | null;
  expected_close_date: string | null;
  status: DealStatus;
  created_at: number;
  updated_at: number;
}

function mapDeal(row: DealRow): Deal {
  return {
    id: row.id,
    pipeline_id: row.pipeline_id,
    stage_id: row.stage_id,
    prospecto_id: row.prospecto_id,
    prospecto_name: row.prospecto_name,
    assigned_to_user_id: row.assigned_to_user_id,
    assignee_name: row.assignee_name,
    title: row.title,
    value: row.value,
    currency: row.currency,
    notes: row.notes,
    expected_close_date: row.expected_close_date,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const DEAL_SELECT = `
  SELECT d.*, p.name AS prospecto_name,
         COALESCE(u.display_name, u.username) AS assignee_name
  FROM deals d
  JOIN prospectos p ON p.id = d.prospecto_id
  LEFT JOIN admin_users u ON u.id = d.assigned_to_user_id
`;

export function getDeal(id: number): Deal | null {
  const row = db.prepare(`${DEAL_SELECT} WHERE d.id = ?`).get(id) as
    | DealRow
    | undefined;
  return row ? mapDeal(row) : null;
}

export function requireDeal(id: number): Deal {
  const item = getDeal(id);
  if (!item) throw new CrmError("Oportunidad no encontrada", 404);
  return item;
}

export function listDeals(pipelineId?: number): Deal[] {
  const rows = pipelineId
    ? (db
        .prepare(`${DEAL_SELECT} WHERE d.pipeline_id = ? ORDER BY d.updated_at DESC`)
        .all(pipelineId) as DealRow[])
    : (db
        .prepare(`${DEAL_SELECT} ORDER BY d.updated_at DESC`)
        .all() as DealRow[]);
  return rows.map(mapDeal);
}

function assertStageInPipeline(pipelineId: number, stageId: number): void {
  const stage = db
    .prepare("SELECT id FROM pipeline_stages WHERE id = ? AND pipeline_id = ?")
    .get(stageId, pipelineId) as { id: number } | undefined;
  if (!stage) {
    throw new CrmError("La etapa no pertenece al embudo", 400);
  }
}

function assertAssignee(userId: number | null | undefined): number | null {
  if (userId == null) return null;
  const row = db
    .prepare("SELECT id FROM admin_users WHERE id = ?")
    .get(userId) as { id: number } | undefined;
  if (!row) throw new CrmError("El usuario asignado no existe", 400);
  return row.id;
}

export function createDeal(input: {
  pipeline_id: number;
  stage_id: number;
  prospecto_id: number;
  title: string;
  value?: number;
  currency?: string;
  notes?: string | null;
  expected_close_date?: string | null;
  status?: DealStatus;
  assigned_to_user_id?: number | null;
}): Deal {
  requirePipeline(input.pipeline_id);
  assertStageInPipeline(input.pipeline_id, input.stage_id);
  requireProspecto(input.prospecto_id);
  const assigneeId = assertAssignee(input.assigned_to_user_id);
  const ts = now();
  const result = db
    .prepare(
      `INSERT INTO deals
        (pipeline_id, stage_id, prospecto_id, assigned_to_user_id, title, value, currency, notes, expected_close_date, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.pipeline_id,
      input.stage_id,
      input.prospecto_id,
      assigneeId,
      input.title.trim(),
      input.value ?? 0,
      (input.currency ?? "MXN").trim().toUpperCase() || "MXN",
      input.notes?.trim() || null,
      input.expected_close_date ?? null,
      input.status ?? "open",
      ts,
      ts,
    );
  broadcastDashboard("crm");
  return requireDeal(Number(result.lastInsertRowid));
}

export function updateDeal(
  id: number,
  input: Partial<{
    pipeline_id: number;
    stage_id: number;
    prospecto_id: number;
    title: string;
    value: number;
    currency: string;
    notes: string | null;
    expected_close_date: string | null;
    status: DealStatus;
    assigned_to_user_id: number | null;
  }>,
): Deal {
  const current = requireDeal(id);
  const pipelineId = input.pipeline_id ?? current.pipeline_id;
  const stageId = input.stage_id ?? current.stage_id;
  if (input.pipeline_id) requirePipeline(pipelineId);
  assertStageInPipeline(pipelineId, stageId);
  if (input.prospecto_id) requireProspecto(input.prospecto_id);
  const assigneeId =
    input.assigned_to_user_id !== undefined
      ? assertAssignee(input.assigned_to_user_id)
      : current.assigned_to_user_id;

  db.prepare(
    `UPDATE deals
     SET pipeline_id = ?, stage_id = ?, prospecto_id = ?, assigned_to_user_id = ?, title = ?, value = ?, currency = ?,
         notes = ?, expected_close_date = ?, status = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    pipelineId,
    stageId,
    input.prospecto_id ?? current.prospecto_id,
    assigneeId,
    input.title !== undefined ? input.title.trim() : current.title,
    input.value ?? current.value,
    input.currency !== undefined
      ? input.currency.trim().toUpperCase() || "MXN"
      : current.currency,
    input.notes !== undefined ? input.notes?.trim() || null : current.notes,
    input.expected_close_date !== undefined
      ? input.expected_close_date
      : current.expected_close_date,
    input.status ?? current.status,
    now(),
    id,
  );
  broadcastDashboard("crm");
  return requireDeal(id);
}

export function setDealStatus(id: number, status: DealStatus): Deal {
  return updateDeal(id, { status });
}

export function deleteDeal(id: number): void {
  requireDeal(id);
  const quotes = db
    .prepare("SELECT COUNT(*) AS n FROM quotes WHERE deal_id = ?")
    .get(id) as { n: number };
  if (quotes.n > 0) {
    throw new CrmError(
      "No se puede eliminar: la oportunidad tiene cotizaciones",
      409,
    );
  }
  db.prepare("DELETE FROM deals WHERE id = ?").run(id);
  broadcastDashboard("crm");
}
