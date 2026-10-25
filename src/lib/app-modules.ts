import db from "./db";
import type { UserRole } from "./admin-settings-types";

/** Perfiles que aparecen en Administración → Módulos. */
export const MODULE_ROLES = ["super_admin", "admin"] as const;
export type ModuleRole = (typeof MODULE_ROLES)[number];

export const APP_MODULES = [
  { key: "chats", label: "Chat" },
  { key: "residentes", label: "Clientes / Residentes" },
  { key: "productos", label: "Servicios" },
  { key: "cotizaciones", label: "Cotizaciones" },
  { key: "embudos", label: "Embudos" },
  { key: "tickets", label: "Tickets" },
  { key: "finanzas", label: "Finanzas" },
  { key: "metrics", label: "Métricas" },
  { key: "admin", label: "Administración" },
] as const;

export type AppModuleKey = (typeof APP_MODULES)[number]["key"];

const MODULE_KEYS = new Set<string>(APP_MODULES.map((mod) => mod.key));

/** El super admin no puede apagarse Administración: es la única puerta a este panel. */
export const LOCKED_ON: ReadonlyArray<{ role: ModuleRole; module: AppModuleKey }> = [
  { role: "super_admin", module: "admin" },
];

function ensureTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS role_module_access (
      role TEXT NOT NULL,
      module_key TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (role, module_key)
    )
  `);
}

export function isModuleRole(value: string): value is ModuleRole {
  return (MODULE_ROLES as readonly string[]).includes(value);
}

export function isAppModuleKey(value: string): value is AppModuleKey {
  return MODULE_KEYS.has(value);
}

export function isModuleLockedOn(role: ModuleRole, module: AppModuleKey): boolean {
  return LOCKED_ON.some((item) => item.role === role && item.module === module);
}

/** Falta de fila = prendido, para no ocultar el panel el día que se activa. */
export function isModuleEnabled(role: UserRole, module: AppModuleKey): boolean {
  if (role === "super_admin" && module === "admin") return true;
  if (role !== "super_admin" && role !== "admin") return true;
  ensureTable();
  const row = db
    .prepare(
      `SELECT enabled FROM role_module_access WHERE role = ? AND module_key = ?`
    )
    .get(role, module) as { enabled: number } | undefined;
  if (!row) return true;
  return row.enabled === 1;
}

export function listEnabledModules(role: UserRole): AppModuleKey[] {
  return APP_MODULES.map((mod) => mod.key).filter((key) =>
    isModuleEnabled(role, key)
  );
}

export function listModuleMatrix(): Array<{
  key: AppModuleKey;
  label: string;
  super_admin: boolean;
  admin: boolean;
  lockedForSuperAdmin: boolean;
}> {
  return APP_MODULES.map((mod) => ({
    key: mod.key,
    label: mod.label,
    super_admin: isModuleEnabled("super_admin", mod.key),
    admin: isModuleEnabled("admin", mod.key),
    lockedForSuperAdmin: isModuleLockedOn("super_admin", mod.key),
  }));
}

export function setModuleEnabled(
  role: ModuleRole,
  module: AppModuleKey,
  enabled: boolean
): void {
  if (!enabled && isModuleLockedOn(role, module)) {
    throw new Error("Este módulo no se puede apagar para el super admin");
  }
  ensureTable();
  db.prepare(
    `INSERT INTO role_module_access (role, module_key, enabled)
     VALUES (?, ?, ?)
     ON CONFLICT(role, module_key) DO UPDATE SET enabled = excluded.enabled`
  ).run(role, module, enabled ? 1 : 0);
}
