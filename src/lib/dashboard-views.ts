import type { UserRole } from "./admin-settings-types";

export type DashboardView =
  | "chats"
  | "metrics"
  | "residentes"
  | "prospectos"
  | "productos"
  | "cotizaciones"
  | "embudos"
  | "tickets"
  | "finanzas";

export const DASHBOARD_VIEWS: DashboardView[] = [
  "chats",
  "metrics",
  "residentes",
  "prospectos",
  "productos",
  "cotizaciones",
  "embudos",
  "tickets",
  "finanzas",
];

export const ACTIVE_VIEW_STORAGE_KEY = "arc-active-view";

/** El perfil Atención no se configura aquí y conserva el menú que ya tenía. */
export function isDashboardModuleVisible(
  role: UserRole,
  enabledModules: string[] | undefined,
  key: string
): boolean {
  if (role !== "super_admin" && role !== "admin") return true;
  if (role === "super_admin" && key === "admin") return true;
  if (!enabledModules) return true;
  return enabledModules.includes(key);
}
