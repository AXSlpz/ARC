"use client";

import { Component, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { LineSetupScreen, type WaLineStatus } from "./LineSetupScreen";
import { LoginScreen } from "./LoginScreen";
import { DashboardHeader } from "./DashboardHeader";
import { ConversationList } from "./ConversationList";
import { ConversationPanel } from "./ConversationPanel";
import type {
  AdminSettings,
  ChatColors,
  SessionUser,
} from "@/lib/admin-settings-types";
import { DEFAULT_CHAT_COLORS } from "@/lib/admin-settings-types";
import { useDashboardSocket } from "@/hooks/useDashboardSocket";
import { useConversationNotifications } from "@/hooks/useConversationNotifications";
import { useReadConversations } from "@/hooks/useReadConversations";
import { usePwaPeriodicRefresh } from "@/hooks/usePwaPeriodicRefresh";
import type { DashboardView } from "@/lib/dashboard-views";
import { ACTIVE_VIEW_STORAGE_KEY, DASHBOARD_VIEWS, isDashboardModuleVisible } from "@/lib/dashboard-views";
import { NotificationPermissionBanner } from "./NotificationControls";
import { can, isAdminOrAbove } from "@/lib/permissions";

const VIEW_FALLBACK: DashboardView[] = [
  "chats",
  "residentes",
  "productos",
  "cotizaciones",
  "embudos",
  "tickets",
  "finanzas",
  "metrics",
];

function viewAllowed(user: SessionUser, view: DashboardView): boolean {
  if (!isDashboardModuleVisible(user.role, user.enabledModules, view)) return false;
  if (view === "productos") return can(user, "crm_catalog");
  if (view === "cotizaciones") return can(user, "crm_quotes");
  if (view === "embudos") return can(user, "crm_pipelines");
  if (view === "finanzas" || view === "metrics") return isAdminOrAbove(user.role);
  if (view === "prospectos") return false;
  return true;
}

class DashboardViewBoundary extends Component<
  { resetKey: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm text-slate-600">
          Este módulo no pudo abrirse. Elige otro menú de arriba.
        </div>
      );
    }
    return this.props.children;
  }
}

function ViewChunkFallback() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-sm text-gray-500">
      Cargando módulo…
    </div>
  );
}

const AdminPanel = dynamic(
  () => import("./AdminPanel").then((m) => ({ default: m.AdminPanel })),
  { ssr: false },
);
const ResidentesView = dynamic(
  () =>
    import("./residentes/ResidentesView").then((m) => ({
      default: m.ResidentesView,
    })),
  { ssr: false, loading: () => <ViewChunkFallback /> },
);
const ProductosView = dynamic(
  () => import("./crm/ProductosView").then((m) => ({ default: m.ProductosView })),
  { ssr: false, loading: () => <ViewChunkFallback /> },
);
const CotizacionesView = dynamic(
  () =>
    import("./crm/CotizacionesView").then((m) => ({
      default: m.CotizacionesView,
    })),
  { ssr: false, loading: () => <ViewChunkFallback /> },
);
const EmbudosView = dynamic(
  () => import("./crm/EmbudosView").then((m) => ({ default: m.EmbudosView })),
  { ssr: false, loading: () => <ViewChunkFallback /> },
);
const TicketsAdminView = dynamic(
  () =>
    import("./tickets/TicketsAdminView").then((m) => ({
      default: m.TicketsAdminView,
    })),
  { ssr: false, loading: () => <ViewChunkFallback /> },
);
const FinanceView = dynamic(
  () => import("./finance/FinanceView").then((m) => ({ default: m.FinanceView })),
  { ssr: false, loading: () => <ViewChunkFallback /> },
);
const MetricsDashboard = dynamic(
  () =>
    import("./MetricsDashboard").then((m) => ({
      default: m.MetricsDashboard,
    })),
  { ssr: false, loading: () => <ViewChunkFallback /> },
);

