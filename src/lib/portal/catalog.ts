/**
 * Catálogo público del portal de registro.
 *
 * Lee datos de desarrollos, condominios y viviendas para el formulario de
 * registro escalonado. Todas las funciones son read-only y filtran PII:
 * nunca expone nombre, email, celular ni datos personales de propietarios.
 *
 * Rutas de uso:
 *   GET /api/portal/catalog/developments
 *   GET /api/portal/catalog/condominios?developmentId=X
 *   GET /api/portal/catalog/viviendas?condominioId=X
 */

import db from "../db-connection";
import { initRegistrationAdminSchema } from "./schema-registration-admin";
import { findOrCreateDevelopment } from "./developments";

initRegistrationAdminSchema();

// ── Tipos públicos (sin PII) ──────────────────────────────────────────────────

/** Desarrollo visible públicamente: solo id, name, slug. */
export interface PublicDevelopment {
  id: number;
  name: string;
  slug: string;
}

/** Condominio visible públicamente: solo id, name, prefijo y desarrollo. */
export interface PublicCondominio {
  id: number;
  name: string;
  prefijo: string;
  developmentId?: number | null;
  developmentName?: string | null;
}

/**
 * Vivienda visible públicamente: solo el número de vivienda.
 * SIN id de residente, nombre, email ni celular (anti-enumeración PII).
 * El claim identifier se construye con condominioId (ya conocido por el cliente) + numVivienda.
 */
export interface PublicVivienda {
  numVivienda: number;
}

// ── Queries públicas ──────────────────────────────────────────────────────────

/**
 * Residuos de suites locales (sec-dev, testdev, …). No deben salir
 * en el registro público ni en el selector de condominios.
 */
const HIDDEN_PUBLIC_SLUG_PREFIXES = [
  "sec-dev-",
  "testdev-",
  "wizard-dev-",
  "dev-sig-",
] as const;

function isHiddenPublicDevelopmentSlug(slug: string): boolean {
  return HIDDEN_PUBLIC_SLUG_PREFIXES.some((prefix) => slug.startsWith(prefix));
}

function isPlaceholderCondominio(name: string, prefijo: string): boolean {
  const normalized = name.trim().toLowerCase();
  return (
    normalized === "pendiente de asignacion" ||
    prefijo.trim().toUpperCase() === "PEND"
  );
}

function toPublicCondominio(row: {
  id: number;
  name: string;
  prefijo: string | null;
  development_id?: number | null;
  development_name?: string | null;
}): PublicCondominio {
  return {
    id: row.id,
    name: row.name,
    prefijo: row.prefijo ?? "",
    developmentId: row.development_id ?? null,
    developmentName: row.development_name ?? null,
  };
}

/**
 * Condominios reales del admin (sin el placeholder de asignación).
 * Incluye el desarrollo ya ligado, si existe.
 */
export function listPublicCondominios(): PublicCondominio[] {
  const rows = db
    .prepare(
      `SELECT c.id, c.name, c.prefijo, d.id AS development_id, d.name AS development_name
       FROM condominios c
       LEFT JOIN development_condominios dc ON dc.condominio_id = c.id
       LEFT JOIN developments d ON d.id = dc.development_id AND d.active = 1
       ORDER BY c.name`
    )
    .all() as Array<{
      id: number;
      name: string;
      prefijo: string | null;
      development_id: number | null;
      development_name: string | null;
    }>;

  return rows
    .filter((row) => !isPlaceholderCondominio(row.name, row.prefijo ?? ""))
    .map(toPublicCondominio);
}

/**
 * Lista desarrollos activos. Solo expone id/name/slug.
 * No incluye city ni timestamps. Oculta slugs de fixtures de prueba.
 */
export function listPublicDevelopments(): PublicDevelopment[] {
  const rows = db
    .prepare("SELECT id, name, slug FROM developments WHERE active = 1 ORDER BY name")
    .all() as PublicDevelopment[];
  return rows.filter((row) => !isHiddenPublicDevelopmentSlug(row.slug));
}

/**
 * Condominios del desarrollo: los ya vinculados en admin y los que
 * todavía no tienen desarrollo (para que Solano / Paris no queden ocultos).
 * Solo expone id/name/prefijo — sin datos de propietarios.
 */
