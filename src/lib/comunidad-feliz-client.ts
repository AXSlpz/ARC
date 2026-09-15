import fs from "node:fs";
import path from "node:path";

const TOKEN_PATH = path.resolve(process.cwd(), "data", "cf-token.json");
const ACCEPT_HEADER =
  process.env.COMUNIDAD_FELIZ_ACCEPT ?? "application/vnd.comunidadfeliz.v2";
const MAX_REQ_PER_SEC = 5;
const BATCH_SIZE = 100;
const PROPERTIES_PER_PAGE = 100;

let warnedDisabled = false;
const requestTimestamps: number[] = [];

export interface CfTokenCache {
  token: string;
  expires_at: string;
}

export interface CfProperty {
  id: string;
  community_id: string;
  name: string;
  owner_name: string | null;
  owner_email: string | null;
  raw: Record<string, unknown>;
}

export interface CfPropertyAccount {
  property_id: string;
  total_to_pay: number;
  currency: string | null;
  last_payment_at: string | null;
  last_payment_amount: number | null;
  raw: Record<string, unknown>;
}

export type CfClientResult<T> =
  | { ok: true; data: T }
  | { ok: false; disabled?: boolean; error: string; status?: number };

function getConfig(): {
  baseUrl: string;
  email: string;
  password: string;
} | null {
  const baseUrl = (process.env.COMUNIDAD_FELIZ_BASE_URL ?? "").trim().replace(/\/$/, "");
  const email = (process.env.COMUNIDAD_FELIZ_EMAIL ?? "").trim();
  const password = process.env.COMUNIDAD_FELIZ_PASSWORD ?? "";
  if (!baseUrl || !email || !password) return null;
  return { baseUrl, email, password };
}

function logDisabledOnce(): void {
  if (warnedDisabled) return;
  warnedDisabled = true;
  console.warn(
    "[comunidad-feliz] Integración deshabilitada: faltan COMUNIDAD_FELIZ_BASE_URL / EMAIL / PASSWORD"
  );
}

async function waitForRateLimit(depth = 0): Promise<void> {
  if (depth > 20) return;
  const now = Date.now();
  while (requestTimestamps.length > 0 && now - requestTimestamps[0]! >= 1000) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length < MAX_REQ_PER_SEC) {
    requestTimestamps.push(Date.now());
    return;
  }
  const waitMs = 1000 - (now - requestTimestamps[0]!) + 10;
  await new Promise((r) => setTimeout(r, Math.max(waitMs, 50)));
  return waitForRateLimit(depth + 1);
}

function readTokenCache(): CfTokenCache | null {
  try {
    if (!fs.existsSync(TOKEN_PATH)) return null;
    const raw = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8")) as CfTokenCache;
    if (!raw?.token || !raw?.expires_at) return null;
    return raw;
  } catch {
    return null;
  }
}

function writeTokenCache(cache: CfTokenCache): void {
  const dir = path.dirname(TOKEN_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(cache, null, 2), "utf8");
}

function isTokenFresh(cache: CfTokenCache, skewMs = 60 * 60 * 1000): boolean {
  const expires = Date.parse(cache.expires_at);
  if (Number.isNaN(expires)) return false;
  return expires - Date.now() > skewMs;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const rec = asRecord(value);
  if (!rec) return [];
  for (const key of ["data", "properties", "property_accounts", "accounts", "results"]) {
    if (Array.isArray(rec[key])) return rec[key] as unknown[];
  }
  return [];
}

