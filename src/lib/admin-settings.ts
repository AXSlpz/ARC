import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import db from "./db";
import {
  listWaLineIds,
  parseAllowedLineIds,
  serializeAllowedLineIds,
} from "./user-line-access";
import {
  DEFAULT_BUSINESS_HOURS,
  DEFAULT_CHAT_COLORS,
  type AdminSettings,
  type AdminUser,
  type AdminUserInput,
  type AdminUserUpdate,
  type ChatColors,
  type UserRole,
} from "./admin-settings-types";
import { DEFAULT_INACTIVITY_FAREWELL_MESSAGE } from "./inactivity";
import {
  ensureCaptivePortalLogoSynced,
  getCaptivePortalLogoUrl,
  removeCaptivePortalLogos,
  syncCaptivePortalLogo,
} from "./branding-logo";
import {
  isAdminOrAbove,
  normalizeUserRole,
} from "./permissions";

export type {
  WeekdayKey,
  DaySchedule,
  AdminSettings,
  AdminUser,
  AdminUserInput,
  AdminUserUpdate,
} from "./admin-settings-types";

export {
  WEEKDAY_KEYS,
  WEEKDAY_LABELS,
  DEFAULT_BUSINESS_HOURS,
} from "./admin-settings-types";

const UPLOADS_DIR = path.resolve(process.cwd(), "data", "uploads");

interface SettingsRow {
  business_name: string;
  logo_filename: string | null;
  timezone: string;
  business_hours: string;
  holidays: string;
  chat_colors: string;
  welcome_message?: string;
  menu_enabled?: number;
  urgency_keywords?: string;
  inactivity_farewell_message?: string;
  inactivity_auto_close_enabled?: number;
}

function parseChatColors(raw: string | undefined): ChatColors {
  if (!raw) return DEFAULT_CHAT_COLORS;
  try {
    const parsed = JSON.parse(raw) as Partial<ChatColors>;
    return {
      assistant: parsed.assistant ?? DEFAULT_CHAT_COLORS.assistant,
      human: parsed.human ?? DEFAULT_CHAT_COLORS.human,
      user: parsed.user ?? DEFAULT_CHAT_COLORS.user,
    };
  } catch {
    return DEFAULT_CHAT_COLORS;
  }
}

function columnExists(table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  return cols.some((c) => c.name === column);
}

