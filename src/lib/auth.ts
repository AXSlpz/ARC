import { randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import db from "./db";
import { verifyAdminPassword } from "./admin-settings";
import { parseAllowedLineIds } from "./user-line-access";

import type { SessionUser, UserRole } from "./admin-settings-types";
import { ROLE_LABELS } from "./admin-settings-types";
import { can, isAdminOrAbove, normalizeUserRole } from "./permissions";

export type { SessionUser, UserRole };
export type AuthUser = SessionUser;
export { ROLE_LABELS };
export { can, isAdminOrAbove, normalizeUserRole } from "./permissions";

const SESSION_COOKIE = "wa_session";
const PENDING_COOKIE = "wa_2fa_pending";

/** Sesión garantizada desde el login (sin idle). */
export const SESSION_ABSOLUTE_SEC = 8 * 60 * 60;
/**
 * Tras cumplirse las 8 h: si pasan 15 min sin actividad → logout completo.
 * Durante las 8 h iniciales el idle NO aplica.
 */
export const SESSION_IDLE_SEC = 15 * 60;
/** Máximo de sesiones concurrentes por usuario; la 3ª cierra la más antigua. */
export const MAX_SESSIONS_PER_USER = 2;

const PENDING_MAX_AGE = 5 * 60;
const MAX_LOGIN_ATTEMPTS_USER = 5;
const MAX_LOGIN_ATTEMPTS_IP = 25;
const LOCKOUT_WINDOW_SEC = 15 * 60;

export type PendingKind = "totp_verify" | "totp_setup";

/** Secure solo con HTTPS configurado; next start en LAN/http necesita cookie sin Secure. */
function useSecureSessionCookie(): boolean {
  const override = process.env.SESSION_COOKIE_SECURE;
  if (override === "true") return true;
  if (override === "false") return false;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "";
  return appUrl.startsWith("https://");
}

function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: useSecureSessionCookie(),
    sameSite: "strict" as const,
    maxAge,
    path: "/",
  };
}

interface UserRow {
  id: number;
  username: string;
  display_name: string | null;
  role: UserRole;
  allowed_line_ids?: string | null;
  totp_enabled?: number;
  totp_secret?: string | null;
}

function mapUser(row: UserRow): SessionUser {
  const role = normalizeUserRole(row.role);
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role,
    allowedLineIds: isAdminOrAbove(role)
      ? null
      : parseAllowedLineIds(row.allowed_line_ids),
    totpEnabled: Boolean(row.totp_enabled),
  };
}

function columnExists(table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  return cols.some((c) => c.name === column);
}