function pickString(rec: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = rec[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function pickNumber(rec: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const v = rec[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim()) {
      const n = Number(v.replace(/,/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function normalizeProperty(item: unknown): CfProperty | null {
  const rec = asRecord(item);
  if (!rec) return null;
  const id = pickString(rec, ["id", "property_id", "propertyId"]);
  if (!id) return null;

  const owner = asRecord(rec.owner) ?? asRecord(rec.propietario) ?? null;
  const community = asRecord(rec.community) ?? asRecord(rec.comunidad) ?? null;
  const ownerName =
    pickString(rec, [
      "owner_name",
      "ownerName",
      "propietario",
      "propietario_nombre",
      "nombre_propietario",
      "name_owner",
    ]) ??
    (owner
      ? pickString(owner, ["name", "nombre", "full_name", "fullName"])
      : null);
  const ownerEmail =
    pickString(rec, [
      "owner_email",
      "ownerEmail",
      "email",
      "propietario_email",
      "correo",
    ]) ?? (owner ? pickString(owner, ["email", "correo", "mail"]) : null);

  // Prefer address for matching when present (API Corredores recommendation).
  const address = pickString(rec, ["address", "direccion", "dirección"]);
  const unitName =
    pickString(rec, [
      "name",
      "property_name",
      "propertyName",
      "unidad",
      "unit",
      "unit_name",
      "nombre",
    ]) ?? id;

  return {
    id,
    community_id:
      pickString(rec, ["community_id", "communityId", "comunidad_id"]) ??
      (community ? pickString(community, ["id", "community_id"]) : null) ??
      "",
    name: address || unitName,
    owner_name: ownerName,
    owner_email: ownerEmail,
    raw: rec,
  };
}

function normalizeAccount(item: unknown): CfPropertyAccount | null {
  const rec = asRecord(item);
  if (!rec) return null;

  const nestedProperty = asRecord(rec.property);
  const propertyId =
    pickString(rec, ["property_id", "propertyId"]) ??
    (nestedProperty
      ? pickString(nestedProperty, ["id", "property_id", "propertyId"])
      : null);
  if (!propertyId) return null;

  const lastPayment =
    asRecord(rec.last_payment) ??
    asRecord(rec.lastPayment) ??
    asRecord(rec.ultimo_pago) ??
    null;

  return {
    property_id: propertyId,
    total_to_pay:
      pickNumber(rec, [
        "total_to_pay",
        "totalToPay",
        "total",
        "balance",
        "saldo",
        "money_balance",
      ]) ?? 0,
    currency: pickString(rec, ["currency", "moneda", "currency_code"]),
    last_payment_at:
      pickString(rec, ["paid_at", "last_payment_at", "ultimo_pago_at"]) ??
      (lastPayment
        ? pickString(lastPayment, ["paid_at", "date", "fecha", "at"])
        : null),
    last_payment_amount:
      pickNumber(rec, [
        "last_payment_amount",
        "last_payment_monto",
        "ultimo_pago_monto",
        "paid_amount",
      ]) ??
      (lastPayment
        ? pickNumber(lastPayment, ["amount", "monto", "price", "value"])
        : null),
    raw: rec,
  };
}

async function requestJson(
  method: string,
  urlPath: string,
  body?: unknown,
  token?: string,
  retries = 0
): Promise<CfClientResult<unknown>> {
  const config = getConfig();
  if (!config) {
    logDisabledOnce();
    return { ok: false, disabled: true, error: "Integración no configurada" };
  }

  await waitForRateLimit();

  const headers: Record<string, string> = {
    Accept: ACCEPT_HEADER,
    "Content-Type": "application/json",
  };
  if (token) headers["ACCESS-TOKEN"] = token;

  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}${urlPath}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return { ok: false, error: "Timeout al consultar ComunidadFeliz" };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error de red",
    };
  }

  if (res.status === 429) {
    if (retries >= 3) {
      return { ok: false, error: "Rate limit excedido (429)", status: 429 };
    }
    const retryAfter = Number(res.headers.get("Retry-After") ?? "1");
    await new Promise((r) =>
      setTimeout(r, Math.max(1, Number.isFinite(retryAfter) ? retryAfter : 1) * 1000)
    );
    return requestJson(method, urlPath, body, token, retries + 1);
  }

  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!res.ok) {
    const rec = asRecord(payload);
    const message =
      pickString(rec ?? {}, ["error", "message", "detail"]) ??
      `HTTP ${res.status}`;
    return { ok: false, error: message, status: res.status };
  }

  return { ok: true, data: payload };
}

export function isComunidadFelizConfigured(): boolean {
  return getConfig() != null;
}

export async function getAccessToken(
  forceRefresh = false
): Promise<CfClientResult<string>> {
  const config = getConfig();
  if (!config) {
    logDisabledOnce();
    return { ok: false, disabled: true, error: "Integración no configurada" };
  }

  if (!forceRefresh) {
    const cached = readTokenCache();
    if (cached && isTokenFresh(cached)) {
      return { ok: true, data: cached.token };
    }
  }

  const auth = await requestJson("POST", "/api/auth/token", {
    email: config.email,
    password: config.password,
  });
  if (!auth.ok) return auth;

  const rec = asRecord(auth.data);
  const token = pickString(rec ?? {}, ["token", "access_token", "accessToken"]);
  const expiresAt =
    pickString(rec ?? {}, ["expires_at", "expiresAt", "expiration"]) ??
    new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  if (!token) {
    return { ok: false, error: "Respuesta de auth sin token" };
  }

  writeTokenCache({ token, expires_at: expiresAt });
  return { ok: true, data: token };
}

async function withToken<T>(
  fn: (token: string) => Promise<CfClientResult<T>>
): Promise<CfClientResult<T>> {
  const first = await getAccessToken(false);
  if (!first.ok) return first;
  const result = await fn(first.data);
  if (result.ok || result.status !== 401) return result;

  const refreshed = await getAccessToken(true);
  if (!refreshed.ok) return refreshed;
  return fn(refreshed.data);
}

function readPaginationTotal(payload: unknown): number | null {
  const rec = asRecord(payload);
  const pagination = asRecord(rec?.pagination);
  if (!pagination) return null;
  return pickNumber(pagination, ["total"]);
}

export async function getProperties(
  communityId?: string | null
): Promise<CfClientResult<CfProperty[]>> {
  return withToken(async (token) => {
    const all: CfProperty[] = [];
    let page = 1;
    let total: number | null = null;

    // API Corredores: GET /api/properties es cross-community y paginado
    // (page / per_page, máx. 100). Filtramos community_id en cliente.
    while (true) {
      const qs = `?page=${page}&per_page=${PROPERTIES_PER_PAGE}`;
      const res = await requestJson(
        "GET",
        `/api/properties${qs}`,
        undefined,
        token
      );
      if (!res.ok) return res;

      const pageItems = asArray(res.data)
        .map(normalizeProperty)
        .filter((p): p is CfProperty => p != null);
      all.push(...pageItems);

      if (total == null) total = readPaginationTotal(res.data);
      const reachedTotal = total != null && all.length >= total;
      const shortPage = pageItems.length < PROPERTIES_PER_PAGE;
      if (reachedTotal || shortPage || pageItems.length === 0) break;
      page += 1;
      if (page > 1000) break;
    }

    const filtered =
      communityId && communityId.trim()
        ? all.filter(
            (p) =>
              !p.community_id ||
              p.community_id === communityId.trim() ||
              String(p.community_id) === communityId.trim()
          )
        : all;

    return { ok: true, data: filtered };
  });
}

export async function getPropertyAccounts(
  propertyIds: string[]
): Promise<CfClientResult<CfPropertyAccount[]>> {
  const unique = [
    ...new Set(
      propertyIds
        .map((id) => String(id).trim())
        .filter(Boolean)
    ),
  ];
  if (unique.length === 0) return { ok: true, data: [] };

  return withToken(async (token) => {
    const all: CfPropertyAccount[] = [];
    for (let i = 0; i < unique.length; i += BATCH_SIZE) {
      const chunk = unique.slice(i, i + BATCH_SIZE);
      // Schema oficial: property_ids como enteros (máx. 100).
      const property_ids = chunk
        .map((id) => Number(id))
        .filter((n) => Number.isFinite(n));
      if (property_ids.length === 0) continue;

      const res = await requestJson(
        "POST",
        "/api/property_accounts",
        { property_ids, per_page: Math.min(property_ids.length, 100) },
        token
      );
      if (!res.ok) return res;
      const items = asArray(res.data)
        .map(normalizeAccount)
        .filter((a): a is CfPropertyAccount => a != null);
      all.push(...items);
    }
    return { ok: true, data: all };
  });
}