function ensureUploadsDir(): void {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

function parseSettingsRow(row: SettingsRow): AdminSettings {
  let businessHours = DEFAULT_BUSINESS_HOURS;
  let holidays: string[] = [];

  try {
    businessHours = {
      ...DEFAULT_BUSINESS_HOURS,
      ...JSON.parse(row.business_hours),
    };
  } catch {}

  try {
    holidays = JSON.parse(row.holidays);
  } catch {}

  return {
    businessName: row.business_name,
    logoFilename: row.logo_filename,
    logoUrl: getCaptivePortalLogoUrl(row.logo_filename),
    timezone: row.timezone,
    businessHours,
    holidays,
    chatColors: parseChatColors(row.chat_colors),
    welcomeMessage: row.welcome_message?.trim() ?? "",
    menuEnabled: row.menu_enabled !== 0,
    urgencyKeywords: parseUrgencyKeywords(row.urgency_keywords),
    inactivityFarewellMessage:
      row.inactivity_farewell_message?.trim() ||
      DEFAULT_INACTIVITY_FAREWELL_MESSAGE,
    inactivityAutoCloseEnabled: row.inactivity_auto_close_enabled === 1,
  };
}

function parseUrgencyKeywords(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function getAdminSettings(): AdminSettings {
  const row = db
    .prepare(
      "SELECT business_name, logo_filename, timezone, business_hours, holidays, chat_colors, welcome_message, menu_enabled, urgency_keywords, inactivity_farewell_message, inactivity_auto_close_enabled FROM admin_settings WHERE id = 1"
    )
    .get() as SettingsRow | undefined;

  if (!row) {
    return {
      businessName: "ARC",
      logoFilename: null,
      logoUrl: null,
      timezone: process.env.BUSINESS_TIMEZONE ?? "America/Mexico_City",
      businessHours: DEFAULT_BUSINESS_HOURS,
      holidays: [],
      chatColors: DEFAULT_CHAT_COLORS,
      welcomeMessage: "",
      menuEnabled: true,
      urgencyKeywords: [],
      inactivityFarewellMessage: DEFAULT_INACTIVITY_FAREWELL_MESSAGE,
      inactivityAutoCloseEnabled: false,
    };
  }

  return parseSettingsRow(row);
}

export function saveAdminSettings(
  update: Partial<
    Pick<
      AdminSettings,
      | "businessName"
      | "timezone"
      | "businessHours"
      | "holidays"
      | "chatColors"
      | "welcomeMessage"
      | "menuEnabled"
      | "urgencyKeywords"
      | "inactivityFarewellMessage"
      | "inactivityAutoCloseEnabled"
    >
  >
): AdminSettings {
  const current = getAdminSettings();

  db.prepare(
    `UPDATE admin_settings
     SET business_name = ?, timezone = ?, business_hours = ?, holidays = ?,
         chat_colors = ?, welcome_message = ?, menu_enabled = ?,
         urgency_keywords = ?, inactivity_farewell_message = ?,
         inactivity_auto_close_enabled = ?,
         updated_at = unixepoch()
     WHERE id = 1`
  ).run(
    update.businessName ?? current.businessName,
    update.timezone ?? current.timezone,
    JSON.stringify(update.businessHours ?? current.businessHours),
    JSON.stringify(update.holidays ?? current.holidays),
    JSON.stringify(update.chatColors ?? current.chatColors),
    update.welcomeMessage ?? current.welcomeMessage,
    (update.menuEnabled ?? current.menuEnabled) ? 1 : 0,
    JSON.stringify(update.urgencyKeywords ?? current.urgencyKeywords),
    update.inactivityFarewellMessage ?? current.inactivityFarewellMessage,
    (update.inactivityAutoCloseEnabled ?? current.inactivityAutoCloseEnabled) ? 1 : 0
  );

  return getAdminSettings();
}

export function saveAdminLogo(filename: string): AdminSettings {
  db.prepare(
    "UPDATE admin_settings SET logo_filename = ?, updated_at = unixepoch() WHERE id = 1"
  ).run(filename);
  return getAdminSettings();
}

export function getLogoFilePath(): string | null {
  const settings = getAdminSettings();
  if (!settings.logoFilename) return null;

  const filePath = path.join(UPLOADS_DIR, settings.logoFilename);
  return fs.existsSync(filePath) ? filePath : null;
}

export function writeLogoFile(buffer: Buffer, extension: string): string {
  ensureUploadsDir();

  const current = getAdminSettings();
  if (current.logoFilename) {
    const oldPath = path.join(UPLOADS_DIR, current.logoFilename);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    removeCaptivePortalLogos();
  }

  const filename = `logo${extension}`;
  const uploadPath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(uploadPath, buffer);
  saveAdminLogo(filename);
  syncCaptivePortalLogo(filename);
  return filename;
}

export function listAdminUsers(): AdminUser[] {
  return (
    db
      .prepare(
        "SELECT id, username, display_name, role, allowed_line_ids, created_at FROM admin_users ORDER BY created_at DESC"
      )
      .all() as {
      id: number;
      username: string;
      display_name: string | null;
      role: UserRole;
      allowed_line_ids: string | null;
      created_at: number;
    }[]
  ).map((row) => mapAdminUserRow(row));
}

/** Agentes de Atención a Cliente (para asignar chats). */
export function listAtencionUsers(): AdminUser[] {
  return listAdminUsers().filter((u) => u.role === "atencion");
}

// v1 = legacy defaults (N=16384)
// v2 = OWASP-compliant (N=65536)
const SCRYPT_V2 = { N: 65536, r: 8, p: 1, maxmem: 256 * 1024 * 1024 } as const;

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64, SCRYPT_V2).toString("hex");
  return `v2:${salt}:${hash}`;
}

function mapAdminUserRow(row: {
  id: number;
  username: string;
  display_name: string | null;
  role: UserRole;
  allowed_line_ids?: string | null;
  created_at: number;
}): AdminUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: normalizeUserRole(row.role),
    allowedLineIds: parseAllowedLineIds(row.allowed_line_ids),
    createdAt: row.created_at,
  };
}

function countPrivilegedAdmins(): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) as total FROM admin_users WHERE role IN ('admin', 'super_admin')"
    )
    .get() as { total: number };
  return row.total;
}

function ensureSuperAdminExists(): void {
  const supers = db
    .prepare(
      "SELECT COUNT(*) as total FROM admin_users WHERE role = 'super_admin'"
    )
    .get() as { total: number };
  if (supers.total > 0) return;

  const firstAdmin = db
    .prepare(
      "SELECT id FROM admin_users WHERE role = 'admin' ORDER BY id ASC LIMIT 1"
    )
    .get() as { id: number } | undefined;
  if (firstAdmin) {
    db.prepare("UPDATE admin_users SET role = 'super_admin' WHERE id = ?").run(
      firstAdmin.id
    );
  }
}

export function getAdminUserById(id: number): AdminUser | null {
  const row = db
    .prepare(
      "SELECT id, username, display_name, role, allowed_line_ids, created_at FROM admin_users WHERE id = ?"
    )
    .get(id) as {
    id: number;
    username: string;
    display_name: string | null;
    role: UserRole;
    allowed_line_ids: string | null;
    created_at: number;
  } | undefined;

  return row ? mapAdminUserRow(row) : null;
}

