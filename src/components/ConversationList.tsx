"use client";

import { useMemo, useState } from "react";
import type { WaLineStatus } from "./LineSetupScreen";
import { getLineActiveClass, getLineBadgeClass } from "@/lib/line-colors";
import { ContactDisplayName } from "@/components/ContactDisplayName";

interface Tag {
  id: number;
  name: string;
  color: string;
}

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
  assigned_to_name?: string | null;
  sla_breached?: number;
  closed_at?: number | null;
  survey_rating?: number | null;
  tags?: Tag[];
  last_message_at: number | null;
  last_message_preview: string | null;
  last_message_role?: string | null;
  residente_nombre?: string | null;
  sender_name?: string | null;
}

type ChatFilter = "ai" | "support";
type ListView = "open" | "closed";

interface ConversationListProps {
  conversations: Conversation[];
  lines: WaLineStatus[];
  lineFilter: number | "all";
  onLineFilterChange: (filter: number | "all") => void;
  selectedId: number | null;
  onSelect: (id: number) => void;
  isUnread: (conversation: Conversation) => boolean;
}

function timeAgo(timestamp: number | null): string {
  if (!timestamp) return "";
  const diff = Math.floor(Date.now() / 1000) - timestamp;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  return `hace ${Math.floor(diff / 86400)}d`;
}

function sortLiveConversations(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => {
    const aUrgent = a.priority === "urgent" ? 1 : 0;
    const bUrgent = b.priority === "urgent" ? 1 : 0;
    if (aUrgent !== bUrgent) return bUrgent - aUrgent;
    const aRequested = a.human_requested ? 1 : 0;
    const bRequested = b.human_requested ? 1 : 0;
    if (aRequested !== bRequested) return bRequested - aRequested;
    if (a.sla_breached !== b.sla_breached)
      return (b.sla_breached ?? 0) - (a.sla_breached ?? 0);
    return (b.last_message_at ?? 0) - (a.last_message_at ?? 0);
  });
}

function sortClosedConversations(list: Conversation[]): Conversation[] {
  return [...list].sort(
    (a, b) => (b.closed_at ?? 0) - (a.closed_at ?? 0)
  );
}

function isLiveChat(c: Conversation): boolean {
  return !c.closed_at;
}

function isClosedChat(c: Conversation): boolean {
  return Boolean(c.closed_at);
}

function isAiChat(c: Conversation): boolean {
  return c.mode === "AI" && !c.human_requested;
}

function isSupportChat(c: Conversation): boolean {
  return c.mode === "HUMAN" || Boolean(c.human_requested);
}

function splitByGroup(
  conversations: Conversation[],
  matcher: (c: Conversation) => boolean
) {
  const inGroup = conversations.filter(matcher);
  return {
    live: sortLiveConversations(inGroup.filter(isLiveChat)),
    closed: sortClosedConversations(inGroup.filter(isClosedChat)),
  };
}

