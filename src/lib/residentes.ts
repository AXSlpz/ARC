import db from "./db-connection";
import { phoneLookupCandidates } from "./phone-normalize";
import { broadcastDashboard } from "./ws-notify";
import {
  normalizeSpanishText,
  normalizeEmailText,
  normalizeResidenteTextFields,
} from "./text-normalize";
import { initPrototiposSchema } from "./prototipos";

// --- Types ---

import {
  TAG_VEHICULAR_ESTATUS,
  VEHICULO_COLORES,
  type TagVehicularEstatus,
  type VehiculoColor,
} from "./vehiculo-tags";

export {
  TAG_VEHICULAR_ESTATUS,
  VEHICULO_COLORES,
  type TagVehicularEstatus,
  type VehiculoColor,
};

export const CONDOMINIO_TIPOS = ["Vivienda", "Terrenos", "Torres"] as const;
export type CondominioTipo = (typeof CONDOMINIO_TIPOS)[number];

export const CONDOMINIO_ESTATUS = ["Activo", "Entregado"] as const;
export type CondominioEstatus = (typeof CONDOMINIO_ESTATUS)[number];

export interface Condominio {
  id: number;
  name: string;
  prefijo: string;
  tipo: CondominioTipo;
  estatus: CondominioEstatus;
  documentacion_indexada: boolean;
  tags: boolean;
  estados_cuenta: boolean;
  cf_community_id: string | null;
  created_at: number;
  resident_count?: number;
}

export interface CondominioInput {
  name: string;
  prefijo: string;
  tipo?: CondominioTipo;
  estatus?: CondominioEstatus;
  documentacion_indexada?: boolean;
  tags?: boolean;
  estados_cuenta?: boolean;
  cf_community_id?: string | null;
}

export interface CondominioFilters {
  search?: string;
  page?: number;
  limit?: number;
}