export function updateAdminUser(id: number, input: AdminUserUpdate): AdminUser {
  const existing = db
    .prepare("SELECT id, role FROM admin_users WHERE id = ?")
    .get(id) as { id: number; role: UserRole } | undefined;

  if (!existing) {
    throw new Error("Usuario no encontrado");
  }

  const existingRole = normalizeUserRole(existing.role);
  const nextRole: UserRole =
    input.role !== undefined
      ? normalizeUserRole(input.role)
      : existingRole;

  if (
    isAdminOrAbove(existingRole) &&
    !isAdminOrAbove(nextRole) &&
    countPrivilegedAdmins() <= 1
  ) {
    throw new Error("Debe existir al menos un administrador");
  }

  if (input.password && input.password.length < 8) {
    throw new Error("La contraseña debe tener al menos 8 caracteres");
  }

  const fields: string[] = ["role = ?"];
  const values: (string | number | null)[] = [nextRole];

  if (input.displayName !== undefined) {
    fields.push("display_name = ?");
    values.push(
      input.displayName === null ? null : input.displayName.trim() || null
    );
  }

  const passwordChanged = !!input.password;
  if (passwordChanged) {
    fields.push("password_hash = ?");
    values.push(hashPassword(input.password!));
  }

  if (input.allowedLineIds !== undefined) {
    fields.push("allowed_line_ids = ?");
    values.push(serializeAllowedLineIds(input.allowedLineIds));
  }

  values.push(id);
  db.prepare(`UPDATE admin_users SET ${fields.join(", ")} WHERE id = ?`).run(
    ...values
  );

  if (passwordChanged) {
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
  }

  const updated = getAdminUserById(id);
  if (!updated) throw new Error("Usuario no encontrado");
  return updated;
}

export function createAdminUser(input: AdminUserInput): AdminUser {
  const username = input.username.trim().toLowerCase();
  const displayName = input.displayName?.trim() || null;
  const role: UserRole = normalizeUserRole(input.role ?? "atencion");

  if (!username || username.length < 3) {
    throw new Error("El usuario debe tener al menos 3 caracteres");
  }

  if (!input.password || input.password.length < 8) {
    throw new Error("La contraseña debe tener al menos 8 caracteres");
  }

  const allowedLineIdsJson = serializeAllowedLineIds(input.allowedLineIds);

  const result = db
    .prepare(
      "INSERT INTO admin_users (username, password_hash, display_name, role, allowed_line_ids) VALUES (?, ?, ?, ?, ?)"
    )
    .run(username, hashPassword(input.password), displayName, role, allowedLineIdsJson);

  const row = db
    .prepare(
      "SELECT id, username, display_name, role, allowed_line_ids, created_at FROM admin_users WHERE id = ?"
    )
    .get(result.lastInsertRowid) as {
    id: number;
    username: string;
    display_name: string | null;
    role: UserRole;
    allowed_line_ids: string | null;
    created_at: number;
  };

  return mapAdminUserRow(row);
}

/** Dummy hash work to reduce username enumeration via timing. */
function dummyPasswordCheck(password: string): void {
  try {
    scryptSync(password, "timing-pad-salt-v1", 64, SCRYPT_V2);
  } catch {
    /* ignore */
  }
}

export function setTotpTempSecret(userId: number, secret: string): void {
  db.prepare("UPDATE admin_users SET totp_temp_secret = ? WHERE id = ?").run(
    secret,
    userId
  );
}

export function clearTotpTempSecret(userId: number): void {
  db.prepare("UPDATE admin_users SET totp_temp_secret = NULL WHERE id = ?").run(
    userId
  );
}

export function enableTotpForUser(userId: number, secret: string): void {
  db.prepare(
    `UPDATE admin_users
     SET totp_secret = ?, totp_enabled = 1, totp_temp_secret = NULL
     WHERE id = ?`
  ).run(secret, userId);
}

export function getTotpSecrets(userId: number): {
  secret: string | null;
  tempSecret: string | null;
  enabled: boolean;
} {
  const row = db
    .prepare(
      "SELECT totp_secret, totp_temp_secret, totp_enabled FROM admin_users WHERE id = ?"
    )
    .get(userId) as
    | { totp_secret: string | null; totp_temp_secret: string | null; totp_enabled: number }
    | undefined;
  return {
    secret: row?.totp_secret ?? null,
    tempSecret: row?.totp_temp_secret ?? null,
    enabled: Boolean(row?.totp_enabled),
  };
}

