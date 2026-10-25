export type WeekdayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface DaySchedule {
  enabled: boolean;
  open: string;
  close: string;
}

export type UserRole = "super_admin" | "admin" | "atencion";

export interface ChatColors {
  assistant: string;
  human: string;
  user: string;
}

export interface AdminSettings {
  businessName: string;
  logoFilename: string | null;
  logoUrl: string | null;
  timezone: string;
  businessHours: Record<WeekdayKey, DaySchedule>;
  holidays: string[];
  chatColors: ChatColors;
  welcomeMessage: string;
  menuEnabled: boolean;
  urgencyKeywords: string[];
  inactivityFarewellMessage: string;
  /** Si está apagado, no se cierra la conversación ni se envía el mensaje a los 30 min. */
  inactivityAutoCloseEnabled: boolean;
}

export interface SessionUser {
  id: number;
  username: string;
  displayName: string | null;
  role: UserRole;
  /** null = todas las líneas (admin) */
  allowedLineIds: number[] | null;
  totpEnabled?: boolean;
  /** Módulos prendidos para este perfil. Si falta, se tratan todos como prendidos. */
  enabledModules?: string[];
}

export interface AdminUser {
  id: number;
  username: string;
  displayName: string | null;
  role: UserRole;
  allowedLineIds: number[];
  createdAt: number;
}

export interface AdminUserInput {
  username: string;
  password: string;
  displayName?: string;
  role?: UserRole;
  allowedLineIds: number[];
}

export interface AdminUserUpdate {
  displayName?: string | null;
  role?: UserRole;
  password?: string;
  allowedLineIds?: number[];
}

export const DEFAULT_CHAT_COLORS: ChatColors = {
  assistant: "#3b82f6",
  human: "#77bd1e",
  user: "#eab308",
};

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  atencion: "Atención a Cliente",
};

export const USER_ROLES: UserRole[] = ["super_admin", "admin", "atencion"];

export const WEEKDAY_KEYS: WeekdayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  monday: "Lunes",
  tuesday: "Martes",
  wednesday: "Miércoles",
  thursday: "Jueves",
  friday: "Viernes",
  saturday: "Sábado",
  sunday: "Domingo",
};

export const DEFAULT_BUSINESS_HOURS: Record<WeekdayKey, DaySchedule> = {
  monday: { enabled: true, open: "09:00", close: "18:00" },
  tuesday: { enabled: true, open: "09:00", close: "18:00" },
  wednesday: { enabled: true, open: "09:00", close: "18:00" },
  thursday: { enabled: true, open: "09:00", close: "18:00" },
  friday: { enabled: true, open: "09:00", close: "18:00" },
  saturday: { enabled: true, open: "10:00", close: "13:00" },
  sunday: { enabled: false, open: "09:00", close: "18:00" },
};