function ConversationItem({
  convo,
  selectedId,
  onSelect,
  closed,
  unread,
}: {
  convo: Conversation;
  selectedId: number | null;
  onSelect: (id: number) => void;
  closed?: boolean;
  unread?: boolean;
}) {
  const advisorRequested = Boolean(convo.human_requested) && !closed;
  const slaBreached = Boolean(convo.sla_breached) && !closed;

  return (
    <button
      onClick={() => onSelect(convo.id)}
      className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors border-l-4 ${
        closed
          ? "border-l-gray-300 bg-gray-50/80 opacity-90 hover:bg-gray-100"
          : advisorRequested
            ? "animate-blink-red border-l-red-600 bg-red-50"
            : slaBreached
              ? "animate-blink-red border-l-red-500"
              : convo.priority === "urgent"
                ? "border-l-orange-500 bg-orange-50"
                : "border-l-transparent hover:bg-gray-50"
      } ${selectedId === convo.id && !advisorRequested ? "bg-gray-100" : ""} ${
        selectedId === convo.id && advisorRequested ? "bg-red-100" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-1 gap-2">
        <span className="text-sm truncate flex items-center gap-1.5 min-w-0 font-semibold">
          {unread && !closed && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" aria-label="No leído" />
          )}
          <ContactDisplayName
            input={{
              sender_name: convo.sender_name,
              residente_nombre: convo.residente_nombre,
              name: convo.name,
              phone: convo.phone,
            }}
            primaryClassName={
              unread && !closed ? "text-emerald-700" : "text-emerald-800"
            }
            representativeClassName="text-slate-500 font-semibold"
          />
        </span>
        <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
          {closed && convo.survey_rating != null && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
              ★ {convo.survey_rating}/5
            </span>
          )}
          {closed && convo.survey_rating == null && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">
              Cerrado
            </span>
          )}
          {!closed && convo.priority === "urgent" && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500 text-white">
              URGENTE
            </span>
          )}
          {!closed && slaBreached && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-500 text-white">
              SLA
            </span>
          )}
          {!closed && advisorRequested && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-600 text-white animate-pulse-attention">
              SOLICITA ASESOR
            </span>
          )}
        </div>
      </div>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-gray-500 line-clamp-2 flex-1 min-w-0 leading-relaxed">
          {convo.last_message_preview ?? "Sin mensajes"}
        </p>
        <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
          <span className="text-[10px] text-gray-400">
            {timeAgo(closed ? convo.closed_at ?? convo.last_message_at : convo.last_message_at)}
          </span>
          <span
            className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${getLineBadgeClass(convo.line_id)}`}
          >
            {convo.line_name}
          </span>
        </div>
      </div>
      {convo.assigned_to_name && (
        <span className="text-[10px] text-blue-500 block">
          {convo.assigned_to_name}
        </span>
      )}
      {convo.tags && convo.tags.length > 0 && (
        <div className="flex gap-1 mt-1 flex-wrap">
          {convo.tags.map((t) => (
            <span
              key={t.id}
              className="text-[9px] px-1.5 py-0.5 rounded text-white"
              style={{ backgroundColor: t.color }}
            >
              {t.name}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function ChatSection({
  title,
  count,
  conversations,
  selectedId,
  onSelect,
  closed,
  emptyLabel,
  isUnread,
}: {
  title: string;
  count: number;
  conversations: Conversation[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  closed?: boolean;
  emptyLabel?: string;
  isUnread: (conversation: Conversation) => boolean;
}) {
  return (
    <section>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-gray-50/95 px-4 py-2 backdrop-blur-sm">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          {title}
        </h3>
        <span className="text-[10px] font-medium text-gray-400">{count}</span>
      </div>
      {conversations.length === 0 ? (
        <p className="px-4 py-3 text-xs text-gray-400">{emptyLabel ?? "Sin chats"}</p>
      ) : (
        conversations.map((convo) => (
          <ConversationItem
            key={convo.id}
            convo={convo}
            selectedId={selectedId}
            onSelect={onSelect}
            closed={closed}
            unread={isUnread(convo)}
          />
        ))
      )}
    </section>
  );
}

function FilterButton({
  label,
  count,
  active,
  onClick,
  activeColor,
  alert,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  activeColor: string;
  alert?: boolean;
}) {
  const alertClasses = alert
    ? active
      ? "animate-blink-button-red animate-pulse-attention border-red-700 bg-red-600 text-white shadow-md"
      : "animate-pulse-attention border-red-400 bg-red-50 text-red-700 hover:bg-red-100"
    : active
      ? `${activeColor} border-transparent text-white shadow-sm`
      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50";

  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${alertClasses}`}
    >
      <span className="truncate">{label}</span>
      <span
        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
          alert
            ? active
              ? "bg-white/30 text-white"
              : "bg-red-600 text-white"
            : active
              ? "bg-white/25 text-white"
              : "bg-gray-100 text-gray-700"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

