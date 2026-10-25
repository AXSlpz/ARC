import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import db from "../db";
import { hashPassword, verifyPassword } from "../password";
import {
  createPendingResidenteFromPortal,
  findResidentesByEmail,
  findResidentesByRegisteredPhone,
  getResidente,
} from "../residentes";
import { initPortalSchema } from "./init-portal";
import type { PortalUser } from "./types";

initPortalSchema();

const PORTAL_COOKIE = "arc_portal_session";
const SESSION_TTL_SEC = 30 * 24 * 60 * 60; // 30 días deslizantes
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

interface PortalUserRow {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  active: number;
  created_at: number;
}

function mapUser(row: PortalUserRow): PortalUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    active: Boolean(row.active),
    createdAt: row.created_at,
  };
}

function portalCookieOptions(maxAge: number) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "";
  const secure =
    process.env.SESSION_COOKIE_SECURE === "true" ||
    appUrl.startsWith("https://");
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    maxAge,
    path: "/",
  };
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export interface RegisterInput {
  name: string;
  email: string;
  phone?: string | null;
  password: string;
}

export type RegisterResult =
  | { ok: true; user: PortalUser }
  | { ok: false; error: string };

export function registerPortalUser(input: RegisterInput): RegisterResult {
  const name = input.name?.trim();
  const email = input.email?.trim().toLowerCase();
  const phone = input.phone?.trim() || null;
  const password = input.password ?? "";

  if (!name || name.length < 2) {
    return { ok: false, error: "Nombre inválido (mínimo 2 caracteres)." };
  }
  if (!email || !isValidEmail(email)) {
    return { ok: false, error: "Correo electrónico inválido." };
  }
  if (password.length < 8) {
    return { ok: false, error: "La contraseña debe tener al menos 8 caracteres." };
  }

  const existing = db
    .prepare("SELECT id FROM portal_users WHERE email = ?")
    .get(email) as { id: number } | undefined;
  if (existing) {
    return { ok: false, error: "Ya existe una cuenta con ese correo." };
  }

  const result = db
    .prepare(
      "INSERT INTO portal_users (name, email, phone, password_hash) VALUES (?, ?, ?, ?)"
    )
    .run(name, email, phone, hashPassword(password));

  const row = db
    .prepare(
      "SELECT id, name, email, phone, active, created_at FROM portal_users WHERE id = ?"
    )
    .get(result.lastInsertRowid) as PortalUserRow;

  // Enlace best-effort con un residente existente (por correo/teléfono).
  try {
    linkPortalUserToResidente(row.id, { email, phone });
  } catch {
    /* no bloquea el registro */
  }

  return { ok: true, user: mapUser(row) };
}

/**
 * Enlaza un usuario del portal con un residente. Si ya existe un residente que
 * coincide por correo o teléfono, lo enlaza. Si no, crea un residente MÍNIMO
 * marcado como "pendiente de asignación" (condominio placeholder) para que el
 * admin le asigne colonia/vivienda y complete su información (#6).
 * Solo actúa si el usuario aún no tiene residente enlazado.
 */
export function linkPortalUserToResidente(
  userId: number,
  who: { email?: string | null; phone?: string | null }
): number | null {
  const current = db
    .prepare("SELECT residente_id, name, email, phone FROM portal_users WHERE id = ?")
    .get(userId) as
    | { residente_id: number | null; name: string; email: string; phone: string | null }
    | undefined;
  if (!current) return null;
  if (current.residente_id) return current.residente_id;

  const byEmail = who.email ? findResidentesByEmail(who.email) : [];
  const byPhone = who.phone ? findResidentesByRegisteredPhone(who.phone) : [];
  const match = byEmail[0] ?? byPhone[0] ?? null;

  const residenteId =
    match?.id ??
    createPendingResidenteFromPortal({
      nombre: current.name,
      email: who.email ?? current.email,
      phone: who.phone ?? current.phone,
    }).id;

  db.prepare("UPDATE portal_users SET residente_id = ? WHERE id = ?").run(
    residenteId,
    userId
  );
  return residenteId;
}