export interface CondominioListResult {
  data: Condominio[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Residente {
  id: number;
  condominio_id: number;
  condominio_name: string;
  condominio_prefijo: string;
  num_vivienda: number | null;
  num_coto: string | null;
  /** Columna legado; ya no se usa ni se muestra. */
  cf_property_id: string | null;
  prototipo_id: number | null;
  prototipo_name?: string | null;
  nombre: string;
  celular: number | null;
  email: string | null;
  fecha_entrega: string | null;
  metros_cuadrados: number | null;
  cuota_int: number | null;
  cuota_ext: number | null;
  cuota_completa: number | null;
  cuota_int_pronpago: number | null;
  cuota_ext_pronpago: number | null;
  cuota_comp_pronpago: number | null;
  servicio_luz: number | null;
  nombre_contacto1: string | null;
  celular_contacto1: number | null;
  parentesco_contacto1: string | null;
  nombre_contacto2: string | null;
  celular_contacto2: number | null;
  parentesco_contacto2: string | null;
  nombre_contacto3: string | null;
  celular_contacto3: number | null;
  parentesco_contacto3: string | null;
  mes_pago: string | null;
  nombre_expropietario: string | null;
  celular_expropietario: number | null;
  fecha_entrega_primer: string | null;
  tag1_estatus: TagVehicularEstatus | null;
  tag1_id: number | null;
  tag1_placa: string | null;
  tag1_modelo: string | null;
  tag1_color: string | null;
  tag2_estatus: TagVehicularEstatus | null;
  tag2_id: number | null;
  tag2_placa: string | null;
  tag2_modelo: string | null;
  tag2_color: string | null;
  /** Ocupado = tiene propietario; Vacante = vivienda libre tras baja/reventa */
  ocupacion: "Ocupado" | "Vacante";
  /** 1 = creado desde el portal, pendiente de asignar condominio/datos (#6). */
  pendiente_asignacion?: number;
  active: number;
  created_at: number;
  updated_at: number;
}

export interface ResidenteInput {
  condominio_id: number;
  num_vivienda?: number | null;
  num_coto?: string | null;
  cf_property_id?: string | null;
  prototipo_id?: number | null;
  nombre: string;
  celular?: number | null;
  email?: string | null;
  fecha_entrega?: string | null;
  metros_cuadrados?: number | null;
  cuota_int?: number | null;
  cuota_ext?: number | null;
  cuota_completa?: number | null;
  cuota_int_pronpago?: number | null;
  cuota_ext_pronpago?: number | null;
  cuota_comp_pronpago?: number | null;
  servicio_luz?: number | null;
  nombre_contacto1?: string | null;
  celular_contacto1?: number | null;
  parentesco_contacto1?: string | null;
  nombre_contacto2?: string | null;
  celular_contacto2?: number | null;
  parentesco_contacto2?: string | null;
  nombre_contacto3?: string | null;
  celular_contacto3?: number | null;
  parentesco_contacto3?: string | null;
  mes_pago?: string | null;
  nombre_expropietario?: string | null;
  celular_expropietario?: number | null;
  fecha_entrega_primer?: string | null;
  tag1_estatus?: TagVehicularEstatus | null;
  tag1_id?: number | null;
  tag1_placa?: string | null;
  tag1_modelo?: string | null;
  tag1_color?: string | null;
  tag2_estatus?: TagVehicularEstatus | null;
  tag2_id?: number | null;
  tag2_placa?: string | null;
  tag2_modelo?: string | null;
  tag2_color?: string | null;
}

export interface ResidenteFilters {
  condominio_id?: number;
  search?: string;
  active?: boolean;
  page?: number;
  limit?: number;
}

export interface ResidenteListResult {
  data: Residente[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ResidenteStats {
  total: number;
  active: number;
  inactive: number;
  vacantes: number;
  byCondominio: { condominio_name: string; count: number }[];
}

export interface CondominioStats {
  total: number;
  activos: number;
  entregados: number;
}

function columnExists(table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  return cols.some((c) => c.name === column);
}

export function buildNumCoto(
  prefijo: string | null | undefined,
  numVivienda: number | null | undefined
): string | null {
  if (!prefijo?.trim() || numVivienda == null) return null;
  return `${prefijo.trim()}-${numVivienda}`;
}

export function sumCuotas(
  a: number | null | undefined,
  b: number | null | undefined
): number | null {
  if (a == null && b == null) return null;
  return (a ?? 0) + (b ?? 0);
}

function resolveComputedFields(
  input: ResidenteInput,
  existing?: Residente | null
): {
  num_coto: string | null;
  cuota_completa: number | null;
  cuota_comp_pronpago: number | null;
} {
  const condoId = input.condominio_id ?? existing?.condominio_id;
  const condo = condoId != null ? getCondominio(condoId) : null;
  const vivienda =
    input.num_vivienda !== undefined
      ? input.num_vivienda
      : (existing?.num_vivienda ?? null);
  const cuotaInt =
    input.cuota_int !== undefined ? input.cuota_int : (existing?.cuota_int ?? null);
  const cuotaExt =
    input.cuota_ext !== undefined ? input.cuota_ext : (existing?.cuota_ext ?? null);
  const cuotaIntPp =
    input.cuota_int_pronpago !== undefined
      ? input.cuota_int_pronpago
      : (existing?.cuota_int_pronpago ?? null);
  const cuotaExtPp =
    input.cuota_ext_pronpago !== undefined
      ? input.cuota_ext_pronpago
      : (existing?.cuota_ext_pronpago ?? null);

  return {
    num_coto: buildNumCoto(condo?.prefijo, vivienda),
    cuota_completa: sumCuotas(cuotaInt, cuotaExt),
    cuota_comp_pronpago: sumCuotas(cuotaIntPp, cuotaExtPp),
  };
}

// --- Schema ---

export function initResidentesSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS condominios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      prefijo TEXT NOT NULL DEFAULT '',
      tipo TEXT NOT NULL DEFAULT 'Vivienda' CHECK(tipo IN ('Vivienda','Terrenos','Torres')),
      estatus TEXT NOT NULL DEFAULT 'Activo' CHECK(estatus IN ('Activo','Entregado')),
      documentacion_indexada INTEGER NOT NULL DEFAULT 0,
      tags INTEGER NOT NULL DEFAULT 0,
      estados_cuenta INTEGER NOT NULL DEFAULT 0,
      cf_community_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS prototipos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      condominio_id INTEGER NOT NULL REFERENCES condominios(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(condominio_id, name)
    );

    CREATE TABLE IF NOT EXISTS residentes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      condominio_id INTEGER NOT NULL REFERENCES condominios(id),
      num_vivienda INTEGER,
      num_coto TEXT,
      cf_property_id TEXT,
      prototipo_id INTEGER,
      nombre TEXT NOT NULL,
      celular INTEGER,
      email TEXT,
      fecha_entrega TEXT,
      metros_cuadrados REAL,
      cuota_int REAL,
      cuota_ext REAL,
      cuota_completa REAL,
      cuota_int_pronpago REAL,
      cuota_ext_pronpago REAL,
      cuota_comp_pronpago REAL,
      servicio_luz REAL,
      nombre_contacto1 TEXT,
      celular_contacto1 INTEGER,
      parentesco_contacto1 TEXT,
      nombre_contacto2 TEXT,
      celular_contacto2 INTEGER,
      parentesco_contacto2 TEXT,
      nombre_contacto3 TEXT,
      celular_contacto3 INTEGER,
      parentesco_contacto3 TEXT,
      mes_pago TEXT,
      nombre_expropietario TEXT,
      celular_expropietario INTEGER,
      fecha_entrega_primer TEXT,
      tag1_estatus TEXT,
      tag1_id INTEGER,
      tag1_placa TEXT,
      tag1_modelo TEXT,
      tag1_color TEXT,
      tag2_estatus TEXT,
      tag2_id INTEGER,
      tag2_placa TEXT,
      tag2_modelo TEXT,
      tag2_color TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_residentes_condominio ON residentes(condominio_id);
    CREATE INDEX IF NOT EXISTS idx_residentes_celular ON residentes(celular);
    CREATE INDEX IF NOT EXISTS idx_residentes_nombre ON residentes(nombre);
    CREATE INDEX IF NOT EXISTS idx_residentes_active ON residentes(active);

    CREATE TABLE IF NOT EXISTS residente_verificaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      residente_id INTEGER REFERENCES residentes(id) ON DELETE SET NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','verified','rejected')) DEFAULT 'pending',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_residente_verif_conv ON residente_verificaciones(conversation_id);
  `);

  if (!columnExists("condominios", "prefijo")) {
    db.exec(`ALTER TABLE condominios ADD COLUMN prefijo TEXT NOT NULL DEFAULT ''`);
  }

  if (!columnExists("condominios", "tipo")) {
    try {
      db.exec(
        `ALTER TABLE condominios ADD COLUMN tipo TEXT NOT NULL DEFAULT 'Vivienda' CHECK(tipo IN ('Vivienda','Terrenos','Torres'))`
      );
    } catch {
      // Ignorar si otro worker ya aplicó la migración en paralelo
    }
  }

  for (const col of [
    "documentacion_indexada",
    "tags",
    "estados_cuenta",
  ] as const) {
    if (!columnExists("condominios", col)) {
      try {
        db.exec(
          `ALTER TABLE condominios ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 0`
        );
      } catch {
        // Ignorar si otro worker ya aplicó la migración en paralelo
      }
    }
  }

  if (!columnExists("condominios", "cf_community_id")) {
    try {
      db.exec(`ALTER TABLE condominios ADD COLUMN cf_community_id TEXT`);
    } catch {
      // Ignorar si otro worker ya aplicó la migración en paralelo
    }
  }

  if (!columnExists("condominios", "estatus")) {
    try {
      db.exec(
        `ALTER TABLE condominios ADD COLUMN estatus TEXT NOT NULL DEFAULT 'Activo' CHECK(estatus IN ('Activo','Entregado'))`
      );
    } catch {
      // Ignorar si otro worker ya aplicó la migración en paralelo
    }
  }

  const contactCols: [string, string][] = [
    ["nombre_contacto2", "TEXT"],
    ["celular_contacto2", "INTEGER"],
    ["parentesco_contacto2", "TEXT"],
    ["nombre_contacto3", "TEXT"],
    ["celular_contacto3", "INTEGER"],
    ["parentesco_contacto3", "TEXT"],
    ["tag1_estatus", "TEXT"],
    ["tag1_id", "INTEGER"],
    ["tag1_placa", "TEXT"],
    ["tag1_modelo", "TEXT"],
    ["tag1_color", "TEXT"],
    ["tag2_estatus", "TEXT"],
    ["tag2_id", "INTEGER"],
    ["tag2_placa", "TEXT"],
    ["tag2_modelo", "TEXT"],
    ["tag2_color", "TEXT"],
  ];
  for (const [col, type] of contactCols) {
    if (!columnExists("residentes", col)) {
      db.exec(`ALTER TABLE residentes ADD COLUMN ${col} ${type}`);
    }
  }

  if (!columnExists("residentes", "cf_property_id")) {
    try {
      db.exec(`ALTER TABLE residentes ADD COLUMN cf_property_id TEXT`);
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_residentes_cf_property ON residentes(cf_property_id)`
      );
    } catch {
      // Ignorar si otro worker ya aplicó la migración en paralelo
    }
  }