interface Conversation {
  id: number;
  line_id: number;
  line_name: string;
  phone: string;
  name: string | null;
  mode: "AI" | "HUMAN";
  priority?: string;
  category?: string | null;
  awaiting_handoff?: number;
  human_requested?: number;
  assigned_to_user_id?: number | null;
  assigned_to_name?: string | null;
  handoff_summary?: string | null;
  sla_breached?: number;
  closed_at?: number | null;
  tags?: { id: number; name: string; color: string }[];
  last_message_at: number | null;
  last_message_preview: string | null;
  last_message_role?: string | null;
  residente_num_coto?: string | null;
  residente_num_vivienda?: number | null;
  residente_condominio?: string | null;
  residente_nombre?: string | null;
  residente_properties?: Array<{
    id: number;
    condominio: string;
    num_vivienda: number | null;
    num_coto: string | null;
  }>;
  sender_name?: string | null;
}

function readStoredActiveView(): DashboardView {
  if (typeof window === "undefined") return "chats";
  try {
    const stored = sessionStorage.getItem(ACTIVE_VIEW_STORAGE_KEY);
    if (stored === "prospectos") {
      try {
        sessionStorage.setItem("residentes-tab", "prospectos");
      } catch {
        /* ignore */
      }
      return "residentes";
    }
    if (stored && (DASHBOARD_VIEWS as string[]).includes(stored)) {
      return stored as DashboardView;
    }
  } catch {
    /* sessionStorage puede fallar en modo privado */
  }
  return "chats";
}