export function initAuthTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      ip TEXT,
      attempted_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS auth_pending (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_login_attempts_user
      ON login_attempts(username, attempted_at);
    CREATE INDEX IF NOT EXISTS idx_login_attempts_ip
      ON login_attempts(ip, attempted_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_auth_pending_expires ON auth_pending(expires_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_created
      ON sessions(user_id, created_at);
  `);

  if (!columnExists("sessions", "absolute_expires_at")) {
    db.exec(
      "ALTER TABLE sessions ADD COLUMN absolute_expires_at INTEGER NOT NULL DEFAULT 0"
    );
    // Sesiones legacy: absoluto = created_at + 8h
    db.prepare(
      `UPDATE sessions
       SET absolute_expires_at = created_at + ?
       WHERE absolute_expires_at = 0 OR absolute_expires_at IS NULL`
    ).run(SESSION_ABSOLUTE_SEC);
  }
}

function purgeExpiredSessions(): void {
  const now = Math.floor(Date.now() / 1000);
  // expires_at = fin de gracia post-8h (o idle deslizante tras las 8 h)
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
}

function purgeOldAttempts(): void {
  const cutoff = Math.floor(Date.now() / 1000) - LOCKOUT_WINDOW_SEC;
  db.prepare("DELETE FROM login_attempts WHERE attempted_at < ?").run(cutoff);
}

function purgeExpiredPending(): void {
  db.prepare("DELETE FROM auth_pending WHERE expires_at <= unixepoch()").run();
}

export function isLoginRateLimited(username: string, ip: string | null): boolean {
  purgeOldAttempts();
  const cutoff = Math.floor(Date.now() / 1000) - LOCKOUT_WINDOW_SEC;
  const normalized = username.trim().toLowerCase();

  const userCount = db
    .prepare(
      `SELECT COUNT(*) as total FROM login_attempts
       WHERE username = ? AND attempted_at > ?`
    )
    .get(normalized, cutoff) as { total: number };

  if (userCount.total >= MAX_LOGIN_ATTEMPTS_USER) return true;

  if (ip) {
    const ipCount = db
      .prepare(
        `SELECT COUNT(*) as total FROM login_attempts
         WHERE ip = ? AND attempted_at > ?`
      )
      .get(ip, cutoff) as { total: number };
    if (ipCount.total >= MAX_LOGIN_ATTEMPTS_IP) return true;
  }

  return false;
}

export function recordFailedLogin(username: string, ip: string | null): void {
  db.prepare(
    "INSERT INTO login_attempts (username, ip) VALUES (?, ?)"
  ).run(username.trim().toLowerCase(), ip);
}

export function clearLoginAttempts(username: string): void {
  db.prepare("DELETE FROM login_attempts WHERE username = ?").run(
    username.trim().toLowerCase()
  );
}

function generateSessionId(): string {
  return randomBytes(32).toString("hex");
}

function evictOldestSessionsIfNeeded(userId: number): void {
  const rows = db
    .prepare(
      `SELECT id FROM sessions
       WHERE user_id = ?
       ORDER BY created_at ASC`
    )
    .all(userId) as { id: string }[];

  const overflow = rows.length - (MAX_SESSIONS_PER_USER - 1);
  for (let i = 0; i < overflow; i++) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(rows[i]!.id);
  }
}

/**
 * Crea sesión plena tras 2FA.
 * Máx. 2 por usuario: si ya hay 2, elimina la más antigua.
 * 8 h garantizadas; luego gracia/idle de 15 min por actividad.
 */
export function createSession(userId: number): string {
  purgeExpiredSessions();
  evictOldestSessionsIfNeeded(userId);

  const now = Math.floor(Date.now() / 1000);
  const sessionId = generateSessionId();
  const absoluteExpiresAt = now + SESSION_ABSOLUTE_SEC;
  // Tras las 8 h hay 15 min de gracia si no hay actividad
  const expiresAt = absoluteExpiresAt + SESSION_IDLE_SEC;

  db.prepare(
    `INSERT INTO sessions (id, user_id, expires_at, absolute_expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(sessionId, userId, expiresAt, absoluteExpiresAt, now);

  return sessionId;
}

/**
 * Dentro de las 8 h: mantiene la sesión (sin idle).
 * Después de las 8 h: renueva +15 min por actividad; sin actividad → null (logout).
 * @returns segundos restantes para la cookie, o null si murió.
 */
export function touchSession(sessionId: string): number | null {
  purgeExpiredSessions();
  const now = Math.floor(Date.now() / 1000);
  const row = db
    .prepare(
      `SELECT expires_at, absolute_expires_at FROM sessions WHERE id = ?`
    )
    .get(sessionId) as
    | { expires_at: number; absolute_expires_at: number }
    | undefined;

  if (!row) return null;
  if (row.expires_at <= now) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    return null;
  }

  let nextExpires: number;
  if (now < row.absolute_expires_at) {
    // Periodo garantizado: idle no aplica; conserva gracia post-8h
    nextExpires = row.absolute_expires_at + SESSION_IDLE_SEC;
  } else {
    // Ya pasaron las 8 h: solo actividad mantiene la sesión
    nextExpires = now + SESSION_IDLE_SEC;
  }

  db.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?").run(
    nextExpires,
    sessionId
  );
  return Math.max(1, nextExpires - now);
}

export function createPendingAuth(
  userId: number,
  kind: PendingKind
): string {
  purgeExpiredPending();
  db.prepare("DELETE FROM auth_pending WHERE user_id = ?").run(userId);
  const id = generateSessionId();
  const expiresAt = Math.floor(Date.now() / 1000) + PENDING_MAX_AGE;
  db.prepare(
    "INSERT INTO auth_pending (id, user_id, kind, expires_at) VALUES (?, ?, ?, ?)"
  ).run(id, userId, kind, expiresAt);
  return id;
}

export function destroyPendingAuth(pendingId: string): void {
  db.prepare("DELETE FROM auth_pending WHERE id = ?").run(pendingId);
}

export function getPendingAuth(
  pendingId: string
): { userId: number; kind: PendingKind } | null {
  purgeExpiredPending();
  if (!pendingId || !/^[a-f0-9]{64}$/.test(pendingId)) return null;
  const row = db
    .prepare(
      `SELECT user_id, kind FROM auth_pending
       WHERE id = ? AND expires_at > unixepoch()`
    )
    .get(pendingId) as { user_id: number; kind: PendingKind } | undefined;
  return row ? { userId: row.user_id, kind: row.kind } : null;
}

export function destroySession(sessionId: string): void {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

export function destroyUserSessions(userId: number): void {
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

export function countUserSessions(userId: number): number {
  purgeExpiredSessions();
  const row = db
    .prepare("SELECT COUNT(*) as total FROM sessions WHERE user_id = ?")
    .get(userId) as { total: number };
  return row.total;
}

export function getUserByCredentials(
  username: string,
  password: string
): (SessionUser & { totpSecret: string | null }) | null {
  const normalized = username.trim().toLowerCase();
  if (!verifyAdminPassword(normalized, password)) return null;

  const row = db
    .prepare(
      `SELECT id, username, display_name, role, allowed_line_ids,
              totp_enabled, totp_secret
       FROM admin_users WHERE username = ?`
    )
    .get(normalized) as UserRow | undefined;

  if (!row) return null;
  return { ...mapUser(row), totpSecret: row.totp_secret ?? null };
}

export function getUserRowById(userId: number): UserRow | null {
  return (
    (db
      .prepare(
        `SELECT id, username, display_name, role, allowed_line_ids,
                totp_enabled, totp_secret
         FROM admin_users WHERE id = ?`
      )
      .get(userId) as UserRow | undefined) ?? null
  );
}

async function refreshSessionCookie(
  sessionId: string,
  idleRemainingSec: number
): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.set(
      SESSION_COOKIE,
      sessionId,
      sessionCookieOptions(idleRemainingSec)
    );
  } catch {
    // Contexto de solo lectura: el idle queda en DB; la cookie se refresca en la próxima mutación.
  }
}

export async function getAuthUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId || !/^[a-f0-9]{64}$/.test(sessionId)) return null;

  const idleRemaining = touchSession(sessionId);
  if (idleRemaining == null) return null;

  const row = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.role, u.allowed_line_ids,
              u.totp_enabled, u.totp_secret
       FROM sessions s
       JOIN admin_users u ON u.id = s.user_id
       WHERE s.id = ?`
    )
    .get(sessionId) as UserRow | undefined;

  if (!row) return null;
  if (!row.totp_enabled) return null;

  await refreshSessionCookie(sessionId, idleRemaining);
  return mapUser(row);
}

export function setSessionCookie(response: NextResponse, sessionId: string): void {
  response.cookies.set(
    SESSION_COOKIE,
    sessionId,
    sessionCookieOptions(SESSION_ABSOLUTE_SEC + SESSION_IDLE_SEC)
  );
}

export function setPendingCookie(response: NextResponse, pendingId: string): void {
  response.cookies.set(
    PENDING_COOKIE,
    pendingId,
    sessionCookieOptions(PENDING_MAX_AGE)
  );
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(0),
    maxAge: 0,
  });
}

export function clearPendingCookie(response: NextResponse): void {
  response.cookies.set(PENDING_COOKIE, "", {
    ...sessionCookieOptions(0),
    maxAge: 0,
  });
}

export async function getSessionId(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE)?.value;
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

export async function getPendingIdFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(PENDING_COOKIE)?.value;
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

export function isAuthError(
  value: SessionUser | NextResponse
): value is NextResponse {
  return value instanceof NextResponse;
}

export async function requireAuth(): Promise<SessionUser | NextResponse> {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return user;
}

export async function requireAdmin(): Promise<SessionUser | NextResponse> {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  if (!isAdminOrAbove(result.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }
  return result;
}

export async function requireSuperAdmin(): Promise<SessionUser | NextResponse> {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  if (result.role !== "super_admin") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }
  return result;
}

export async function requirePermission(
  permission: Parameters<typeof can>[1]
): Promise<SessionUser | NextResponse> {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  if (!can(result, permission)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }
  return result;
}

/** Valida Origin/Referer contra NEXT_PUBLIC_APP_URL en mutaciones. */
export function assertSameOrigin(req: NextRequest): NextResponse | null {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!appUrl) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Configuración de origen inválida" },
        { status: 500 }
      );
    }
    return null;
  }

  let expected: string;
  try {
    expected = new URL(appUrl).origin;
  } catch {
    return NextResponse.json({ error: "Configuración de origen inválida" }, { status: 500 });
  }

  const origin = req.headers.get("origin");
  if (origin) {
    return origin === expected
      ? null
      : NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }

  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === expected
        ? null
        : NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
    } catch {
      return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
    }
  }

  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Origen requerido" }, { status: 403 });
  }
  return null;
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

initAuthTables();