function last10Digits(phone: string | number | null | undefined): string {
  return String(phone ?? "").replace(/\D+/g, "").slice(-10);
}

function uniqueSyntheticPortalEmail(residenteId: number): string {
  const base = `residente-${residenteId}@pending.arc.local`;
  const taken = db
    .prepare("SELECT id FROM portal_users WHERE LOWER(email) = ?")
    .get(base) as { id: number } | undefined;
  if (!taken) return base;
  let n = 2;
  while (true) {
    const candidate = `residente-${residenteId}-${n}@pending.arc.local`;
    const clash = db
      .prepare("SELECT id FROM portal_users WHERE LOWER(email) = ?")
      .get(candidate) as { id: number } | undefined;
    if (!clash) return candidate;
    n += 1;
  }
}

export type EnsurePortalUserResult =
  | { ok: true; portalUserId: number }
  | { ok: false; error: string };

/**
 * Garantiza un `portal_user` enlazado al residente.
 *
 * Orden de búsqueda: `residente_id` → email (case insensitive) → teléfono
 * (últimos 10 dígitos). Si no existe, crea la cuenta con `password_hash`
 * aleatorio y `active=1`.
 *
 * Si el residente no tiene correo, se genera un email sintético único
 * `residente-{id}@pending.arc.local`. Esa cuenta **no puede iniciar sesión
 * real** hasta que el residente (o un admin) actualice el correo a uno válido.
 */
export function ensurePortalUserForResidente(
  residenteId: number
): EnsurePortalUserResult {
  const residente = getResidente(residenteId);
  if (!residente) {
    return { ok: false, error: "Residente no encontrado." };
  }

  const byResidente = db
    .prepare("SELECT id FROM portal_users WHERE residente_id = ?")
    .get(residenteId) as { id: number } | undefined;
  if (byResidente) {
    return { ok: true, portalUserId: byResidente.id };
  }

  const email = residente.email?.trim().toLowerCase() || null;
  if (email) {
    const byEmail = db
      .prepare(
        "SELECT id, residente_id FROM portal_users WHERE LOWER(email) = ?"
      )
      .get(email) as { id: number; residente_id: number | null } | undefined;
    if (byEmail) {
      if (!byEmail.residente_id) {
        db.prepare("UPDATE portal_users SET residente_id = ? WHERE id = ?").run(
          residenteId,
          byEmail.id
        );
      }
      return { ok: true, portalUserId: byEmail.id };
    }
  }

  const targetPhone = last10Digits(residente.celular);
  if (targetPhone.length === 10) {
    const candidates = db
      .prepare(
        `SELECT id, phone, residente_id FROM portal_users
         WHERE phone IS NOT NULL AND TRIM(phone) != ''`
      )
      .all() as Array<{
      id: number;
      phone: string;
      residente_id: number | null;
    }>;
    const match = candidates.find(
      (u) => last10Digits(u.phone) === targetPhone
    );
    if (match) {
      if (!match.residente_id) {
        db.prepare("UPDATE portal_users SET residente_id = ? WHERE id = ?").run(
          residenteId,
          match.id
        );
      }
      return { ok: true, portalUserId: match.id };
    }
  }

  const portalEmail = email ?? uniqueSyntheticPortalEmail(residenteId);
  const phone = residente.celular != null ? String(residente.celular) : null;
  const name = residente.nombre?.trim() || `Residente ${residenteId}`;
  const passwordHash = hashPassword(randomBytes(32).toString("hex"));

  try {
    const res = db
      .prepare(
        `INSERT INTO portal_users (name, email, phone, password_hash, active, residente_id)
         VALUES (?, ?, ?, ?, 1, ?)`
      )
      .run(name, portalEmail, phone, passwordHash, residenteId);
    return { ok: true, portalUserId: Number(res.lastInsertRowid) };
  } catch (err) {
    console.error("[portal] ensurePortalUserForResidente:", err);
    return {
      ok: false,
      error: "No se pudo crear la cuenta del portal para el residente.",
    };
  }
}