export function setAdminOwnPassword(userId: number, password: string): void {
  if (password.length < 8 || password.length > 128) {
    throw new Error("La contraseña debe tener entre 8 y 128 caracteres");
  }
  const updated = db
    .prepare("UPDATE admin_users SET password_hash = ? WHERE id = ?")
    .run(hashPassword(password), userId);
  if (updated.changes !== 1) throw new Error("Usuario no encontrado");
}

export function verifyAdminPassword(
  username: string,
  password: string
): boolean {
  const normalized = username.trim().toLowerCase();
  const row = db
    .prepare("SELECT id, password_hash FROM admin_users WHERE username = ?")
    .get(normalized) as { id: number; password_hash: string } | undefined;

  if (!row) {
    dummyPasswordCheck(password);
    return false;
  }

  const stored = row.password_hash;
  let salt: string;
  let hash: string;
  let isLegacy = false;

  if (stored.startsWith("v2:")) {
    const parts = stored.slice(3).split(":");
    salt = parts[0];
    hash = parts[1];
  } else {
    // v1 legacy format: "salt:hash"
    const parts = stored.split(":");
    salt = parts[0];
    hash = parts[1];
    isLegacy = true;
  }

  if (!salt || !hash) return false;

  try {
    const params = isLegacy ? undefined : SCRYPT_V2;
    const candidate = scryptSync(password, salt, 64, params).toString("hex");
    const match = timingSafeEqual(
      Buffer.from(hash, "hex"),
      Buffer.from(candidate, "hex")
    );
    if (match && isLegacy) {
      // Transparently upgrade to v2 hash
      db.prepare("UPDATE admin_users SET password_hash = ? WHERE id = ?").run(
        hashPassword(password),
        row.id
      );
    }
    return match;
  } catch {
    return false;
  }
}

export function initAdminSettings(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      business_name TEXT NOT NULL DEFAULT 'ARC',
      logo_filename TEXT,
      timezone TEXT NOT NULL DEFAULT 'America/Mexico_City',
      business_hours TEXT NOT NULL,
      holidays TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      role TEXT NOT NULL DEFAULT 'atencion',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  if (!columnExists("admin_users", "role")) {
    db.exec(
      "ALTER TABLE admin_users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'"
    );
  }

  if (!columnExists("admin_users", "allowed_line_ids")) {
    db.exec("ALTER TABLE admin_users ADD COLUMN allowed_line_ids TEXT");
    const defaultLines = JSON.stringify(listWaLineIds());
    db.prepare(
      "UPDATE admin_users SET allowed_line_ids = ? WHERE allowed_line_ids IS NULL OR allowed_line_ids = ''"
    ).run(defaultLines);
  }

  if (!columnExists("admin_users", "totp_secret")) {
    db.exec("ALTER TABLE admin_users ADD COLUMN totp_secret TEXT");
  }
  if (!columnExists("admin_users", "totp_enabled")) {
    db.exec(
      "ALTER TABLE admin_users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0"
    );
  }
  if (!columnExists("admin_users", "totp_temp_secret")) {
    db.exec("ALTER TABLE admin_users ADD COLUMN totp_temp_secret TEXT");
  }
  if (!columnExists("admin_users", "email")) {
    db.exec("ALTER TABLE admin_users ADD COLUMN email TEXT");
  }
  if (!columnExists("admin_users", "job_title")) {
    db.exec("ALTER TABLE admin_users ADD COLUMN job_title TEXT");
  }
  if (!columnExists("admin_users", "signature_filename")) {
    db.exec("ALTER TABLE admin_users ADD COLUMN signature_filename TEXT");
  }

  ensureSuperAdminExists();

  if (!columnExists("admin_settings", "chat_colors")) {
    db.exec(
      `ALTER TABLE admin_settings ADD COLUMN chat_colors TEXT NOT NULL DEFAULT '${JSON.stringify(DEFAULT_CHAT_COLORS)}'`
    );
  }

  if (!columnExists("admin_settings", "inactivity_farewell_message")) {
    db.exec("ALTER TABLE admin_settings ADD COLUMN inactivity_farewell_message TEXT");
  }

  if (!columnExists("admin_settings", "inactivity_auto_close_enabled")) {
    db.exec(
      "ALTER TABLE admin_settings ADD COLUMN inactivity_auto_close_enabled INTEGER NOT NULL DEFAULT 0"
    );
  }

  ensureCaptivePortalLogoSynced();

  ensureUploadsDir();

  const existing = db
    .prepare("SELECT id FROM admin_settings WHERE id = 1")
    .get();

  if (!existing) {
    db.prepare(
      `INSERT INTO admin_settings (id, business_name, business_hours, holidays)
       VALUES (1, ?, ?, '[]')`
    ).run("ARC", JSON.stringify(DEFAULT_BUSINESS_HOURS));
  }
}

initAdminSettings();
