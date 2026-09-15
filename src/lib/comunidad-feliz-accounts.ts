import db from "./db-connection";
import {
  getProperties,
  getPropertyAccounts,
  isComunidadFelizConfigured,
  type CfProperty,
  type CfPropertyAccount,
} from "./comunidad-feliz-client";
import {
  getCondominio,
  listCondominios,
  listResidentes,
  type Residente,
} from "./residentes";
import {
  normalizeEmailText,
  normalizeSpanishText,
  stripAccentsExceptN,
} from "./text-normalize";

export interface AccountSnapshot {
  residente_id: number;
  property_id: string;
  community_id: string;
  total_to_pay: number;
  currency: string | null;
  al_dia: boolean;
  last_payment_at: string | null;
  last_payment_amount: number | null;
  matched_at: number;
  fetched_at: number;
}

export interface SyncCondoSummary {
  condominioId: number;
  condominioName: string;
  communityId: string;
  properties: number;
  matched: number;
  unmatched: number;
  errors: string[];
  fetchedAt: number;
}

export interface SyncResult {
  enabled: boolean;
  summaries: SyncCondoSummary[];
  error?: string;
}

type SnapshotRow = {
  residente_id: number;
  property_id: string;
  community_id: string;
  total_to_pay: number;
  currency: string | null;
  al_dia: number;
  last_payment_at: string | null;
  last_payment_amount: number | null;
  matched_at: number;
  fetched_at: number;
};

export function initComunidadFelizAccountsSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cf_account_snapshots (
      residente_id INTEGER PRIMARY KEY REFERENCES residentes(id) ON DELETE CASCADE,
      property_id TEXT NOT NULL,
      community_id TEXT NOT NULL,
      total_to_pay REAL NOT NULL DEFAULT 0,
      currency TEXT,
      al_dia INTEGER NOT NULL DEFAULT 1,
      last_payment_at TEXT,
      last_payment_amount REAL,
      matched_at INTEGER NOT NULL,
      fetched_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cf_snapshots_property ON cf_account_snapshots(property_id);
    CREATE INDEX IF NOT EXISTS idx_cf_snapshots_community ON cf_account_snapshots(community_id);

    CREATE TABLE IF NOT EXISTS cf_sync_runs (
      condominio_id INTEGER PRIMARY KEY REFERENCES condominios(id) ON DELETE CASCADE,
      community_id TEXT NOT NULL,
      matched INTEGER NOT NULL DEFAULT 0,
      unmatched INTEGER NOT NULL DEFAULT 0,
      properties INTEGER NOT NULL DEFAULT 0,
      errors_json TEXT NOT NULL DEFAULT '[]',
      fetched_at INTEGER NOT NULL
    );
  `);
}

initComunidadFelizAccountsSchema();

function mapSnapshot(row: SnapshotRow): AccountSnapshot {
  return {
    residente_id: row.residente_id,
    property_id: row.property_id,
    community_id: row.community_id,
    total_to_pay: row.total_to_pay,
    currency: row.currency,
    al_dia: row.al_dia === 1,
    last_payment_at: row.last_payment_at,
    last_payment_amount: row.last_payment_amount,
    matched_at: row.matched_at,
    fetched_at: row.fetched_at,
  };
}

function normalizeKey(value: string | null | undefined): string {
  if (!value) return "";
  return stripAccentsExceptN(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function residenteUnitKeys(residente: Residente): string[] {
  const keys = new Set<string>();
  if (residente.num_coto?.trim()) keys.add(normalizeKey(residente.num_coto));
  if (residente.num_vivienda != null) {
    keys.add(normalizeKey(String(residente.num_vivienda)));
    if (residente.condominio_prefijo) {
      keys.add(
        normalizeKey(`${residente.condominio_prefijo}-${residente.num_vivienda}`)
      );
      keys.add(
        normalizeKey(`${residente.condominio_prefijo}${residente.num_vivienda}`)
      );
    }
  }
  return [...keys].filter(Boolean);
}

export function matchResidenteToProperty(
  residente: Residente,
  properties: CfProperty[]
): CfProperty | null {
  // Candado perfecto: ID explícito de ComunidadFeliz en el residente.
  const pinnedId = residente.cf_property_id?.trim();
  if (pinnedId) {
    const pinned = properties.find((p) => String(p.id) === pinnedId);
    return pinned ?? null;
  }

  const email = normalizeEmailText(residente.email) ?? "";
  const nombre = normalizeKey(
    normalizeSpanishText(residente.nombre) ?? residente.nombre
  );
  const unitKeys = residenteUnitKeys(residente);

  const scored = properties
    .map((prop) => {
      let score = 0;
      const propEmail = normalizeEmailText(prop.owner_email) ?? "";
      const propName = normalizeKey(prop.owner_name);
      const propUnit = normalizeKey(prop.name);
      let exactUnit = false;

      if (email && propEmail && email === propEmail) score += 3;
      if (nombre && propName && (nombre === propName || propName.includes(nombre) || nombre.includes(propName))) {
        score += 2;
      }
      if (unitKeys.length > 0 && propUnit) {
        if (unitKeys.includes(propUnit)) {
          score += 3;
          exactUnit = true;
        } else if (unitKeys.some((u) => propUnit.includes(u) || u.includes(propUnit))) {
          score += 1;
        }
      }
      return { prop, score, exactUnit };
    })
    .sort((a, b) => b.score - a.score);

  const strong = scored.filter((x) => x.score >= 5);
  if (strong.length === 1) return strong[0]!.prop;
  if (strong.length > 1 && strong[0]!.score === strong[1]!.score) return null;
  if (strong.length > 1) return strong[0]!.prop;

  // Fallback: la API Corredores a veces no expone owner_email/name.
  // Si hay exactamente una unidad con match exacto de vivienda, aceptamos.
  const exactUnits = scored.filter((x) => x.exactUnit);
  if (exactUnits.length === 1) return exactUnits[0]!.prop;

  return null;
}

function upsertSnapshot(
  residenteId: number,
  property: CfProperty,
  account: CfPropertyAccount | null,
  communityId: string,
  now: number
): void {
  const total = account?.total_to_pay ?? 0;
  db.prepare(
    `INSERT INTO cf_account_snapshots (
      residente_id, property_id, community_id, total_to_pay, currency,
      al_dia, last_payment_at, last_payment_amount, matched_at, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(residente_id) DO UPDATE SET
      property_id = excluded.property_id,
      community_id = excluded.community_id,
      total_to_pay = excluded.total_to_pay,
      currency = excluded.currency,
      al_dia = excluded.al_dia,
      last_payment_at = excluded.last_payment_at,
      last_payment_amount = excluded.last_payment_amount,
      matched_at = excluded.matched_at,
      fetched_at = excluded.fetched_at`
  ).run(
    residenteId,
    property.id,
    communityId || property.community_id,
    total,
    account?.currency ?? null,
    total <= 0 ? 1 : 0,
    account?.last_payment_at ?? null,
    account?.last_payment_amount ?? null,
    now,
    now
  );
}

function saveSyncRun(summary: SyncCondoSummary): void {
  db.prepare(
    `INSERT INTO cf_sync_runs (
      condominio_id, community_id, matched, unmatched, properties, errors_json, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(condominio_id) DO UPDATE SET
      community_id = excluded.community_id,
      matched = excluded.matched,
      unmatched = excluded.unmatched,
      properties = excluded.properties,
      errors_json = excluded.errors_json,
      fetched_at = excluded.fetched_at`
  ).run(
    summary.condominioId,
    summary.communityId,
    summary.matched,
    summary.unmatched,
    summary.properties,
    JSON.stringify(summary.errors),
    summary.fetchedAt
  );
}

export function getLastSyncRun(condominioId: number): SyncCondoSummary | null {
  const row = db
    .prepare(
      `SELECT condominio_id, community_id, matched, unmatched, properties, errors_json, fetched_at
       FROM cf_sync_runs WHERE condominio_id = ?`
    )
    .get(condominioId) as
    | {
        condominio_id: number;
        community_id: string;
        matched: number;
        unmatched: number;
        properties: number;
        errors_json: string;
        fetched_at: number;
      }
    | undefined;
  if (!row) return null;
  const condo = getCondominio(condominioId);
  let errors: string[] = [];
  try {
    errors = JSON.parse(row.errors_json) as string[];
  } catch {
    errors = [];
  }
  return {
    condominioId: row.condominio_id,
    condominioName: condo?.name ?? "",
    communityId: row.community_id,
    properties: row.properties,
    matched: row.matched,
    unmatched: row.unmatched,
    errors,
    fetchedAt: row.fetched_at,
  };
}

export function getCachedAccountSummary(
  residenteId: number
): AccountSnapshot | null {
  const row = db
    .prepare(`SELECT * FROM cf_account_snapshots WHERE residente_id = ?`)
    .get(residenteId) as SnapshotRow | undefined;
  return row ? mapSnapshot(row) : null;
}

async function syncOneCondominio(
  condominioId: number
): Promise<SyncCondoSummary> {
  const condo = getCondominio(condominioId);
  const communityId = condo?.cf_community_id?.trim() ?? "";
  const summary: SyncCondoSummary = {
    condominioId,
    condominioName: condo?.name ?? "",
    communityId,
    properties: 0,
    matched: 0,
    unmatched: 0,
    errors: [],
    fetchedAt: Math.floor(Date.now() / 1000),
  };

  if (!condo) {
    summary.errors.push("Condominio no encontrado");
    return summary;
  }
  if (!condo.estados_cuenta) {
    summary.errors.push("Estados de cuenta no habilitados en este condominio");
    return summary;
  }
  if (!communityId) {
    summary.errors.push("Falta cf_community_id");
    return summary;
  }

  const propsRes = await getProperties(communityId);
  if (!propsRes.ok) {
    summary.errors.push(propsRes.error);
    saveSyncRun(summary);
    return summary;
  }

  const properties = propsRes.data;
  summary.properties = properties.length;

  const residentes = listResidentes({
    condominio_id: condominioId,
    active: true,
    limit: 100000,
    page: 1,
  }).data;

  const matches: { residente: Residente; property: CfProperty }[] = [];
  for (const residente of residentes) {
    const property = matchResidenteToProperty(residente, properties);
    if (!property) {
      summary.unmatched += 1;
      continue;
    }
    matches.push({ residente, property });
  }

  const accountsRes = await getPropertyAccounts(
    matches.map((m) => m.property.id)
  );
  if (!accountsRes.ok) {
    summary.errors.push(accountsRes.error);
    saveSyncRun(summary);
    return summary;
  }

  const byProperty = new Map(
    accountsRes.data.map((a) => [String(a.property_id), a] as const)
  );
  const now = summary.fetchedAt;
  for (const { residente, property } of matches) {
    upsertSnapshot(
      residente.id,
      property,
      byProperty.get(String(property.id)) ?? null,
      communityId,
      now
    );
    summary.matched += 1;
  }

  saveSyncRun(summary);
  return summary;
}

export async function syncComunidadFelizAccounts(
  condominioId?: number | null
): Promise<SyncResult> {
  if (!isComunidadFelizConfigured()) {
    return {
      enabled: false,
      summaries: [],
      error: "Integración ComunidadFeliz no configurada",
    };
  }

  const targets =
    condominioId != null
      ? [getCondominio(condominioId)].filter(
          (c): c is NonNullable<typeof c> =>
            Boolean(c && c.estados_cuenta && c.cf_community_id)
        )
      : listCondominios().filter((c) => c.estados_cuenta && c.cf_community_id);

  if (condominioId != null && targets.length === 0) {
    const condo = getCondominio(condominioId);
    return {
      enabled: true,
      summaries: [
        {
          condominioId,
          condominioName: condo?.name ?? "",
          communityId: condo?.cf_community_id ?? "",
          properties: 0,
          matched: 0,
          unmatched: 0,
          errors: [
            !condo
              ? "Condominio no encontrado"
              : !condo.estados_cuenta
                ? "Activa 'Estados de cuenta' en el condominio"
                : "Configura el community_id de ComunidadFeliz",
          ],
          fetchedAt: Math.floor(Date.now() / 1000),
        },
      ],
    };
  }

  const summaries: SyncCondoSummary[] = [];
  for (const condo of targets) {
    try {
      summaries.push(await syncOneCondominio(condo.id));
    } catch (err) {
      summaries.push({
        condominioId: condo.id,
        condominioName: condo.name,
        communityId: condo.cf_community_id ?? "",
        properties: 0,
        matched: 0,
        unmatched: 0,
        errors: [err instanceof Error ? err.message : "Error de sync"],
        fetchedAt: Math.floor(Date.now() / 1000),
      });
    }
  }

  return { enabled: true, summaries };
}

export async function refreshAccountForResidente(
  residente: Residente
): Promise<AccountSnapshot | null> {
  if (!isComunidadFelizConfigured()) return null;
  const condo = getCondominio(residente.condominio_id);
  if (!condo?.estados_cuenta || !condo.cf_community_id) return null;

  const propsRes = await getProperties(condo.cf_community_id);
  if (!propsRes.ok) {
    console.error("[comunidad-feliz] refresh properties:", propsRes.error);
    return null;
  }

  const property = matchResidenteToProperty(residente, propsRes.data);
  if (!property) return null;

  const accountsRes = await getPropertyAccounts([property.id]);
  if (!accountsRes.ok) {
    console.error("[comunidad-feliz] refresh accounts:", accountsRes.error);
    return null;
  }

  const account = accountsRes.data[0] ?? null;
  const now = Math.floor(Date.now() / 1000);
  upsertSnapshot(
    residente.id,
    property,
    account,
    condo.cf_community_id,
    now
  );
  return getCachedAccountSummary(residente.id);
}
