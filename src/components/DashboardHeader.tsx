"use client";

import type { SessionUser } from "@/lib/admin-settings-types";
import { ROLE_LABELS } from "@/lib/admin-settings-types";
import { can, isAdminOrAbove } from "@/lib/permissions";
import { getLineChipClass, getLineStatusDotClass } from "@/lib/line-colors";
import type { WaLineStatus } from "./LineSetupScreen";

type DashboardView =
  | "chats"
  | "metrics"
  | "residentes"
  | "tickets"
  | "finanzas";

interface DashboardHeaderProps {
  lines: WaLineStatus[];
  businessName: string;
  user: SessionUser;
  onLogout: () => void;
  onOpenAdmin?: () => void;
  activeView?: DashboardView;
  onViewChange?: (view: DashboardView) => void;
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19h16M7 16V9m5 7V5m5 11v-3" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5M6 19l-2 2V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6z" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function TicketIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1a2 2 0 0 0 0 6v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-6V8Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 6v12" strokeDasharray="2 2" />
    </svg>
  );
}

function MoneyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12h.01M18 12h.01" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
      />
    </svg>
  );
}

function NavIconButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`rounded-lg border p-2 transition-colors ${
        active
          ? "bg-slate-900 text-white border-slate-900"
          : "border-slate-200 text-slate-600 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

export function DashboardHeader({
  lines,
  businessName,
  user,
  onLogout,
  onOpenAdmin,
  activeView = "chats",
  onViewChange,
}: DashboardHeaderProps) {
  const displayLabel = user.displayName || user.username;

  return (
    <header className="flex items-center justify-between gap-2 px-3 sm:px-6 py-2 sm:py-3 bg-white border-b border-slate-200 shadow-sm shrink-0">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 flex-wrap">
        <h1 className="text-base sm:text-lg font-semibold text-slate-900 truncate shrink-0">
          {businessName}
        </h1>
        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
          {lines.map((line) => {
            const connected = line.status === "connected";
            return (
              <span
                key={line.id}
                className={`inline-flex items-center gap-1 rounded-full border px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-medium ${getLineChipClass(line.id)}`}
                title={connected ? `${line.name} conectada` : `${line.name} desconectada`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${getLineStatusDotClass(line.id, connected)}`}
                  aria-hidden="true"
                />
                <span className="truncate max-w-[5.5rem] sm:max-w-none">{line.name}</span>
                {line.phone && (
                  <span className="font-mono opacity-75 hidden sm:inline">+{line.phone}</span>
                )}
              </span>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {onViewChange && (
          <>
            <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50/80 p-0.5">
              <NavIconButton
                active={activeView === "chats"}
                onClick={() => onViewChange("chats")}
                title="Chat"
              >
                <ChatIcon />
              </NavIconButton>
              <NavIconButton
                active={activeView === "residentes"}
                onClick={() => onViewChange("residentes")}
                title="Residentes"
              >
                <PeopleIcon />
              </NavIconButton>
              <NavIconButton
                active={activeView === "tickets"}
                onClick={() => onViewChange("tickets")}
                title="Tickets"
              >
                <TicketIcon />
              </NavIconButton>
            </div>
            {isAdminOrAbove(user.role) && (
              <NavIconButton
                active={activeView === "finanzas"}
                onClick={() => onViewChange("finanzas")}
                title="Finanzas"
              >
                <MoneyIcon />
              </NavIconButton>
            )}
            {isAdminOrAbove(user.role) && (
              <NavIconButton
                active={activeView === "metrics"}
                onClick={() => onViewChange("metrics")}
                title="Métricas"
              >
                <ChartIcon />
              </NavIconButton>
            )}
          </>
        )}

        {can(user, "advanced_admin") && onOpenAdmin && (
          <NavIconButton
            active={false}
            onClick={onOpenAdmin}
            title="Admin"
          >
            <GearIcon />
          </NavIconButton>
        )}

        <div className="hidden sm:block text-right px-1 max-w-[9rem] md:max-w-none">
          <p className="text-sm font-medium text-slate-800 truncate" title={displayLabel}>
            {displayLabel}
          </p>
          <p className="text-xs text-slate-500 truncate">{ROLE_LABELS[user.role]}</p>
        </div>

        <span
          className="sm:hidden text-xs font-medium text-slate-600 max-w-[4.5rem] truncate px-0.5"
          title={displayLabel}
        >
          {displayLabel}
        </span>

        <button
          onClick={onLogout}
          className="text-sm text-slate-500 hover:text-slate-800 font-medium px-2 sm:px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
        >
          Salir
        </button>
      </div>
    </header>
  );
}