export function ConnectionGate({
  initialUser,
}: {
  initialUser: SessionUser | null;
}) {
  const [user, setUser] = useState<SessionUser | null>(initialUser);
  const [lines, setLines] = useState<WaLineStatus[]>([]);
  const [connectedCount, setConnectedCount] = useState(0);
  const [panelEntered, setPanelEntered] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [lineFilter, setLineFilter] = useState<number | "all">("all");
  const [elapsed, setElapsed] = useState(0);
  const [adminOpen, setAdminOpen] = useState(false);
  const [activeView, setActiveView] = useState<DashboardView>("chats");
  const [viewRestored, setViewRestored] = useState(false);
  const [metricsRefreshKey, setMetricsRefreshKey] = useState(0);
  const [ticketRefreshKey, setTicketRefreshKey] = useState(0);
  const [focusTicketId, setFocusTicketId] = useState<number | null>(null);
  const [ticketPopups, setTicketPopups] = useState<
    Array<{ id: number; ticketId: number; folio: string; message: string }>
  >([]);
  const [adminSettings, setAdminSettings] = useState<{
    businessName: string;
    logoUrl: string | null;
    chatColors: ChatColors;
  }>({
    businessName: "ARC",
    logoUrl: null,
    chatColors: DEFAULT_CHAT_COLORS,
  });
  const { markRead, isUnread } = useReadConversations();

  const checkSession = useCallback(async () => {
    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), 8000);
    try {
      const res = await fetch("/api/auth/me", {
        signal: ac.signal,
        cache: "no-store",
        credentials: "same-origin",
      });
      if (res.ok) {
        const data = (await res.json()) as { user?: SessionUser };
        setUser(data.user ?? null);
      } else if (res.status === 401) {
        setUser(null);
      }
    } catch {
      /* Conserva initialUser: un compile lento no debe vaciar la sesión. */
    } finally {
      window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    setUser(initialUser);
  }, [initialUser]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    const onChange = () => {
      void checkSession();
    };
    window.addEventListener("arc-modules-changed", onChange);
    return () => window.removeEventListener("arc-modules-changed", onChange);
  }, [checkSession]);

  useEffect(() => {
    setActiveView(readStoredActiveView());
    setViewRestored(true);
  }, []);

  useEffect(() => {
    if (!viewRestored) return;
    try {
      sessionStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, activeView);
    } catch {
      /* ignore */
    }
  }, [activeView, viewRestored]);

  const fetchAdminSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings");
      if (res.ok) {
        const data = (await res.json()) as AdminSettings;
        setAdminSettings({
          businessName: data.businessName,
          logoUrl: data.logoUrl,
          chatColors: data.chatColors ?? DEFAULT_CHAT_COLORS,
        });
      }
    } catch {}
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/connection/status");
      if (res.ok) {
        const data = await res.json();
        setLines(data.lines ?? []);
        setConnectedCount(data.connectedCount ?? 0);
      } else if (res.status === 401) {
        setUser(null);
      }
    } catch {}
  }, []);

  const fetchConversations = useCallback(async () => {
    try {
      const query =
        lineFilter === "all" ? "" : `?lineId=${lineFilter}`;
      const res = await fetch(`/api/conversations${query}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch {}
  }, [lineFilter]);

  const botIsAlive = lines.some(
    (line) =>
      line.status === "qr" ||
      line.status === "connecting" ||
      line.status === "connected"
  );

  const isAdminUser = user ? isAdminOrAbove(user.role) : false;
  const shownView = useMemo(() => {
    if (!user) return activeView;
    if (viewAllowed(user, activeView)) return activeView;
    return VIEW_FALLBACK.find((view) => viewAllowed(user, view)) ?? activeView;
  }, [user, activeView]);

  useEffect(() => {
    if (!viewRestored || !user) return;
    if (shownView !== activeView) setActiveView(shownView);
  }, [shownView, activeView, viewRestored, user]);
  const canAdvancedAdmin = user ? can(user, "advanced_admin") : false;
  const canUsePanel =
    isAdminUser || (connectedCount >= 1 && panelEntered);

  const visibleLines = useMemo(() => {
    if (!user || isAdminOrAbove(user.role) || user.allowedLineIds === null) {
      return lines;
    }
    return lines.filter((line) => user.allowedLineIds!.includes(line.id));
  }, [lines, user]);

  useEffect(() => {
    if (lineFilter === "all") return;
    if (!visibleLines.some((line) => line.id === lineFilter)) {
      setLineFilter("all");
    }
  }, [lineFilter, visibleLines]);

  const softSync = useCallback(() => {
    fetchConversations();
    fetchStatus();
    fetchAdminSettings();
  }, [fetchConversations, fetchStatus, fetchAdminSettings]);

  usePwaPeriodicRefresh(!!user && canUsePanel, softSync);

  useConversationNotifications(conversations, {
    enabled: !!user && canUsePanel,
    selectedId,
    businessName: adminSettings.businessName,
    chatsVisible: activeView === "chats",
  });

  useEffect(() => {
    if (!user || !canUsePanel) return;

    const openConversation = (conversationId: number) => {
      setActiveView("chats");
      setSelectedId(conversationId);
    };

    const onCustomEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ conversationId?: number }>).detail;
      if (detail?.conversationId != null) {
        openConversation(detail.conversationId);
      }
    };

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "wa:open-conversation") {
        const id = event.data.conversationId;
        if (typeof id === "number") openConversation(id);
      }
    };

    window.addEventListener("wa:open-conversation", onCustomEvent);
    navigator.serviceWorker?.addEventListener("message", onMessage);

    const params = new URLSearchParams(window.location.search);
    const chatParam = params.get("chat");
    if (chatParam) {
      const id = parseInt(chatParam, 10);
      if (!isNaN(id)) openConversation(id);
      params.delete("chat");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
      window.history.replaceState({}, "", next);
    }

    return () => {
      window.removeEventListener("wa:open-conversation", onCustomEvent);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [user, canUsePanel]);

  useDashboardSocket(!!user && (canUsePanel || connectedCount >= 1), (event, data) => {
    if (event === "conversations" || event === "messages") {
      fetchConversations();
      setMetricsRefreshKey((k) => k + 1);
    }
    if (event === "connection") fetchStatus();
    if (event === "metrics") setMetricsRefreshKey((k) => k + 1);
    if (event === "ticket") {
      setTicketRefreshKey((k) => k + 1);
      if (data && data.actor === "client") {
        const kind = typeof data.kind === "string" ? data.kind : "";
        const folio = String(data.folio ?? "");
        const ticketId = Number(data.ticketId);
        const message =
          kind === "created"
            ? data.category === "servicio"
              ? "Nuevo servicio solicitado"
              : "Nueva solicitud creada"
            : kind === "attachment"
              ? "El cliente adjuntó un archivo"
              : "El cliente agregó un comentario";
        if (kind === "created") {
          window.dispatchEvent(new CustomEvent("arc-admin-notice"));
        }
        const pid = Date.now() + Math.random();
        setTicketPopups((prev) => [
          ...prev.slice(-4),
          { id: pid, ticketId, folio, message },
        ]);
        setTimeout(
          () => setTicketPopups((prev) => prev.filter((p) => p.id !== pid)),
          10_000
        );
      }
    }
  });

  const openTicketFromPopup = (popupId: number, ticketId: number) => {
    setTicketPopups((prev) => prev.filter((p) => p.id !== popupId));
    setActiveView("tickets");
    setFocusTicketId(ticketId);
  };

  useEffect(() => {
    if (selectedId === null) return;
    if (!conversations.some((c) => c.id === selectedId)) {
      setSelectedId(null);
    }
  }, [conversations, selectedId]);

  useEffect(() => {
    if (!user) return;

    fetchStatus();
    const interval = setInterval(fetchStatus, 5_000);
    return () => clearInterval(interval);
  }, [user, fetchStatus]);

  useEffect(() => {
    if (!user || isAdminOrAbove(user.role)) return;
    if (connectedCount >= 1 && !panelEntered) {
      setPanelEntered(true);
    }
  }, [user, connectedCount, panelEntered]);

  useEffect(() => {
    if (!user || !canUsePanel) return;

    fetchAdminSettings();
    fetchConversations();
  }, [user, canUsePanel, fetchConversations, fetchAdminSettings]);

  useEffect(() => {
    if (!user || connectedCount > 0 || botIsAlive) {
      setElapsed(0);
      return;
    }

    const start = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [user, connectedCount, botIsAlive]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    setUser(null);
    setLines([]);
    setConnectedCount(0);
    setPanelEntered(false);
    setConversations([]);
    setSelectedId(null);
    setAdminOpen(false);
  };

  const handleModeChange = (mode: "AI" | "HUMAN") => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === selectedId
          ? {
              ...c,
              mode,
              human_requested: mode === "AI" ? 0 : c.human_requested,
              awaiting_handoff: mode === "AI" ? 0 : c.awaiting_handoff,
            }
          : c
      )
    );
  };

  const handleSelectConversation = async (id: number) => {
    setSelectedId(id);

    const convo = conversations.find((c) => c.id === id);
    if (convo?.last_message_at) {
      markRead(id, convo.last_message_at);
    }

    if (!convo?.human_requested) return;

    try {
      await fetch(`/api/conversations/${id}/acknowledge`, { method: "POST" });
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, human_requested: 0 } : c))
      );
    } catch {}
  };

  const handleDelete = () => {
    setConversations((prev) => prev.filter((c) => c.id !== selectedId));
    setSelectedId(null);
  };

  const handleDisconnectLine = async (lineId: number) => {
    await fetch("/api/connection/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineId }),
    });

    // Immediate refresh after disconnect
    await fetchStatus();

    if (user && !isAdminOrAbove(user.role)) {
      setPanelEntered(false);
      setConversations([]);
      setSelectedId(null);
    }

    // Fast-poll every 2s until the line leaves "disconnected" state (QR appears)
    const FAST_POLL_INTERVAL = 2_000;
    const FAST_POLL_TIMEOUT = 30_000;
    const started = Date.now();

    const fastPoll = setInterval(async () => {
      await fetchStatus();
      // Stop fast polling once a QR or connection is detected, or after timeout
      const elapsed = Date.now() - started;
      if (elapsed >= FAST_POLL_TIMEOUT) {
        clearInterval(fastPoll);
      }
    }, FAST_POLL_INTERVAL);

    // Always clear after timeout
    setTimeout(() => clearInterval(fastPoll), FAST_POLL_TIMEOUT + 500);
  };

  if (!user) {
    return <LoginScreen onLogin={setUser} />;
  }

  if (!canUsePanel) {
    return (
      <LineSetupScreen
        lines={lines}
        connectedCount={connectedCount}
        elapsed={elapsed}
        user={user}
        isAdmin={isAdminOrAbove(user.role)}
        onLogout={handleLogout}
        onContinue={
          connectedCount >= 1 ? () => setPanelEntered(true) : undefined
        }
      />
    );
  }

  const selectedConvo = conversations.find((c) => c.id === selectedId) ?? null;
  return (
    <div className="app-shell flex flex-col bg-[var(--color-surface)]">
      <DashboardHeader
        lines={visibleLines}
        businessName={adminSettings.businessName}
        user={user}
        onLogout={handleLogout}
        onRefreshUser={() => void checkSession()}
        onOpenAdmin={canAdvancedAdmin ? () => setAdminOpen(true) : undefined}
        activeView={activeView}
        onViewChange={setActiveView}
        onOpenTicket={(ticketId) => {
          setActiveView("tickets");
          setFocusTicketId(ticketId);
        }}
      />

      <NotificationPermissionBanner enabled={!!user && canUsePanel} />

      {ticketPopups.length > 0 && (
        <div className="pointer-events-none fixed right-4 top-20 z-[90] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
          {ticketPopups.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => openTicketFromPopup(p.id, p.ticketId)}
              className="pointer-events-auto flex items-start gap-3 rounded-xl border border-indigo-200 bg-white px-4 py-3 text-left shadow-lg ring-1 ring-black/5 transition hover:border-indigo-300 hover:shadow-xl animate-toast-in"
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 0 0-4-5.7V5a2 2 0 1 0-4 0v.3A6 6 0 0 0 6 11v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0v1a3 3 0 1 1-6 0v-1" />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-900">
                  {p.folio}
                </span>
                <span className="block text-xs text-slate-600">{p.message}</span>
                <span className="mt-1 block text-[11px] font-medium text-indigo-600">
                  Ver solicitud →
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {canAdvancedAdmin && (
        <AdminPanel
          open={adminOpen}
          onClose={() => setAdminOpen(false)}
          lines={lines}
          viewerRole={user.role}
          onLinesChange={fetchStatus}
          onSaved={(settings) =>
            setAdminSettings({
              businessName: settings.businessName,
              logoUrl: settings.logoUrl,
              chatColors: settings.chatColors,
            })
          }
          onDisconnectLine={handleDisconnectLine}
          onLogout={handleLogout}
          onNavigateToCondominios={() => {
            setAdminOpen(false);
            try {
              sessionStorage.setItem("residentes-tab", "condominios");
            } catch {}
            setActiveView("residentes");
          }}
        />
      )}
      <DashboardViewBoundary resetKey={shownView}>
      {user && !viewAllowed(user, shownView) ? (
        <main className="flex flex-1 items-center justify-center text-sm text-gray-500">
          No hay módulos activos para tu perfil.
        </main>
      ) : shownView === "residentes" ? (
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ResidentesView />
        </main>
      ) : shownView === "productos" ? (
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ProductosView />
        </main>
      ) : shownView === "cotizaciones" ? (
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <CotizacionesView />
        </main>
      ) : shownView === "embudos" ? (
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <EmbudosView />
        </main>
      ) : shownView === "tickets" ? (
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <TicketsAdminView
            isAdmin={isAdminUser}
            refreshSignal={ticketRefreshKey}
            focusTicketId={focusTicketId}
            onFocusHandled={() => setFocusTicketId(null)}
          />
        </main>
      ) : shownView === "finanzas" && isAdminUser ? (
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <FinanceView />
        </main>
      ) : shownView === "metrics" && isAdminUser ? (
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <MetricsDashboard lines={lines} refreshKey={metricsRefreshKey} />
        </main>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <aside
            className={`${
              selectedId !== null ? "hidden md:flex" : "flex"
            } w-full md:w-80 border-r border-gray-200 bg-white overflow-hidden flex-col`}
          >
            <ConversationList
              conversations={conversations}
              lines={visibleLines}
              lineFilter={lineFilter}
              onLineFilterChange={setLineFilter}
              selectedId={selectedId}
              onSelect={handleSelectConversation}
              isUnread={isUnread}
            />
          </aside>

          <main
            className={`${
              selectedId === null ? "hidden md:flex" : "flex"
            } flex-1 flex-col`}
          >
            {selectedConvo ? (
              <ConversationPanel
                conversation={selectedConvo}
                onModeChange={handleModeChange}
                onDelete={handleDelete}
                onConversationClosed={fetchConversations}
                canDelete={can(user, "delete_conversation")}
                canAssignToOthers={can(user, "assign_chat_to_others")}
                currentUserId={user.id}
                chatColors={adminSettings.chatColors}
                onMarkRead={markRead}
                onBack={() => setSelectedId(null)}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <p>Selecciona una conversación</p>
              </div>
            )}
          </main>
        </div>
      )}
      </DashboardViewBoundary>
    </div>
  );
}
