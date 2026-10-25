/**
 * Servicio: Catálogo de modificaciones + configuración por desarrollo.
 *
 * - Una modificación del catálogo puede habilitarse/deshabilitarse por desarrollo.
 * - Una modificación debe configurarse explícitamente por Admin para cada desarrollo.
 * - Un ticket solo puede contener UNA modificación.
 */
import db from "../db-connection";
import { getDevelopment } from "./developments";
import {
  getDocumentRequirements,
  getModificationFormSchema,
} from "./modification-form-schema";
import { listClaimsForUser } from "./property-claims";
import { initPhase3Schema } from "./schema-phase3";

initPhase3Schema();

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ModificationCatalogItem {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  requiresPdfTemplate: string | null;
  /** true si está activo globalmente (sin necesitar config por dev) */
  globalActive: boolean;
  sortOrder: number;
  createdAt: number;
}

export interface DevelopmentModificationConfig {
  id: number;
  developmentId: number;
  modificationCatalogId: number;
  active: boolean;
  maxPerTicket: number;
  extraConfig: Record<string, unknown> | null;
  createdAt: number;
  /** Campos del catálogo enriquecidos (disponibles al listar por desarrollo) */
  modification?: ModificationCatalogItem;
}

interface CatalogRow {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  requires_pdf_template: string | null;
  global_active: number;
  sort_order: number;
  created_at: number;
}

interface ConfigRow {
  id: number;
  development_id: number;
  modification_catalog_id: number;
  active: number;
  max_per_ticket: number;
  extra_config: string | null;
  created_at: number;
}

function mapCatalogItem(row: CatalogRow): ModificationCatalogItem {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    requiresPdfTemplate: row.requires_pdf_template,
    globalActive: Boolean(row.global_active),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

function mapConfig(
  row: ConfigRow,
  mod?: ModificationCatalogItem
): DevelopmentModificationConfig {
  let extraConfig: Record<string, unknown> | null = null;
  if (row.extra_config) {
    try {
      const parsed = JSON.parse(row.extra_config);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        extraConfig = parsed as Record<string, unknown>;
      }
    } catch {
      // malformed JSON → ignorar
    }
  }
  return {
    id: row.id,
    developmentId: row.development_id,
    modificationCatalogId: row.modification_catalog_id,
    active: Boolean(row.active),
    maxPerTicket: row.max_per_ticket,
    extraConfig,
    createdAt: row.created_at,
    modification: mod,
  };
}

// ── Catálogo global ───────────────────────────────────────────────────────────

/** Lista todos los ítems del catálogo (activos o no globalmente). */
export function listCatalog(opts: { globalActiveOnly?: boolean } = {}): ModificationCatalogItem[] {
  const where = opts.globalActiveOnly ? "WHERE global_active = 1" : "";
  const rows = db
    .prepare(
      `SELECT * FROM modification_catalog ${where} ORDER BY sort_order, name`
    )
    .all() as CatalogRow[];
  return rows.map(mapCatalogItem);
}

export function getCatalogItemBySlug(slug: string): ModificationCatalogItem | null {
  const row = db
    .prepare("SELECT * FROM modification_catalog WHERE slug = ?")
    .get(slug) as CatalogRow | undefined;
  return row ? mapCatalogItem(row) : null;
}

export function getCatalogItem(id: number): ModificationCatalogItem | null {
  const row = db
    .prepare("SELECT * FROM modification_catalog WHERE id = ?")
    .get(id) as CatalogRow | undefined;
  return row ? mapCatalogItem(row) : null;
}

// ── Configuración por desarrollo ──────────────────────────────────────────────

/**
 * Lista las modificaciones habilitadas para un desarrollo específico.
 * Solo devuelve las que tienen `active = 1` en `development_modification_config`.
 */
export function listModificationsForDevelopment(
  developmentId: number,
  opts: { activeOnly?: boolean } = {}
): DevelopmentModificationConfig[] {
  const where = opts.activeOnly !== false ? "AND dmc.active = 1" : "";
  const rows = db
    .prepare(
      `SELECT dmc.*, mc.name, mc.slug, mc.description, mc.requires_pdf_template,
              mc.global_active, mc.sort_order, mc.created_at AS mc_created_at
       FROM development_modification_config dmc
       JOIN modification_catalog mc ON mc.id = dmc.modification_catalog_id
       WHERE dmc.development_id = ? ${where}
       ORDER BY mc.sort_order, mc.name`
    )
    .all(developmentId) as Array<
    ConfigRow & {
      name: string;
      slug: string;
      description: string | null;
      requires_pdf_template: string | null;
      global_active: number;
      sort_order: number;
      mc_created_at: number;
    }
  >;

  return rows.map((row) => {
    const mod: ModificationCatalogItem = {
      id: row.modification_catalog_id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      requiresPdfTemplate: row.requires_pdf_template,
      globalActive: Boolean(row.global_active),
      sortOrder: row.sort_order,
      createdAt: row.mc_created_at,
    };
    return mapConfig(row, mod);
  });
}

export type EnableModResult =
  | { ok: true; config: DevelopmentModificationConfig }
  | { ok: false; error: string };

/**
 * Habilita (o upsert) una modificación para un desarrollo.
 * Si ya existe la config, la reactiva y actualiza parámetros.
 */