  if (!columnExists("residentes", "ocupacion")) {
    try {
      db.exec(
        `ALTER TABLE residentes ADD COLUMN ocupacion TEXT NOT NULL DEFAULT 'Ocupado'`
      );
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_residentes_ocupacion ON residentes(ocupacion)`
      );
    } catch {
      // Ignorar carrera de migración
    }
  }

  // Marca residentes creados automáticamente desde el portal de clientes,
  // pendientes de que el admin asigne condominio y complete su información (#6).
  if (!columnExists("residentes", "pendiente_asignacion")) {
    try {
      db.exec(
        `ALTER TABLE residentes ADD COLUMN pendiente_asignacion INTEGER NOT NULL DEFAULT 0`
      );
    } catch {
      // Ignorar carrera de migración
    }
  }

  initPrototiposSchema();
}

// --- Date helpers ---

export function dateToDb(ddmmyyyy: string): string {
  const parts = ddmmyyyy.split("/");
  if (parts.length !== 3) return ddmmyyyy;
  return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
}

export function dateFromDb(yyyymmdd: string | null): string | null {
  if (!yyyymmdd) return null;
  const parts = yyyymmdd.split("-");
  if (parts.length !== 3) return yyyymmdd;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// --- Condominios ---

const CONDOMINIO_COLUMNS =
  "id, name, prefijo, tipo, estatus, documentacion_indexada, tags, estados_cuenta, cf_community_id, created_at";

type CondominioRow = Omit<
  Condominio,
  | "documentacion_indexada"
  | "tags"
  | "estados_cuenta"
  | "cf_community_id"
  | "resident_count"
> & {
  documentacion_indexada: number;
  tags: number;
  estados_cuenta: number;
  cf_community_id: string | null;
  estatus?: CondominioEstatus;
  resident_count?: number;
};

function mapCondominioRow(row: CondominioRow): Condominio {
  return {
    id: row.id,
    name: row.name,
    prefijo: row.prefijo,
    tipo: row.tipo,
    estatus: row.estatus ?? "Activo",
    documentacion_indexada: row.documentacion_indexada === 1,
    tags: row.tags === 1,
    estados_cuenta: row.estados_cuenta === 1,
    cf_community_id: row.cf_community_id?.trim() || null,
    created_at: row.created_at,
    resident_count: row.resident_count,
  };
}

function boolToInt(value: boolean | undefined): number {
  return value ? 1 : 0;
}

/** Orden: numéricos (1, 2, 5.1, 10…) y al final prefijos con sufijo (ej. 9-A). */
function prefijoSortKey(prefijo: string): [number, number, string] {
  const trimmed = prefijo.trim();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)(?:-(.+))?$/i);
  if (!match) return [Number.MAX_SAFE_INTEGER, 0, trimmed.toLowerCase()];

  const num = parseFloat(match[1]!);
  const suffix = match[2]?.trim() ?? "";
  if (suffix) {
    return [Number.MAX_SAFE_INTEGER, num, suffix.toLowerCase()];
  }
  return [num, 0, ""];
}

function compareCondominioPrefijo(a: string, b: string): number {
  const ka = prefijoSortKey(a);
  const kb = prefijoSortKey(b);
  for (let i = 0; i < 3; i++) {
    if (ka[i]! < kb[i]!) return -1;
    if (ka[i]! > kb[i]!) return 1;
  }
  return 0;
}

function sortCondominios(items: Condominio[]): Condominio[] {
  return [...items].sort((a, b) => {
    const byPrefijo = compareCondominioPrefijo(a.prefijo, b.prefijo);
    if (byPrefijo !== 0) return byPrefijo;
    return a.name.localeCompare(b.name, "es");
  });
}

function fetchCondominioRows(search?: string): CondominioRow[] {
  const conditions: string[] = [];
  const params: string[] = [];

  // El condominio placeholder de clientes del portal (#3) NO debe aparecer
  // en el módulo de condominios ni en los filtros.
  conditions.push("c.name <> ?");
  params.push(PENDING_CONDOMINIO_NAME);

  if (search?.trim()) {
    const { clause, params: searchParams } = buildCondominioSearchCondition(search);
    conditions.push(clause);
    params.push(...searchParams);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return db
    .prepare(
      `SELECT c.id, c.name, c.prefijo, c.tipo, c.estatus, c.documentacion_indexada, c.tags, c.estados_cuenta, c.cf_community_id, c.created_at,
              (SELECT COUNT(*) FROM residentes r WHERE r.condominio_id = c.id AND r.active = 1) AS resident_count
       FROM condominios c
       ${whereClause}`
    )
    .all(...params) as CondominioRow[];
}

export function listCondominios(): Condominio[] {
  return sortCondominios(fetchCondominioRows().map(mapCondominioRow));
}

export function listCondominiosPaginated(
  filters: CondominioFilters = {}
): CondominioListResult {
  const { search, page = 1, limit = 50 } = filters;
  const sorted = sortCondominios(
    fetchCondominioRows(search).map(mapCondominioRow)
  );
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * limit;

  return {
    data: sorted.slice(offset, offset + limit),
    total,
    page: safePage,
    limit,
    totalPages,
  };
}

export function getCondominio(id: number): Condominio | null {
  const row = db
    .prepare(`SELECT ${CONDOMINIO_COLUMNS} FROM condominios WHERE id = ?`)
    .get(id) as CondominioRow | undefined;
  return row ? mapCondominioRow(row) : null;
}

export function createCondominio(input: CondominioInput): Condominio {
  const trimmed = normalizeSpanishText(input.name.trim()) ?? input.name.trim();
  const pref = input.prefijo.trim();
  const tipo = input.tipo ?? "Vivienda";
  const estatus = input.estatus ?? "Activo";
  const cfCommunityId =
    input.cf_community_id === undefined
      ? null
      : input.cf_community_id?.trim() || null;
  const result = db
    .prepare(
      `INSERT INTO condominios (name, prefijo, tipo, estatus, documentacion_indexada, tags, estados_cuenta, cf_community_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      trimmed,
      pref,
      tipo,
      estatus,
      boolToInt(input.documentacion_indexada),
      boolToInt(input.tags),
      boolToInt(input.estados_cuenta),
      cfCommunityId
    );
  return getCondominio(Number(result.lastInsertRowid))!;
}

export function getOrCreateCondominio(
  name: string,
  prefijo?: string,
  tipo: CondominioTipo = "Vivienda"
): Condominio {
  const trimmed = normalizeSpanishText(name.trim()) ?? name.trim();
  const existing = db
    .prepare(`SELECT ${CONDOMINIO_COLUMNS} FROM condominios WHERE name = ?`)
    .get(trimmed) as CondominioRow | undefined;
  if (existing) {
    const mapped = mapCondominioRow(existing);
    if (prefijo?.trim() && !mapped.prefijo) {
      db.prepare("UPDATE condominios SET prefijo = ? WHERE id = ?").run(
        prefijo.trim(),
        mapped.id
      );
      return { ...mapped, prefijo: prefijo.trim() };
    }
    return mapped;
  }
  return createCondominio({ name: trimmed, prefijo: prefijo?.trim() ?? "", tipo });
}

export function deleteCondominio(id: number): boolean {
  const count = (
    db
      .prepare("SELECT COUNT(*) as c FROM residentes WHERE condominio_id = ?")
      .get(id) as { c: number }
  ).c;
  if (count > 0) return false;
  db.prepare("DELETE FROM condominios WHERE id = ?").run(id);
  return true;
}

/** Actualiza el flag documentacion_indexada según chunks indexados. */
export function setDocumentacionIndexada(
  id: number,
  indexed: boolean
): Condominio | null {
  const existing = getCondominio(id);
  if (!existing) return null;
  if (existing.documentacion_indexada === indexed) return existing;
  db.prepare(
    "UPDATE condominios SET documentacion_indexada = ? WHERE id = ?"
  ).run(indexed ? 1 : 0, id);
  return getCondominio(id);
}

export function updateCondominio(
  id: number,
  data: Partial<CondominioInput>
): Condominio | null {
  const existing = getCondominio(id);
  if (!existing) return null;

  const name = data.name
    ? (normalizeSpanishText(data.name.trim()) ?? data.name.trim())
    : existing.name;
  const prefijo = data.prefijo?.trim() ?? existing.prefijo;
  const tipo = data.tipo ?? existing.tipo;
  const estatus = data.estatus ?? existing.estatus;
  const documentacion_indexada =
    data.documentacion_indexada ?? existing.documentacion_indexada;
  const tags = data.tags ?? existing.tags;
  const estados_cuenta = data.estados_cuenta ?? existing.estados_cuenta;
  const cf_community_id =
    data.cf_community_id === undefined
      ? existing.cf_community_id
      : data.cf_community_id?.trim() || null;

  db.prepare(
    `UPDATE condominios
     SET name = ?, prefijo = ?, tipo = ?, estatus = ?, documentacion_indexada = ?, tags = ?, estados_cuenta = ?, cf_community_id = ?
     WHERE id = ?`
  ).run(
    name,
    prefijo,
    tipo,
    estatus,
    boolToInt(documentacion_indexada),
    boolToInt(tags),
    boolToInt(estados_cuenta),
    cf_community_id,
    id
  );

  if (prefijo) {
    db.prepare(
      `UPDATE residentes
       SET num_coto = ? || '-' || CAST(num_vivienda AS TEXT),
           updated_at = unixepoch()
       WHERE condominio_id = ? AND num_vivienda IS NOT NULL`
    ).run(prefijo, id);
  }

  broadcastDashboard("residentes");
  return getCondominio(id);
}

// --- Residentes CRUD ---

const SELECT_RESIDENTE = `
  SELECT r.*, c.name as condominio_name, c.prefijo as condominio_prefijo,
         p.name as prototipo_name
  FROM residentes r
  JOIN condominios c ON c.id = r.condominio_id
  LEFT JOIN prototipos p ON p.id = r.prototipo_id
`;

const RESIDENTE_SEARCH_TEXT_FIELDS = [
  "nombre",
  "email",
  "num_coto",
  "cf_property_id",
  "fecha_entrega",
  "fecha_entrega_primer",
  "mes_pago",
  "nombre_contacto1",
  "parentesco_contacto1",
  "nombre_contacto2",
  "parentesco_contacto2",
  "nombre_contacto3",
  "parentesco_contacto3",
  "nombre_expropietario",
  "tag1_estatus",
  "tag1_placa",
  "tag1_modelo",
  "tag1_color",
  "tag2_estatus",
  "tag2_placa",
  "tag2_modelo",
  "tag2_color",
] as const;

const RESIDENTE_SEARCH_NUMERIC_FIELDS = [
  "celular",
  "num_vivienda",
  "metros_cuadrados",
  "cuota_int",
  "cuota_ext",
  "cuota_completa",
  "cuota_int_pronpago",
  "cuota_ext_pronpago",
  "cuota_comp_pronpago",
  "servicio_luz",
  "celular_contacto1",
  "celular_contacto2",
  "celular_contacto3",
  "celular_expropietario",
  "tag1_id",
  "tag2_id",
] as const;

function residenteSearchLikeParts(alias: string, includeCondominio = false): string[] {
  const parts = [
    ...RESIDENTE_SEARCH_TEXT_FIELDS.map((field) => `${alias}.${field} LIKE ?`),
    ...RESIDENTE_SEARCH_NUMERIC_FIELDS.map(
      (field) => `CAST(${alias}.${field} AS TEXT) LIKE ?`
    ),
  ];
  if (includeCondominio) {
    parts.push("c.name LIKE ?", "c.prefijo LIKE ?");
  }
  return parts;
}

function buildResidenteSearchCondition(search: string): {
  clause: string;
  params: string[];
} {
  const tokens = search.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { clause: "", params: [] };

  const likeParts = residenteSearchLikeParts("r", true);
  const tokenClauses: string[] = [];
  const params: string[] = [];

  for (const token of tokens) {
    const term = `%${token}%`;
    tokenClauses.push(`(${likeParts.join(" OR ")})`);
    params.push(...likeParts.map(() => term));
  }

  return { clause: tokenClauses.join(" AND "), params };
}

function buildCondominioSearchCondition(search: string): {
  clause: string;
  params: string[];
} {
  const tokens = search.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { clause: "", params: [] };

  const condoFields = ["c.name", "c.prefijo", "c.tipo", "c.estatus"];
  const residentParts = residenteSearchLikeParts("r", false);
  const tokenClauses: string[] = [];
  const params: string[] = [];

  for (const token of tokens) {
    const term = `%${token}%`;
    const condoMatch = condoFields.map((field) => `${field} LIKE ?`).join(" OR ");
    const residentMatch = `EXISTS (
      SELECT 1 FROM residentes r
      WHERE r.condominio_id = c.id
        AND (${residentParts.join(" OR ")})
    )`;
    tokenClauses.push(`((${condoMatch}) OR ${residentMatch})`);
    params.push(...condoFields.map(() => term));
    params.push(...residentParts.map(() => term));
  }

  return { clause: tokenClauses.join(" AND "), params };
}

type ResidenteRow = Omit<Residente, "fecha_entrega" | "fecha_entrega_primer"> & {
  fecha_entrega: string | null;
  fecha_entrega_primer: string | null;
};

function mapRow(row: ResidenteRow): Residente {
  return {
    ...row,
    num_coto: row.num_coto != null ? String(row.num_coto) : null,
    cf_property_id: row.cf_property_id?.trim() ? String(row.cf_property_id).trim() : null,
    prototipo_id: row.prototipo_id ?? null,
    prototipo_name: row.prototipo_name?.trim() || null,
    fecha_entrega: dateFromDb(row.fecha_entrega),
    fecha_entrega_primer: dateFromDb(row.fecha_entrega_primer),
    ocupacion: row.ocupacion === "Vacante" ? "Vacante" : "Ocupado",
  };
}

export function getResidente(id: number): Residente | null {
  const row = db
    .prepare(`${SELECT_RESIDENTE} WHERE r.id = ?`)
    .get(id) as ResidenteRow | undefined;
  return row ? mapRow(row) : null;
}

/**
 * Nombre del condominio placeholder para clientes del portal sin colonia asignada.
 * Se escribe ya normalizado (title-case, sin acentos) tal como lo guarda
 * `getOrCreateCondominio` vía `normalizeSpanishText`, para que las comparaciones
 * sean estables.
 */
export const PENDING_CONDOMINIO_NAME = "Pendiente De Asignacion";

/**
 * Crea un residente MÍNIMO a partir del alta de un cliente en el portal.
 * Se coloca en un condominio placeholder y se marca `pendiente_asignacion=1`
 * para que el admin le asigne condominio/vivienda y complete su información (#6).
 */
export function createPendingResidenteFromPortal(input: {
  nombre: string;
  email?: string | null;
  phone?: string | null;
}): Residente {
  const condo = getOrCreateCondominio(PENDING_CONDOMINIO_NAME, "PEND");
  const localPhone = input.phone
    ? phoneLookupCandidates(input.phone).find((c) => c.length === 10)
    : undefined;
  const created = createResidente({
    condominio_id: condo.id,
    nombre: input.nombre,
    email: input.email ?? null,
    celular: localPhone ? Number(localPhone) : null,
  });
  db.prepare(
    "UPDATE residentes SET pendiente_asignacion = 1 WHERE id = ?"
  ).run(created.id);
  broadcastDashboard("residentes");
  return getResidente(created.id)!;
}

/** Limpia la marca de pendiente (al asignar condominio/completar datos). */
export function clearResidentePendiente(id: number): void {
  db.prepare(
    "UPDATE residentes SET pendiente_asignacion = 0 WHERE id = ?"
  ).run(id);
}

export function listResidentes(filters: ResidenteFilters = {}): ResidenteListResult {
  const { condominio_id, search, active = true, page = 1, limit = 50 } = filters;
  const conditions: string[] = [];
  const params: (number | string)[] = [];

  if (active !== undefined) {
    conditions.push("r.active = ?");
    params.push(active ? 1 : 0);
  }

  if (condominio_id != null) {
    conditions.push("r.condominio_id = ?");
    params.push(condominio_id);
  }

  if (search?.trim()) {
    const { clause, params: searchParams } = buildResidenteSearchCondition(search);
    conditions.push(clause);
    params.push(...searchParams);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const totalRow = db
    .prepare(
      `SELECT COUNT(*) as c FROM residentes r JOIN condominios c ON c.id = r.condominio_id ${whereClause}`
    )
    .get(...params) as { c: number };

  const total = totalRow.c;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const offset = (page - 1) * limit;

  const rows = db
    .prepare(
      `${SELECT_RESIDENTE} ${whereClause} ORDER BY r.nombre ASC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as ResidenteRow[];

  return {
    data: rows.map(mapRow),
    total,
    page,
    limit,
    totalPages,
  };
}

const INSERT_SQL = `INSERT INTO residentes (
  condominio_id, num_vivienda, num_coto, cf_property_id, prototipo_id, nombre, celular, email,
  fecha_entrega, metros_cuadrados, cuota_int, cuota_ext, cuota_completa,
  cuota_int_pronpago, cuota_ext_pronpago, cuota_comp_pronpago,
  servicio_luz, nombre_contacto1, celular_contacto1, parentesco_contacto1,
  nombre_contacto2, celular_contacto2, parentesco_contacto2,
  nombre_contacto3, celular_contacto3, parentesco_contacto3,
  mes_pago, nombre_expropietario, celular_expropietario, fecha_entrega_primer,
  tag1_estatus, tag1_id, tag1_placa, tag1_modelo, tag1_color,
  tag2_estatus, tag2_id, tag2_placa, tag2_modelo, tag2_color
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function normalizeCfPropertyId(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function insertParams(input: ResidenteInput, computed: ReturnType<typeof resolveComputedFields>) {
  const normalized = normalizeResidenteTextFields(input);
  return [
    normalized.condominio_id,
    normalized.num_vivienda ?? null,
    computed.num_coto,
    normalizeCfPropertyId(normalized.cf_property_id),
    normalized.prototipo_id ?? null,
    normalized.nombre.trim(),
    normalized.celular ?? null,
    normalized.email?.trim() || null,
    normalized.fecha_entrega ? dateToDb(normalized.fecha_entrega) : null,
    normalized.metros_cuadrados ?? null,
    normalized.cuota_int ?? null,
    normalized.cuota_ext ?? null,
    computed.cuota_completa,
    normalized.cuota_int_pronpago ?? null,
    normalized.cuota_ext_pronpago ?? null,
    computed.cuota_comp_pronpago,
    normalized.servicio_luz ?? null,
    normalized.nombre_contacto1?.trim() || null,
    normalized.celular_contacto1 ?? null,
    normalized.parentesco_contacto1?.trim() || null,
    normalized.nombre_contacto2?.trim() || null,
    normalized.celular_contacto2 ?? null,
    normalized.parentesco_contacto2?.trim() || null,
    normalized.nombre_contacto3?.trim() || null,
    normalized.celular_contacto3 ?? null,
    normalized.parentesco_contacto3?.trim() || null,
    normalized.mes_pago?.trim() || null,
    normalized.nombre_expropietario?.trim() || null,
    normalized.celular_expropietario ?? null,
    normalized.fecha_entrega_primer ? dateToDb(normalized.fecha_entrega_primer) : null,
    normalized.tag1_estatus ?? null,
    normalized.tag1_id ?? null,
    normalized.tag1_placa?.trim().toUpperCase() || null,
    normalized.tag1_modelo?.trim() || null,
    normalized.tag1_color ?? null,
    normalized.tag2_estatus ?? null,
    normalized.tag2_id ?? null,
    normalized.tag2_placa?.trim().toUpperCase() || null,
    normalized.tag2_modelo?.trim() || null,
    normalized.tag2_color ?? null,
  ];
}

export function createResidente(input: ResidenteInput): Residente {
  const computed = resolveComputedFields(input);
  const result = db.prepare(INSERT_SQL).run(...insertParams(input, computed));
  broadcastDashboard("residentes");
  return getResidente(Number(result.lastInsertRowid))!;
}

export function updateResidente(
  id: number,
  input: Partial<ResidenteInput>
): Residente | null {
  const existing = getResidente(id);
  if (!existing) return null;

  const merged: ResidenteInput = {
    condominio_id: input.condominio_id ?? existing.condominio_id,
    num_vivienda:
      input.num_vivienda !== undefined ? input.num_vivienda : existing.num_vivienda,
    cf_property_id:
      input.cf_property_id !== undefined
        ? input.cf_property_id
        : existing.cf_property_id,
    prototipo_id:
      input.prototipo_id !== undefined
        ? input.prototipo_id
        : existing.prototipo_id,
    nombre: input.nombre ?? existing.nombre,
    celular: input.celular !== undefined ? input.celular : existing.celular,
    email: input.email !== undefined ? input.email : existing.email,
    fecha_entrega:
      input.fecha_entrega !== undefined ? input.fecha_entrega : existing.fecha_entrega,
    metros_cuadrados:
      input.metros_cuadrados !== undefined
        ? input.metros_cuadrados
        : existing.metros_cuadrados,
    cuota_int: input.cuota_int !== undefined ? input.cuota_int : existing.cuota_int,
    cuota_ext: input.cuota_ext !== undefined ? input.cuota_ext : existing.cuota_ext,
    cuota_int_pronpago:
      input.cuota_int_pronpago !== undefined
        ? input.cuota_int_pronpago
        : existing.cuota_int_pronpago,
    cuota_ext_pronpago:
      input.cuota_ext_pronpago !== undefined
        ? input.cuota_ext_pronpago
        : existing.cuota_ext_pronpago,
    servicio_luz:
      input.servicio_luz !== undefined ? input.servicio_luz : existing.servicio_luz,
    nombre_contacto1:
      input.nombre_contacto1 !== undefined
        ? input.nombre_contacto1
        : existing.nombre_contacto1,
    celular_contacto1:
      input.celular_contacto1 !== undefined
        ? input.celular_contacto1
        : existing.celular_contacto1,
    parentesco_contacto1:
      input.parentesco_contacto1 !== undefined
        ? input.parentesco_contacto1
        : existing.parentesco_contacto1,
    nombre_contacto2:
      input.nombre_contacto2 !== undefined
        ? input.nombre_contacto2
        : existing.nombre_contacto2,
    celular_contacto2:
      input.celular_contacto2 !== undefined
        ? input.celular_contacto2
        : existing.celular_contacto2,
    parentesco_contacto2:
      input.parentesco_contacto2 !== undefined
        ? input.parentesco_contacto2
        : existing.parentesco_contacto2,
    nombre_contacto3:
      input.nombre_contacto3 !== undefined
        ? input.nombre_contacto3
        : existing.nombre_contacto3,
    celular_contacto3:
      input.celular_contacto3 !== undefined
        ? input.celular_contacto3
        : existing.celular_contacto3,
    parentesco_contacto3:
      input.parentesco_contacto3 !== undefined
        ? input.parentesco_contacto3
        : existing.parentesco_contacto3,
    mes_pago: input.mes_pago !== undefined ? input.mes_pago : existing.mes_pago,
    nombre_expropietario:
      input.nombre_expropietario !== undefined
        ? input.nombre_expropietario
        : existing.nombre_expropietario,
    celular_expropietario:
      input.celular_expropietario !== undefined
        ? input.celular_expropietario
        : existing.celular_expropietario,
    fecha_entrega_primer:
      input.fecha_entrega_primer !== undefined
        ? input.fecha_entrega_primer
        : existing.fecha_entrega_primer,
    tag1_estatus:
      input.tag1_estatus !== undefined ? input.tag1_estatus : existing.tag1_estatus,
    tag1_id: input.tag1_id !== undefined ? input.tag1_id : existing.tag1_id,
    tag1_placa:
      input.tag1_placa !== undefined ? input.tag1_placa : existing.tag1_placa,
    tag1_modelo:
      input.tag1_modelo !== undefined ? input.tag1_modelo : existing.tag1_modelo,
    tag1_color:
      input.tag1_color !== undefined ? input.tag1_color : existing.tag1_color,
    tag2_estatus:
      input.tag2_estatus !== undefined ? input.tag2_estatus : existing.tag2_estatus,
    tag2_id: input.tag2_id !== undefined ? input.tag2_id : existing.tag2_id,
    tag2_placa:
      input.tag2_placa !== undefined ? input.tag2_placa : existing.tag2_placa,
    tag2_modelo:
      input.tag2_modelo !== undefined ? input.tag2_modelo : existing.tag2_modelo,
    tag2_color:
      input.tag2_color !== undefined ? input.tag2_color : existing.tag2_color,
  };

  const computed = resolveComputedFields(merged, existing);

  db.prepare(
    `UPDATE residentes SET
      condominio_id = ?, num_vivienda = ?, num_coto = ?, cf_property_id = ?, prototipo_id = ?, nombre = ?, celular = ?, email = ?,
      fecha_entrega = ?, metros_cuadrados = ?, cuota_int = ?, cuota_ext = ?, cuota_completa = ?,
      cuota_int_pronpago = ?, cuota_ext_pronpago = ?, cuota_comp_pronpago = ?,
      servicio_luz = ?, nombre_contacto1 = ?, celular_contacto1 = ?, parentesco_contacto1 = ?,
      nombre_contacto2 = ?, celular_contacto2 = ?, parentesco_contacto2 = ?,
      nombre_contacto3 = ?, celular_contacto3 = ?, parentesco_contacto3 = ?,
      mes_pago = ?, nombre_expropietario = ?, celular_expropietario = ?, fecha_entrega_primer = ?,
      tag1_estatus = ?, tag1_id = ?, tag1_placa = ?, tag1_modelo = ?, tag1_color = ?,
      tag2_estatus = ?, tag2_id = ?, tag2_placa = ?, tag2_modelo = ?, tag2_color = ?,
      updated_at = unixepoch()
     WHERE id = ?`
  ).run(...insertParams(merged, computed), id);

  const nextNombre = (merged.nombre ?? "").trim();
  if (nextNombre && nextNombre !== "Vacante") {
    db.prepare(
      `UPDATE residentes SET ocupacion = 'Ocupado', active = 1 WHERE id = ?`
    ).run(id);
  }

  // Al asignar un condominio real (distinto del placeholder), deja de estar pendiente.
  if (existing.pendiente_asignacion) {
    const condo = getCondominio(merged.condominio_id);
    if (condo && condo.name !== PENDING_CONDOMINIO_NAME) {
      clearResidentePendiente(id);
    }
  }

  broadcastDashboard("residentes");
  return getResidente(id);
}

export function deactivateResidente(id: number): boolean {
  return vacateResidente(id);
}

/**
 * Baja por reventa: conserva vivienda/cuotas/prototipo/metros,
 * pasa persona a expropietario y deja la fila como Vacante (sigue enlistada).
 */
export function vacateResidente(id: number): boolean {
  const existing = getResidente(id);
  if (!existing) return false;
  if (existing.ocupacion === "Vacante") return true;

  const exNombre =
    existing.nombre && existing.nombre !== "Vacante"
      ? existing.nombre
      : existing.nombre_expropietario;
  const exCelular =
    existing.celular != null
      ? existing.celular
      : existing.celular_expropietario;
  const entregaPrimer =
    existing.fecha_entrega ?? existing.fecha_entrega_primer;

  const result = db
    .prepare(
      `UPDATE residentes SET
        nombre_expropietario = ?,
        celular_expropietario = ?,
        fecha_entrega_primer = ?,
        nombre = 'Vacante',
        celular = NULL,
        email = NULL,
        fecha_entrega = NULL,
        nombre_contacto1 = NULL,
        celular_contacto1 = NULL,
        parentesco_contacto1 = NULL,
        nombre_contacto2 = NULL,
        celular_contacto2 = NULL,
        parentesco_contacto2 = NULL,
        nombre_contacto3 = NULL,
        celular_contacto3 = NULL,
        parentesco_contacto3 = NULL,
        tag1_estatus = NULL,
        tag1_id = NULL,
        tag1_placa = NULL,
        tag1_modelo = NULL,
        tag1_color = NULL,
        tag2_estatus = NULL,
        tag2_id = NULL,
        tag2_placa = NULL,
        tag2_modelo = NULL,
        tag2_color = NULL,
        ocupacion = 'Vacante',
        active = 1,
        updated_at = unixepoch()
       WHERE id = ?`
    )
    .run(
      exNombre,
      exCelular,
      entregaPrimer ? dateToDb(entregaPrimer) : null,
      id
    );

  if (result.changes > 0) broadcastDashboard("residentes");
  return result.changes > 0;
}

export function reactivateResidente(id: number): boolean {
  const result = db
    .prepare(
      `UPDATE residentes SET active = 1, ocupacion = 'Ocupado', updated_at = unixepoch()
       WHERE id = ?`
    )
    .run(id);
  if (result.changes > 0) broadcastDashboard("residentes");
  return result.changes > 0;
}

// --- Search ---

export function searchResidentes(query: string, limit = 20): Residente[] {
  const { clause, params: searchParams } = buildResidenteSearchCondition(query);
  if (!clause) return [];

  const rows = db
    .prepare(
      `${SELECT_RESIDENTE}
       WHERE r.active = 1 AND ${clause}
       ORDER BY r.nombre ASC
       LIMIT ?`
    )
    .all(...searchParams, limit) as ResidenteRow[];
  return rows.map(mapRow);
}

export function findResidenteByCelular(phone: string): Residente | null {
  for (const suffix of phoneLookupCandidates(phone)) {
    const num = Number(suffix);
    if (isNaN(num)) continue;
    const row = db
      .prepare(`${SELECT_RESIDENTE} WHERE r.active = 1 AND r.celular = ?`)
      .get(num) as ResidenteRow | undefined;
    if (row) return mapRow(row);
  }

  return null;
}

export function findResidenteByNombre(name: string): Residente[] {
  const normalized = normalizeSpanishText(name) ?? name.trim();
  const term = `%${normalized}%`;
  const rows = db
    .prepare(
      `${SELECT_RESIDENTE} WHERE r.active = 1 AND r.nombre LIKE ? LIMIT 5`
    )
    .all(term) as ResidenteRow[];
  return rows.map(mapRow);
}

export function findResidentesByEmail(email: string): Residente[] {
  const normalized = normalizeEmailText(email);
  if (!normalized) return [];

  const rows = db
    .prepare(
      `${SELECT_RESIDENTE} WHERE r.active = 1 AND lower(r.email) = lower(?)`
    )
    .all(normalized) as ResidenteRow[];
  return rows.map(mapRow);
}

function residentPhoneMatches(localPhone: string, value: number | null): boolean {
  if (value == null) return false;
  const stored = String(value).replace(/\D/g, "");
  return stored === localPhone || stored.slice(-10) === localPhone;
}

export function findResidentesByRegisteredPhone(phone: string): Residente[] {
  const localPhone = phoneLookupCandidates(phone).find(
    (candidate) => candidate.length === 10
  );
  if (!localPhone) return [];

  const rows = db
    .prepare(`${SELECT_RESIDENTE} WHERE r.active = 1`)
    .all() as ResidenteRow[];

  return rows
    .filter((row) => {
      const resident = mapRow(row);
      return (
        residentPhoneMatches(localPhone, resident.celular) ||
        residentPhoneMatches(localPhone, resident.celular_contacto1) ||
        residentPhoneMatches(localPhone, resident.celular_contacto2) ||
        residentPhoneMatches(localPhone, resident.celular_contacto3) ||
        residentPhoneMatches(localPhone, resident.celular_expropietario)
      );
    })
    .map(mapRow);
}

// --- Stats ---

export function getResidenteStats(): ResidenteStats {
  const total = (
    db.prepare("SELECT COUNT(*) as c FROM residentes").get() as { c: number }
  ).c;
  const active = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM residentes
         WHERE active = 1 AND (ocupacion IS NULL OR ocupacion = 'Ocupado')`
      )
      .get() as { c: number }
  ).c;
  const vacantes = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM residentes WHERE active = 1 AND ocupacion = 'Vacante'`
      )
      .get() as { c: number }
  ).c;

  const byCondominio = db
    .prepare(
      `SELECT c.name as condominio_name, COUNT(*) as count
       FROM residentes r
       JOIN condominios c ON c.id = r.condominio_id
       WHERE r.active = 1
       GROUP BY c.id
       ORDER BY count DESC`
    )
    .all() as { condominio_name: string; count: number }[];

  return {
    total,
    active,
    inactive: total - active - vacantes,
    vacantes,
    byCondominio,
  };
}

export function getCondominioStats(): CondominioStats {
  const total = (
    db.prepare("SELECT COUNT(*) as c FROM condominios").get() as { c: number }
  ).c;
  const activos = (
    db
      .prepare("SELECT COUNT(*) as c FROM condominios WHERE estatus = 'Activo'")
      .get() as { c: number }
  ).c;
  const entregados = (
    db
      .prepare("SELECT COUNT(*) as c FROM condominios WHERE estatus = 'Entregado'")
      .get() as { c: number }
  ).c;

  return { total, activos, entregados };
}

// --- Import ---

export interface ImportResult {
  inserted: number;
  errors: { row: number; message: string }[];
}

export const importResidentesTx = db.transaction(
  (rows: ResidenteInput[]): ImportResult => {
    let inserted = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const input = rows[i];
      try {
        const computed = resolveComputedFields(input);
        db.prepare(INSERT_SQL).run(...insertParams(input, computed));
        inserted++;
      } catch (err) {
        errors.push({
          row: i + 2,
          message: err instanceof Error ? err.message : "Error desconocido",
        });
      }
    }

    return { inserted, errors };
  }
);

// --- Export ---

const EXPORT_HEADERS = [
  "Condominio / Fraccionamiento",
  "Prefijo",
  "Num° Vivienda",
  "Num° Coto",
  "Prototipo",
  "Nombre",
  "Celular",
  "Email",
  "m²",
  "Nombre Cont1",
  "Celular Cont1",
  "Parentesco Cont1",
  "Nombre Cont2",
  "Celular Cont2",
  "Parentesco Cont2",
  "Nombre Cont3",
  "Celular Cont3",
  "Parentesco Cont3",
  "Nombre ExPropietario",
  "Cell ExPropietario",
  "Fecha Entrega 1er",
];

function escapeCsv(val: string | number | null | undefined): string {
  if (val == null) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportResidentesTemplateCsv(): string {
  return `${EXPORT_HEADERS.map(escapeCsv).join(",")}\n`;
}

export function exportResidentesCsv(filters: ResidenteFilters = {}): string {
  const all = listResidentes({ ...filters, limit: 100000, page: 1 });
  const lines: string[] = [EXPORT_HEADERS.map(escapeCsv).join(",")];

  for (const r of all.data) {
    lines.push(
      [
        r.condominio_name,
        r.condominio_prefijo,
        r.num_vivienda,
        r.num_coto,
        r.prototipo_name,
        r.nombre,
        r.celular,
        r.email,
        r.metros_cuadrados,
        r.nombre_contacto1,
        r.celular_contacto1,
        r.parentesco_contacto1,
        r.nombre_contacto2,
        r.celular_contacto2,
        r.parentesco_contacto2,
        r.nombre_contacto3,
        r.celular_contacto3,
        r.parentesco_contacto3,
        r.nombre_expropietario,
        r.celular_expropietario,
        r.fecha_entrega_primer,
      ]
        .map(escapeCsv)
        .join(",")
    );
  }

  return lines.join("\n");
}

export { EXPORT_HEADERS };

// --- Verificacion WhatsApp ---

export function createVerificacion(
  conversationId: number,
  residenteId?: number
): number {
  const result = db
    .prepare(
      `INSERT INTO residente_verificaciones (conversation_id, residente_id, status)
       VALUES (?, ?, 'pending')`
    )
    .run(conversationId, residenteId ?? null);
  return Number(result.lastInsertRowid);
}

export function updateVerificacion(
  id: number,
  status: "verified" | "rejected",
  residenteId?: number
): void {
  if (residenteId != null) {
    db.prepare(
      "UPDATE residente_verificaciones SET status = ?, residente_id = ? WHERE id = ?"
    ).run(status, residenteId, id);
  } else {
    db.prepare(
      "UPDATE residente_verificaciones SET status = ? WHERE id = ?"
    ).run(status, id);
  }
}

export function getPendingVerificacion(
  conversationId: number
): { id: number; residente_id: number | null; status: string } | null {
  return (
    (db
      .prepare(
        `SELECT id, residente_id, status FROM residente_verificaciones
         WHERE conversation_id = ? AND status = 'pending'
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(conversationId) as {
      id: number;
      residente_id: number | null;
      status: string;
    }) ?? null
  );
}

initResidentesSchema();