export function ConversationList({
  conversations,
  lines,
  lineFilter,
  onLineFilterChange,
  selectedId,
  onSelect,
  isUnread,
}: ConversationListProps) {
  const [filter, setFilter] = useState<ChatFilter>("support");
  const [listView, setListView] = useState<ListView>("open");
  const [search, setSearch] = useState("");

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      if (c.phone.includes(q)) return true;
      if (c.name?.toLowerCase().includes(q)) return true;
      if (c.last_message_preview?.toLowerCase().includes(q)) return true;
      if (c.category?.toLowerCase().includes(q)) return true;
      if (c.assigned_to_name?.toLowerCase().includes(q)) return true;
      if (c.tags?.some((t) => t.name.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [conversations, search]);

  const aiGroup = splitByGroup(filteredConversations, isAiChat);
  const supportGroup = splitByGroup(filteredConversations, isSupportChat);
  const pendingAdvisor = filteredConversations.some(
    (c) => c.human_requested && !c.closed_at
  );

  const aiUnreadCount = filteredConversations.filter(
    (c) => isAiChat(c) && isUnread(c)
  ).length;
  const supportUnreadCount = filteredConversations.filter(
    (c) => isSupportChat(c) && isUnread(c)
  ).length;

  const activeGroup = filter === "ai" ? aiGroup : supportGroup;
  const closedCount = activeGroup.closed.length;
  const tabTotal =
    filter === "ai"
      ? aiGroup.live.length + aiGroup.closed.length
      : supportGroup.live.length + supportGroup.closed.length;
  const openCount = activeGroup.live.length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-700">Chats</h2>
        <div className="mt-2 relative">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, teléfono, etiqueta…"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-white"
            aria-label="Buscar conversaciones"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
              aria-label="Limpiar búsqueda"
            >
              ×
            </button>
          )}
        </div>
        {lines.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-1">
            <button
              onClick={() => onLineFilterChange("all")}
              className={`rounded-md px-2 py-1 text-[10px] font-medium ${
                lineFilter === "all"
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Todas
            </button>
            {lines.map((line) => (
              <button
                key={line.id}
                onClick={() => onLineFilterChange(line.id)}
                className={`rounded-md px-2 py-1 text-[10px] font-medium ${
                  lineFilter === line.id
                    ? getLineActiveClass(line.id)
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {line.name}
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 flex gap-2">
          <FilterButton
            label="Chatboot AI"
            count={aiUnreadCount}
            active={filter === "ai"}
            onClick={() => {
              setFilter("ai");
              setListView("open");
            }}
            activeColor="bg-sky-600"
          />
          <FilterButton
            label="Atención a Cliente"
            count={supportUnreadCount}
            active={filter === "support"}
            onClick={() => {
              setFilter("support");
              setListView("open");
            }}
            activeColor="bg-amber-500"
            alert={pendingAdvisor}
          />
        </div>
        {closedCount > 0 && (
          <button
            type="button"
            onClick={() =>
              setListView((v) => (v === "closed" ? "open" : "closed"))
            }
            className={`mt-2 w-full rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
              listView === "closed"
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {listView === "closed"
              ? `← Volver a abiertos (${openCount})`
              : `Ver cerrados (${closedCount})`}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredConversations.length === 0 ? (
          <div className="flex h-full items-center justify-center p-4 text-sm text-gray-400 text-center">
            {search ? "Sin resultados para tu búsqueda" : "No hay conversaciones aún"}
          </div>
        ) : tabTotal === 0 ? (
          <div className="flex h-full items-center justify-center p-4 text-center text-xs text-gray-400">
            {filter === "ai"
              ? "Sin chats en Chatboot AI"
              : "Sin chats en Atención a Cliente"}
          </div>
        ) : listView === "closed" ? (
          <ChatSection
            title="Cerrados y calificados"
            count={activeGroup.closed.length}
            conversations={activeGroup.closed}
            selectedId={selectedId}
            onSelect={onSelect}
            closed
            emptyLabel="Sin chats cerrados"
            isUnread={isUnread}
          />
        ) : (
          <ChatSection
            title="Vivos"
            count={activeGroup.live.length}
            conversations={activeGroup.live}
            selectedId={selectedId}
            onSelect={onSelect}
            emptyLabel="Sin chats abiertos"
            isUnread={isUnread}
          />
        )}
      </div>
    </div>
  );
}