export function verifyPortalCredentials(
  email: string,
  password: string
): PortalUser | null {
  const normalized = email.trim().toLowerCase();
  const row = db
    .prepare(
      "SELECT id, name, email, phone, active, password_hash, created_at FROM portal_users WHERE email = ?"
    )
    .get(normalized) as (PortalUserRow & { password_hash: string }) | undefined;

  if (!row || !row.active) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  return mapUser(row);
}

function purgeExpiredPortalSessions(): void {
  db.prepare("DELETE FROM portal_sessions WHERE expires_at <= unixepoch()").run();
}

export function createPortalSession(userId: number): string {
  purgeExpiredPortalSessions();
  const id = randomBytes(32).toString("hex");
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;
  db.prepare(
    "INSERT INTO portal_sessions (id, user_id, expires_at) VALUES (?, ?, ?)"
  ).run(id, userId, expiresAt);
  return id;
}

export function destroyPortalSession(sessionId: string): void {
  db.prepare("DELETE FROM portal_sessions WHERE id = ?").run(sessionId);
}

export interface UpdateProfileInput {
  name?: string;
  email?: string;
  phone?: string | null;
  /**
   * Requerida cuando se cambia el email. Verifica identidad antes de
   * modificar la dirección de inicio de sesión e invalidar otras sesiones.
   */
  currentPassword?: string;
  /**
   * ID de la sesión actual. Cuando se cambia el email, todas las sesiones
   * EXCEPTO esta son invalidadas para forzar re-autenticación en otros
   * dispositivos. Si es undefined, se invalidan TODAS las sesiones.
   */
  currentSessionId?: string;
}

export type UpdateProfileResult =
  | { ok: true; user: PortalUser }
  | { ok: false; error: string };

export function updatePortalProfile(
  userId: number,
  input: UpdateProfileInput
): UpdateProfileResult {
  const current = db
    .prepare(
      "SELECT id, name, email, phone, active, created_at, password_hash FROM portal_users WHERE id = ?"
    )
    .get(userId) as (PortalUserRow & { password_hash: string }) | undefined;
  if (!current) return { ok: false, error: "Cuenta no encontrada." };

  const name = input.name != null ? input.name.trim() : current.name;
  const newEmail = input.email != null ? input.email.trim().toLowerCase() : current.email;
  const phone =
    input.phone !== undefined ? input.phone?.trim() || null : current.phone;

  if (!name || name.length < 2) {
    return { ok: false, error: "Nombre inválido (mínimo 2 caracteres)." };
  }
  if (!isValidEmail(newEmail)) {
    return { ok: false, error: "Correo electrónico inválido." };
  }

  const emailChanging = newEmail !== current.email;

  // ── Seguridad de cambio de email ─────────────────────────────────────────
  if (emailChanging) {
    if (!input.currentPassword) {
      return {
        ok: false,
        error: "Para cambiar el correo debes verificar tu contraseña actual.",
      };
    }
    if (!verifyPassword(input.currentPassword, current.password_hash)) {
      return {
        ok: false,
        error: "La contraseña actual no es correcta. No se realizaron cambios.",
      };
    }
  }

  const clash = db
    .prepare("SELECT id FROM portal_users WHERE email = ? AND id <> ?")
    .get(newEmail, userId) as { id: number } | undefined;
  if (clash) {
    return { ok: false, error: "Ese correo ya está en uso por otra cuenta." };
  }

  // ── Actualizar perfil ──────────────────────────────────────────────────────
  db.prepare(
    "UPDATE portal_users SET name = ?, email = ?, phone = ? WHERE id = ?"
  ).run(name, newEmail, phone, userId);

  // ── Invalidar otras sesiones al cambiar email ─────────────────────────────
  if (emailChanging) {
    if (input.currentSessionId) {
      // Preservar solo la sesión actual
      db.prepare(
        "DELETE FROM portal_sessions WHERE user_id = ? AND id != ?"
      ).run(userId, input.currentSessionId);
    } else {
      // Sin sesión conocida: invalidar todas (el usuario deberá hacer login de nuevo)
      db.prepare("DELETE FROM portal_sessions WHERE user_id = ?").run(userId);
    }
  }

  // Reintenta enlazar con residente si cambió correo/teléfono y no había enlace.
  try {
    linkPortalUserToResidente(userId, { email: newEmail, phone });
  } catch {
    /* best-effort */
  }

  const row = db
    .prepare(
      "SELECT id, name, email, phone, active, created_at FROM portal_users WHERE id = ?"
    )
    .get(userId) as PortalUserRow;
  return { ok: true, user: mapUser(row) };
}

