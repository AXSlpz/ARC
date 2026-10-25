"use client";

import { useEffect, useRef, useState } from "react";
import { AdminNotificationBell } from "@/components/admin/AdminNotificationBell";
import { AdminProfileDialog } from "@/components/admin/AdminProfileDialog";
import type { SessionUser } from "@/lib/admin-settings-types";
import { ROLE_LABELS } from "@/lib/admin-settings-types";
import type { DashboardView } from "@/lib/dashboard-views";
import { isDashboardModuleVisible } from "@/lib/dashboard-views";
import { can, isAdminOrAbove } from "@/lib/permissions";
import { getLineChipClass, getLineStatusDotClass } from "@/lib/line-colors";
import type { WaLineStatus } from "./LineSetupScreen";

interface DashboardHeaderProps {
  lines: WaLineStatus[];
  businessName: string;
  user: SessionUser;
  onLogout: () => void;
  onRefreshUser?: () => void;
  onOpenAdmin?: () => void;
  activeView?: DashboardView;
  onViewChange?: (view: DashboardView) => void;
  onOpenTicket?: (ticketId: number) => void;
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

function ProductIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.3 7 12 12l8.7-5M12 22V12" />
    </svg>
  );
}

function QuoteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v6h6M8 13h8M8 17h5" />
    </svg>
  );
}

function PipelineIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
      <rect x="3" y="4" width="5" height="16" rx="1" />
      <rect x="10" y="4" width="5" height="16" rx="1" />
      <rect x="17" y="4" width="4" height="16" rx="1" />
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
      aria-pressed={active}
      className={`relative z-10 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-[transform,background-color,color,box-shadow] duration-100 ease-out motion-reduce:transition-none ${
        active
          ? "bg-white text-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)]"
          : "text-slate-500 hover:bg-black/[0.05] hover:text-slate-900"
      } active:scale-[0.97] motion-reduce:active:scale-100`}
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
  onRefreshUser,
  onOpenAdmin,
  activeView = "chats",
  onViewChange,
  onOpenTicket,
}: DashboardHeaderProps) {
  const displayLabel = user.displayName || user.username;
  const [profileOpen, setProfileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const moduleOn = (key: string) =>
    isDashboardModuleVisible(user.role, user.enabledModules, key);
  const showFinanzas = isAdminOrAbove(user.role) && moduleOn("finanzas");
  const showMetrics = isAdminOrAbove(user.role) && moduleOn("metrics");
  const showAdminGear = Boolean(
    can(user, "advanced_admin") && onOpenAdmin && moduleOn("admin")
  );
  const showAdminCluster = showFinanzas || showMetrics || showAdminGear;

  useEffect(() => {
    if (!accountOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [accountOpen]);

  return (
    <header className="relative z-30 flex shrink-0 items-center gap-2 border-b border-black/[0.06] bg-white/70 px-3 py-2 shadow-[0_1px_0_rgba(255,255,255,0.6)_inset] backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-white/55 sm:px-6 sm:py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden sm:gap-3">
        <h1 className="shrink-0 truncate text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
          {businessName}
        </h1>
        <div className="flex min-w-0 flex-wrap items-center gap-1 sm:gap-1.5">
          {lines.map((line) => {
            const connected = line.status === "connected";
            return (
              <span
                key={line.id}
                className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium sm:px-2 sm:text-xs ${getLineChipClass(line.id)}`}
                title={connected ? `${line.name} conectada` : `${line.name} desconectada`}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${getLineStatusDotClass(line.id, connected)}`}
                  aria-hidden="true"
                />
                <span className="max-w-[5.5rem] truncate sm:max-w-none">{line.name}</span>
                {line.phone ? (
                  <span className="hidden font-mono opacity-75 sm:inline">+{line.phone}</span>
                ) : null}
              </span>
            );
          })}
        </div>
      </div>

      <nav className="relative z-10 shrink-0" aria-label="Módulos">
        {onViewChange ? (
          <div className="flex items-center gap-0.5 rounded-full bg-black/[0.045] p-1">
            {moduleOn("chats") ? (
            <NavIconButton
              active={activeView === "chats"}
              onClick={() => onViewChange("chats")}
              title="Chat"
            >
              <ChatIcon />
            </NavIconButton>
            ) : null}
            {moduleOn("residentes") ? (
            <NavIconButton
              active={activeView === "residentes"}
              onClick={() => onViewChange("residentes")}
              title="Clientes / Residentes"
            >
              <PeopleIcon />
            </NavIconButton>
            ) : null}
            {can(user, "crm_catalog") && moduleOn("productos") ? (
              <NavIconButton
                active={activeView === "productos"}
                onClick={() => onViewChange("productos")}
                title="Servicios"
              >
                <ProductIcon />
              </NavIconButton>
            ) : null}
            {can(user, "crm_quotes") && moduleOn("cotizaciones") ? (
              <NavIconButton
                active={activeView === "cotizaciones"}
                onClick={() => onViewChange("cotizaciones")}
                title="Cotizaciones"
              >
                <QuoteIcon />
              </NavIconButton>
            ) : null}
            {can(user, "crm_pipelines") && moduleOn("embudos") ? (
              <NavIconButton
                active={activeView === "embudos"}
                onClick={() => onViewChange("embudos")}
                title="Embudos"
              >
                <PipelineIcon />
              </NavIconButton>
            ) : null}
            {moduleOn("tickets") ? (
            <NavIconButton
              active={activeView === "tickets"}
              onClick={() => onViewChange("tickets")}
              title="Tickets"
            >
              <TicketIcon />
            </NavIconButton>
            ) : null}
            {showAdminCluster ? (
              <span className="mx-0.5 h-4 w-px shrink-0 bg-black/10" aria-hidden="true" />
            ) : null}
            {showFinanzas ? (
              <NavIconButton
                active={activeView === "finanzas"}
                onClick={() => onViewChange("finanzas")}
                title="Finanzas"
              >
                <MoneyIcon />
              </NavIconButton>
            ) : null}
            {showMetrics ? (
              <NavIconButton
                active={activeView === "metrics"}
                onClick={() => onViewChange("metrics")}
                title="Métricas"
              >
                <ChartIcon />
              </NavIconButton>
            ) : null}
            {showAdminGear ? (
              <NavIconButton active={false} onClick={() => onOpenAdmin?.()} title="Admin">
                <GearIcon />
              </NavIconButton>
            ) : null}
          </div>
        ) : null}
      </nav>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-1 sm:gap-1.5">
        {isAdminOrAbove(user.role) && onOpenTicket ? (
          <AdminNotificationBell onOpenTicket={onOpenTicket} />
        ) : null}
        <div ref={accountRef} className="relative min-w-0">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            onClick={() => setAccountOpen((open) => !open)}
            className="min-w-0 rounded-xl px-1.5 py-1 text-right transition hover:bg-black/[0.05] sm:px-2"
            title="Cuenta"
          >
            <p className="max-w-[7.5rem] truncate text-sm font-medium tracking-tight text-slate-800 sm:max-w-[9rem] md:max-w-none">
              {displayLabel}
            </p>
            <p className="hidden truncate text-xs text-slate-500 sm:block">
              {ROLE_LABELS[user.role]}
            </p>
          </button>
          {accountOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-1.5 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAccountOpen(false);
                  setProfileOpen(true);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
              >
                Editar perfil
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAccountOpen(false);
                  setConfirmLogout(true);
                }}
                className="block w-full px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Cerrar sesión
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {profileOpen ? (
        <AdminProfileDialog
          onClose={() => setProfileOpen(false)}
          onSaved={() => onRefreshUser?.()}
        />
      ) : null}
      {confirmLogout ? (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/40"
            aria-label="Cancelar"
            onClick={() => setConfirmLogout(false)}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-logout-title"
            className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
          >
            <h2 id="confirm-logout-title" className="text-base font-semibold text-slate-900">
              Cerrar sesión
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              ¿Confirmas que quieres cerrar sesión?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmLogout(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmLogout(false);
                  onLogout();
                }}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