export function enableModificationForDevelopment(input: {
  developmentId: number;
  modificationCatalogId: number;
  maxPerTicket?: number;
  extraConfig?: Record<string, unknown> | null;
}): EnableModResult {
  const mod = getCatalogItem(input.modificationCatalogId);
  if (!mod) {
    return {
      ok: false,
      error: `Modificación con id ${input.modificationCatalogId} no encontrada en el catálogo.`,
    };
  }

  const devRow = db
    .prepare("SELECT id FROM developments WHERE id = ?")
    .get(input.developmentId) as { id: number } | undefined;
  if (!devRow) {
    return {
      ok: false,
      error: `Desarrollo con id ${input.developmentId} no encontrado.`,
    };
  }

  const extraJson =
    input.extraConfig ? JSON.stringify(input.extraConfig) : null;
  const maxPerTicket = input.maxPerTicket ?? 1;

  db.prepare(`
    INSERT INTO development_modification_config
      (development_id, modification_catalog_id, active, max_per_ticket, extra_config)
    VALUES (?, ?, 1, ?, ?)
    ON CONFLICT(development_id, modification_catalog_id)
    DO UPDATE SET active = 1, max_per_ticket = excluded.max_per_ticket,
                  extra_config = excluded.extra_config
  `).run(input.developmentId, input.modificationCatalogId, maxPerTicket, extraJson);

  const configRow = db
    .prepare(
      `SELECT * FROM development_modification_config
       WHERE development_id = ? AND modification_catalog_id = ?`
    )
    .get(input.developmentId, input.modificationCatalogId) as ConfigRow | undefined;

  if (!configRow) return { ok: false, error: "Error al guardar la configuración." };
  return { ok: true, config: mapConfig(configRow, mod) };
}

/**
 * Desactiva (sin borrar) una modificación de un desarrollo.
 * El registro histórico se conserva.
 */
export function disableModificationForDevelopment(
  developmentId: number,
  modificationCatalogId: number
): boolean {
  const res = db
    .prepare(
      `UPDATE development_modification_config
       SET active = 0
       WHERE development_id = ? AND modification_catalog_id = ?`
    )
    .run(developmentId, modificationCatalogId);
  return res.changes > 0;
}

/**
 * Verifica si una modificación está activa para un desarrollo.
 * Considera también `global_active` del catálogo.
 */
export function isModificationActiveForDevelopment(
  developmentId: number,
  modificationCatalogId: number
): boolean {
  // 1. global_active siempre disponible sin config explícita
  const mod = getCatalogItem(modificationCatalogId);
  if (mod?.globalActive) return true;

  // 2. Config explícita por desarrollo
  const row = db
    .prepare(
      `SELECT active FROM development_modification_config
       WHERE development_id = ? AND modification_catalog_id = ?`
    )
    .get(developmentId, modificationCatalogId) as { active: number } | undefined;

  return Boolean(row?.active);
}


// ── canSubmit helper ──────────────────────────────────────────────────────────

/**
 * Determina si un usuario puede enviar solicitudes de modificación en función
 * del estado de su claim. Se excluyen explícitamente los claims "rejected":
 * un claim rechazado no debe generar más tickets.
 *
 * @param claimStatus Estado del claim activo del usuario, o null si no tiene.
 * @returns true si puede enviar; false si está rechazado o sin claim.
 */
export function canUserSubmitModification(
  claimStatus: string | null
): boolean {
  if (!claimStatus) return false;
  return ["pending", "conflict", "approved"].includes(claimStatus);
}

/** Catálogo que ve el wizard. Misma forma que GET /api/portal/modificaciones/catalog. */
export function buildPortalModificationCatalog(portalUserId: number) {
  const claims = listClaimsForUser(portalUserId);
  const claim =
    claims.find((c) => c.status === "approved") ??
    claims.find((c) => c.status === "pending" || c.status === "conflict") ??
    null;

  if (!claim || !canUserSubmitModification(claim.status)) {
    const activeStatus = claims.length > 0 ? claims[0]!.status : null;
    return {
      modifications: [] as Array<{
        id: number;
        name: string;
        slug: string;
        description: string | null;
        fields: ReturnType<typeof getModificationFormSchema>["fields"];
        requiredDocs: ReturnType<typeof getDocumentRequirements>;
      }>,
      development: null,
      claimStatus: activeStatus,
      canSubmit: canUserSubmitModification(activeStatus),
    };
  }

  const development = getDevelopment(claim.developmentId);
  const configs = listModificationsForDevelopment(claim.developmentId, {
    activeOnly: true,
  });

  const modifications = configs.map((config) => {
    const mod = config.modification!;
    return {
      id: mod.id,
      name: mod.name,
      slug: mod.slug,
      description: mod.description,
      fields: getModificationFormSchema(mod.slug).fields,
      requiredDocs: getDocumentRequirements(mod.slug),
    };
  });

  return {
    modifications,
    development: development
      ? { id: development.id, name: development.name, slug: development.slug }
      : null,
    claimStatus: claim.status,
    canSubmit: true,
    claim: {
      id: claim.id,
      propertyIdentifier: claim.propertyIdentifier,
    },
  };
}