export type ChangePasswordResult = { ok: true } | { ok: false; error: string };

export function changePortalPassword(
  userId: number,
  currentPassword: string,
  newPassword: string
): ChangePasswordResult {
  const row = db
    .prepare("SELECT password_hash FROM portal_users WHERE id = ?")
    .get(userId) as { password_hash: string } | undefined;
  if (!row) return { ok: false, error: "Cuenta no encontrada." };
  if (!verifyPassword(currentPassword, row.password_hash)) {
    return { ok: false, error: "La contraseña actual no es correcta." };
  }
  if (!newPassword || newPassword.length < 8) {
    return { ok: false, error: "La nueva contraseña debe tener al menos 8 caracteres." };
  }
  db.prepare("UPDATE portal_users SET password_hash = ? WHERE id = ?").run(
    hashPassword(newPassword),
    userId
  );
  return { ok: true };
}

export function getPortalUserById(userId: number): PortalUser | null {
  const row = db
    .prepare(
      "SELECT id, name, email, phone, active, created_at FROM portal_users WHERE id = ?"
    )
    .get(userId) as PortalUserRow | undefined;
  return row ? mapUser(row) : null;
}

export async function getPortalUser(): Promise<PortalUser | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(PORTAL_COOKIE)?.value;
  if (!sessionId || !TOKEN_PATTERN.test(sessionId)) return null;

  const now = Math.floor(Date.now() / 1000);
  const row = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.phone, u.active, u.created_at, s.expires_at
       FROM portal_sessions s
       JOIN portal_users u ON u.id = s.user_id
       WHERE s.id = ?`
    )
    .get(sessionId) as (PortalUserRow & { expires_at: number }) | undefined;

  if (!row) return null;
  if (row.expires_at <= now) {
    destroyPortalSession(sessionId);
    return null;
  }
  if (!row.active) return null;

  // Sesión deslizante: renueva expiración en cada acceso.
  db.prepare("UPDATE portal_sessions SET expires_at = ? WHERE id = ?").run(
    now + SESSION_TTL_SEC,
    sessionId
  );
  return mapUser(row);
}

export function setPortalCookie(response: NextResponse, sessionId: string): void {
  response.cookies.set(PORTAL_COOKIE, sessionId, portalCookieOptions(SESSION_TTL_SEC));
}

export function clearPortalCookie(response: NextResponse): void {
  response.cookies.set(PORTAL_COOKIE, "", { ...portalCookieOptions(0), maxAge: 0 });
}

export async function getPortalSessionId(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(PORTAL_COOKIE)?.value;
  return value && TOKEN_PATTERN.test(value) ? value : null;
}

export function isPortalAuthError(
  value: PortalUser | NextResponse
): value is NextResponse {
  return value instanceof NextResponse;
}

export async function requirePortalUser(): Promise<PortalUser | NextResponse> {
  const user = await getPortalUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return user;
}