export function listPublicCondominiosForDevelopment(developmentId: number): PublicCondominio[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT c.id, c.name, c.prefijo, d.id AS development_id, d.name AS development_name
       FROM condominios c
       LEFT JOIN development_condominios dc ON dc.condominio_id = c.id
       LEFT JOIN developments d ON d.id = dc.development_id AND d.active = 1
       WHERE dc.development_id = ?
          OR dc.development_id IS NULL
       ORDER BY c.name`
    )
    .all(developmentId) as Array<{
      id: number;
      name: string;
      prefijo: string | null;
      development_id: number | null;
      development_name: string | null;
    }>;

  return rows
    .filter((row) => !isPlaceholderCondominio(row.name, row.prefijo ?? ""))
    .map(toPublicCondominio);
}

/**
 * Lista viviendas (num_vivienda) de un condominio.
 * Solo expone residenteId (para construir el claim identifier) y numVivienda.
 * NO expone nombre, email, celular ni cualquier otro dato de PII.
 */
export function listPublicViviendasForCondominio(condominioId: number): PublicVivienda[] {
  const rows = db
    .prepare(
      `SELECT num_vivienda
       FROM residentes
       WHERE condominio_id = ?
         AND num_vivienda IS NOT NULL
       ORDER BY num_vivienda`
    )
    .all(condominioId) as Array<{ num_vivienda: number }>;

  return rows.map((r) => ({ numVivienda: r.num_vivienda }));
}

// ── Administración del mapeo development_condominios ─────────────────────────

/**
 * Vincula un condominio a un desarrollo. Idempotente (INSERT OR IGNORE).
 * Solo admins pueden llamar a esta función (validar en la ruta).
 */
export function linkCondominioToDevelopment(
  developmentId: number,
  condominioId: number
): void {
  db.prepare(
    "INSERT OR IGNORE INTO development_condominios (development_id, condominio_id) VALUES (?, ?)"
  ).run(developmentId, condominioId);
}

/**
 * Asigna un condominio a un solo desarrollo (o lo deja sin desarrollo).
 * El registro del portal exige este vínculo para listar el condominio.
 */
export function setCondominioDevelopment(
  condominioId: number,
  developmentId: number | null
): void {
  const condo = db
    .prepare("SELECT id FROM condominios WHERE id = ?")
    .get(condominioId) as { id: number } | undefined;
  if (!condo) {
    throw new Error("Condominio no encontrado.");
  }

  db.prepare("DELETE FROM development_condominios WHERE condominio_id = ?").run(
    condominioId
  );

  if (developmentId == null) return;

  const development = db
    .prepare("SELECT id FROM developments WHERE id = ? AND active = 1")
    .get(developmentId) as { id: number } | undefined;
  if (!development) {
    throw new Error("Desarrollo no encontrado o inactivo.");
  }

  db.prepare(
    "INSERT INTO development_condominios (development_id, condominio_id) VALUES (?, ?)"
  ).run(developmentId, condominioId);
}

export function resolveDevelopmentAssignment(input: {
  developmentId?: number | null;
  newDevelopmentName?: string | null;
}): number | null {
  const newName = input.newDevelopmentName?.trim();
  if (newName) {
    const created = findOrCreateDevelopment(newName);
    if (!created.ok) throw new Error(created.error);
    return created.development.id;
  }
  return input.developmentId ?? null;
}

export function getDevelopmentForCondominio(
  condominioId: number
): PublicDevelopment | null {
  const row = db
    .prepare(
      `SELECT d.id, d.name, d.slug
       FROM developments d
       JOIN development_condominios dc ON dc.development_id = d.id
       WHERE dc.condominio_id = ?
       ORDER BY d.id
       LIMIT 1`
    )
    .get(condominioId) as PublicDevelopment | undefined;
  return row ?? null;
}

export function mapDevelopmentsByCondominioIds(
  condominioIds: number[]
): Map<number, PublicDevelopment> {
  const map = new Map<number, PublicDevelopment>();
  if (condominioIds.length === 0) return map;

  const placeholders = condominioIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT dc.condominio_id AS condominioId, d.id, d.name, d.slug
       FROM development_condominios dc
       JOIN developments d ON d.id = dc.development_id
       WHERE dc.condominio_id IN (${placeholders})
       ORDER BY d.id`
    )
    .all(...condominioIds) as Array<
    PublicDevelopment & { condominioId: number }
  >;

  for (const row of rows) {
    if (!map.has(row.condominioId)) {
      map.set(row.condominioId, {
        id: row.id,
        name: row.name,
        slug: row.slug,
      });
    }
  }
  return map;
}

/**
 * Desvincula un condominio de un desarrollo.
 * Solo admins pueden llamar a esta función (validar en la ruta).
 */
export function unlinkCondominioFromDevelopment(
  developmentId: number,
  condominioId: number
): void {
  db.prepare(
    "DELETE FROM development_condominios WHERE development_id = ? AND condominio_id = ?"
  ).run(developmentId, condominioId);
}

/**
 * Lista solo condominios ya vinculados a un desarrollo (admin / mapeo).
 */
export function listCondominiosLinkedToDevelopment(
  developmentId: number
): PublicCondominio[] {
  const rows = db
    .prepare(
      `SELECT c.id, c.name, c.prefijo
       FROM condominios c
       JOIN development_condominios dc ON dc.condominio_id = c.id
       WHERE dc.development_id = ?
       ORDER BY c.name`
    )
    .all(developmentId) as Array<{ id: number; name: string; prefijo: string | null }>;

  return rows.map(toPublicCondominio);
}

/**
 * Construye el property_identifier estándar para un claim.
 * Formato: "{condominioId}:{numVivienda}" (e.g. "5:42")
 */
export function buildPropertyIdentifier(
  condominioId: number,
  numVivienda: number
): string {
  return `${condominioId}:${numVivienda}`;
}

/**
 * Parsea un property_identifier en condominioId y numVivienda.
 * Retorna null si el formato es inválido.
 */
export function parsePropertyIdentifier(
  identifier: string
): { condominioId: number; numVivienda: number } | null {
  const parts = identifier.split(":");
  if (parts.length !== 2) return null;
  const condominioId = parseInt(parts[0], 10);
  const numVivienda = parseInt(parts[1], 10);
  if (isNaN(condominioId) || isNaN(numVivienda)) return null;
  return { condominioId, numVivienda };
}
