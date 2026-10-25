import type { SessionUser, UserRole } from "./admin-settings-types";

export type Permission =
  | "delete_conversation"
  | "assign_chat_to_others"
  | "manage_tags"
  | "manage_appearance"
  | "manage_users"
  | "advanced_admin"
  | "residentes"
  | "all_lines"
  | "crm_prospectos"
  | "crm_catalog"
  | "crm_quotes"
  | "crm_pipelines"
  | "crm_write";

const CRM_READ: Permission[] = [
  "crm_prospectos",
  "crm_catalog",
  "crm_quotes",
  "crm_pipelines",
];

const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  super_admin: new Set([
    "delete_conversation",
    "assign_chat_to_others",
    "manage_tags",
    "manage_appearance",
    "manage_users",
    "advanced_admin",
    "residentes",
    "all_lines",
    ...CRM_READ,
    "crm_write",
  ]),
  admin: new Set([
    "assign_chat_to_others",
    "manage_tags",
    "manage_appearance",
    "manage_users",
    "advanced_admin",
    "residentes",
    "all_lines",
    ...CRM_READ,
    "crm_write",
  ]),
  atencion: new Set(["residentes", ...CRM_READ]),
};

export function normalizeUserRole(role: string | null | undefined): UserRole {
  if (role === "super_admin" || role === "admin" || role === "atencion") {
    return role;
  }
  return "atencion";
}

export function isAdminOrAbove(role: UserRole): boolean {
  return role === "super_admin" || role === "admin";
}

export function isSuperAdmin(role: UserRole): boolean {
  return role === "super_admin";
}

export function can(user: Pick<SessionUser, "role">, permission: Permission): boolean {
  return ROLE_PERMISSIONS[user.role]?.has(permission) ?? false;
}

export function canManageRole(
  actorRole: UserRole,
  targetRole: UserRole
): boolean {
  if (actorRole === "super_admin") return true;
  if (actorRole === "admin") {
    return targetRole === "admin" || targetRole === "atencion";
  }
  return false;
}
