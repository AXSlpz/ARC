"use client";

import { useState, useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import { ModeToggle } from "./ModeToggle";
import { useToast } from "./Toast";
import type { AdminUser, ChatColors } from "@/lib/admin-settings-types";
import { ContactDisplayName } from "@/components/ContactDisplayName";
import {
  formatContactMetaLine,
  formatContactPropertyLine,
  type ContactPropertyDisplay,
} from "@/lib/contact-display";

interface Message {
  id: number;
  conversation_id: number;
  role: "user" | "assistant" | "human";
  content: string;
  media_type?: string | null;
  created_at: number;
}

interface Tag {
  id: number;
  name: string;
  color: string;
}

interface Note {
  id: number;
  authorName: string;
  content: string;
  createdAt: number;
}

interface QuickReply {
  id: number;
  label: string;
  content: string;
}

interface Conversation {
  id: number;
  line_id?: number;
  line_name?: string;
  phone: string;
  name: string | null;
  mode: "AI" | "HUMAN";
  priority?: string;
  category?: string | null;
  assigned_to_user_id?: number | null;
  assigned_to_name?: string | null;
  handoff_summary?: string | null;
  handoff_at?: number | null;
  human_requested?: number;
  closed_at?: number | null;
  tags?: Tag[];
  residente_num_coto?: string | null;
  residente_num_vivienda?: number | null;
  residente_condominio?: string | null;
  residente_nombre?: string | null;
  residente_properties?: ContactPropertyDisplay[];
  sender_name?: string | null;
}

interface ConversationPanelProps {
  conversation: Conversation;
  onModeChange: (mode: "AI" | "HUMAN") => void;
  onDelete: () => void;
  onConversationClosed?: () => void;
  canDelete: boolean;
  canAssignToOthers?: boolean;
  currentUserId?: number;
  chatColors: ChatColors;
  onMarkRead: (conversationId: number, at?: number | null) => void;
  onBack?: () => void;
}

interface AssignableAgent {
  id: number;
  username: string;
  displayName: string | null;
  role?: AdminUser["role"];
}

function TrashIcon() {
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
        d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7h12Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 11v6M14 11v6" />
    </svg>
  );
}

const actionBtnClass =
  "inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap sm:px-3";

const actionBtnPrimaryClass =
  "inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-800 shadow-sm transition-colors hover:bg-emerald-100 disabled:opacity-50 whitespace-nowrap sm:px-3";

const actionIconBtnClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-red-500 shadow-sm transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600";

export function ConversationPanel({
  conversation,
  onModeChange,
  onDelete,
  onConversationClosed,
  canDelete,
  canAssignToOthers = false,
  currentUserId: _currentUserId,
  chatColors,
  onMarkRead,
  onBack,
}: ConversationPanelProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteInput, setNoteInput] = useState("");
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assigningToOther, setAssigningToOther] = useState(false);
  const [agents, setAgents] = useState<AssignableAgent[]>([]);
  const [closingSurvey, setClosingSurvey] = useState(false);
  const [reopening, setReopening] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  const SCROLL_THRESHOLD = 100;

  const updateStickToBottom = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD;
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    let active = true;
    const fetchMessages = async () => {
      try {
        const res = await fetch(`/api/messages/${conversation.id}`);
        if (!res.ok || !active) return;
        const data: Message[] = await res.json();
        setMessages((prev) => {
          if (
            prev.length === data.length &&
            (prev.length === 0 ||
              prev[prev.length - 1]?.id === data[data.length - 1]?.id)
          ) {
            return prev;
          }
          return data;
        });
        const last = data[data.length - 1];
        if (last) onMarkRead(conversation.id, last.created_at);
      } catch {}
    };
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [conversation.id, onMarkRead]);

  useEffect(() => {
    fetch(`/api/conversations/${conversation.id}/notes`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setNotes);
    fetch(`/api/conversations/${conversation.id}/tags`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setAllTags(data.allTags ?? []);
          setSelectedTags((data.tags ?? []).map((t: Tag) => t.id));
        }
      });
    fetch(`/api/conversations/${conversation.id}/summary`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setSummary(data?.summary ?? null))
      .catch(() => setSummary(null));
    fetch("/api/quick-replies")
      .then((r) => (r.ok ? r.json() : []))
      .then(setQuickReplies);
  }, [
    conversation.id,
    conversation.handoff_summary,
    conversation.handoff_at,
    conversation.human_requested,
    conversation.mode,
    conversation.closed_at,
  ]);

  useEffect(() => {
    if (!canAssignToOthers) {
      setAgents([]);
      return;
    }

    let active = true;
    fetch("/api/admin/users")
      .then((r) => (r.ok ? r.json() : []))
      .then((users: AdminUser[]) => {
        if (!active || !Array.isArray(users)) return;
        const atencion = users.filter((u) => u.role === "atencion");
        const assignedId = conversation.assigned_to_user_id;
        if (
          assignedId != null &&
          !atencion.some((u) => u.id === assignedId)
        ) {
          const current = users.find((u) => u.id === assignedId);
          if (current) {
            setAgents([...atencion, current]);
            return;
          }
        }
        setAgents(atencion);
      })
      .catch(() => {
        if (active) setAgents([]);
      });

    return () => {
      active = false;
    };
  }, [canAssignToOthers, conversation.id, conversation.assigned_to_user_id]);

  useEffect(() => {
    stickToBottomRef.current = true;
    const frame = requestAnimationFrame(() => scrollToBottom("instant"));
    return () => cancelAnimationFrame(frame);
  }, [conversation.id]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => updateStickToBottom();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [conversation.id]);

  useEffect(() => {
    if (messages.length > 0 && stickToBottomRef.current) {
      scrollToBottom("smooth");
    }
  }, [messages]);

  const handleSend = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/messages/${conversation.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        setInput("");
        stickToBottomRef.current = true;
        const updated = await fetch(`/api/messages/${conversation.id}`);
        if (updated.ok) setMessages(await updated.json());
      } else {
        toast("No se pudo enviar el mensaje", "error");
      }
    } catch {
      toast("Error de conexión al enviar", "error");
    }
    setSending(false);
  };

  const handleToggleMode = async (newMode: "AI" | "HUMAN") => {
    const res = await fetch(`/api/mode/${conversation.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: newMode }),
    });
    if (res.ok) onModeChange(newMode);
  };

  const handleDelete = async () => {
    const res = await fetch(`/api/conversations/${conversation.id}`, {
      method: "DELETE",
    });
    if (res.ok) onDelete();
    setConfirmDelete(false);
  };

  const handleAddNote = async () => {
    if (!noteInput.trim()) return;
    const res = await fetch(`/api/conversations/${conversation.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: noteInput }),
    });
    if (res.ok) {
      setNoteInput("");
      setNotes(await (await fetch(`/api/conversations/${conversation.id}/notes`)).json());
    }
  };

  const handleTagsChange = async (tagId: number) => {
    const next = selectedTags.includes(tagId)
      ? selectedTags.filter((id) => id !== tagId)
      : [...selectedTags, tagId];
    setSelectedTags(next);
    await fetch(`/api/conversations/${conversation.id}/tags`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagIds: next }),
    });
  };

  const handleAssignToOther = async (userId: number) => {
    setAssigningToOther(true);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        const agent = agents.find((a) => a.id === userId);
        toast(
          `Chat asignado a ${agent?.displayName ?? agent?.username ?? "agente"}`,
          "success"
        );
        onConversationClosed?.();
      } else {
        const data = await res.json().catch(() => ({}));
        toast((data as { error?: string }).error ?? "No se pudo asignar", "error");
      }
    } catch {
      toast("Error al asignar el chat", "error");
    } finally {
      setAssigningToOther(false);
    }
  };

  const handleAssign = async () => {
    setAssigning(true);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        toast("Chat asignado a ti", "success");
        onConversationClosed?.();
      } else {
        const data = await res.json().catch(() => ({}));
        toast((data as { error?: string }).error ?? "No se pudo asignar", "error");
      }
    } catch {
      toast("Error al asignar el chat", "error");
    } finally {
      setAssigning(false);
    }
  };

  const handleCloseSurvey = async () => {
    if (closingSurvey) return;
    setClosingSurvey(true);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/close`, {
        method: "POST",
      });
      if (res.ok) {
        setSummary(null);
        toast("Conversación cerrada", "success");
        onConversationClosed?.();
      } else {
        toast("No se pudo cerrar la conversación", "error");
      }
    } catch {
      toast("Error al cerrar la conversación", "error");
    } finally {
      setClosingSurvey(false);
    }
  };

  const handleReopen = async () => {
    setReopening(true);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/reopen`, {
        method: "POST",
      });
      if (res.ok) {
        toast("Conversación reabierta", "success");
        onConversationClosed?.();
      } else {
        const data = await res.json().catch(() => ({}));
        toast(
          typeof data.error === "string"
            ? data.error
            : "No se pudo reabrir la conversación",
          "error"
        );
      }
    } catch {
      toast("Error al reabrir la conversación", "error");
    } finally {
      setReopening(false);
    }
  };

  const handleDismissSummary = async () => {
    await fetch(`/api/conversations/${conversation.id}/summary`, {
      method: "DELETE",
    });
    setSummary(null);
  };

  const isClosed = Boolean(conversation.closed_at);

  const actionButtons = isClosed ? (
    <button
      onClick={handleReopen}
      disabled={reopening}
      className={actionBtnPrimaryClass}
    >
      {reopening ? "Reabriendo…" : "Reabrir conversación"}
    </button>
  ) : (
    <>
      {canAssignToOthers && agents.length > 0 && (
        <select
          value={conversation.assigned_to_user_id ?? ""}
          disabled={assigningToOther}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next) && next > 0) {
              void handleAssignToOther(next);
            }
          }}
          className={`${actionBtnClass} max-w-[9rem] truncate sm:max-w-[11rem]`}
          aria-label="Asignar conversación a otro agente"
        >
          <option value="">Asignar a…</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.displayName ?? agent.username}
            </option>
          ))}
        </select>
      )}
      <button
        onClick={handleAssign}
        disabled={assigning}
        className={actionBtnPrimaryClass}
      >
        {assigning ? "Asignando…" : "Tomar chat"}
      </button>
      <button
        onClick={() => setShowNotes(!showNotes)}
        className={actionBtnClass}
      >
        Notas ({notes.length})
      </button>
      <button
        onClick={handleCloseSurvey}
        disabled={closingSurvey}
        className={actionBtnClass}
        title="Cerrar conversación"
      >
        {closingSurvey ? "Cerrando…" : "Cerrar conversación"}
      </button>
      {canDelete &&
        (confirmDelete ? (
          <>
            <button
              onClick={handleDelete}
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-red-600 px-2.5 text-xs font-medium text-white hover:bg-red-700"
            >
              Sí
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              No
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className={actionIconBtnClass}
            title="Borrar conversación"
            aria-label="Borrar conversación"
          >
            <TrashIcon />
          </button>
        ))}
    </>
  );

  const displayProperties: ContactPropertyDisplay[] =
    conversation.residente_properties &&
    conversation.residente_properties.length > 0
      ? conversation.residente_properties
      : formatContactMetaLine(
            conversation.residente_condominio,
            conversation.residente_num_vivienda
          )
        ? [
            {
              id: 0,
              condominio: conversation.residente_condominio ?? "",
              num_vivienda: conversation.residente_num_vivienda ?? null,
              num_coto: conversation.residente_num_coto ?? null,
            },
          ]
        : [];

  const contactMeta = (
    <div className="min-w-0">
      <p className="font-bold text-base flex items-center gap-2 flex-wrap md:text-lg">
        <span className="truncate">
          <ContactDisplayName
            input={{
              sender_name: conversation.sender_name,
              residente_nombre: conversation.residente_nombre,
              name: conversation.name,
              phone: conversation.phone,
            }}
            primaryClassName="text-emerald-700"
            representativeClassName="text-slate-500 font-bold"
          />
        </span>
        {isClosed && (
          <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md md:text-xs">
            Cerrado
          </span>
        )}
        {conversation.priority === "urgent" && (
          <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-md md:text-xs">
            URGENTE
          </span>
        )}
      </p>
      {displayProperties.length > 0 && (
        <div className="mt-0.5 space-y-0.5 text-xs text-slate-500 md:text-sm">
          {displayProperties.map((property) => {
            const line = formatContactPropertyLine(property);
            const numMatch = line.match(/^(.*?)(Núm° Vivienda - )(\d+)$/);
            return (
              <p key={`${property.id}-${line}`}>
                {numMatch ? (
                  <>
                    {numMatch[1]}
                    {numMatch[2]}
                    <span className="font-bold text-emerald-700">
                      {numMatch[3]}
                    </span>
                  </>
                ) : (
                  line
                )}
              </p>
            );
          })}
        </div>
      )}
      {conversation.assigned_to_name && (
        <p className="text-xs text-blue-600 md:text-sm">
          Asignado: {conversation.assigned_to_name}
        </p>
      )}
    </div>
  );

  const modeToggle = (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {conversation.mode === "AI" ? "Chatboot AI" : "Atención"}
      </span>
      <ModeToggle
        conversationId={conversation.id}
        mode={conversation.mode}
        onToggle={handleToggleMode}
        disabled={isClosed}
      />
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-slate-200 bg-white">
        <div className="hidden md:flex items-center gap-4 px-6 py-3">
          <div className="min-w-0 flex-1">{contactMeta}</div>
          <div className="flex shrink-0 flex-nowrap items-center justify-center gap-2">
            {actionButtons}
          </div>
          {modeToggle}
        </div>

        <div className="md:hidden">
          <div className="flex items-start justify-between gap-4 px-4 py-3">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                  aria-label="Volver a la lista"
                >
                  ←
                </button>
              )}
              {contactMeta}
            </div>
            {modeToggle}
          </div>
          <div className="flex flex-nowrap items-center justify-center gap-2 overflow-x-auto px-4 pb-3">
            {actionButtons}
          </div>
        </div>
      </header>

      {summary && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-sm text-amber-900">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-xs font-medium">Resumen para asesor</p>
              <p className="whitespace-pre-wrap">{summary}</p>
            </div>
            <button
              type="button"
              onClick={handleDismissSummary}
              className="shrink-0 text-lg font-bold leading-none text-red-500 hover:text-red-700"
              title="Cerrar resumen"
              aria-label="Cerrar resumen"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap gap-1.5 items-center md:px-6 md:py-3 md:gap-2">
        <span className="text-xs text-slate-500 mr-0.5 md:text-sm">Etiquetas:</span>
        {allTags.map((tag) => (
          <button
            key={tag.id}
            onClick={() => handleTagsChange(tag.id)}
            className={`text-[10px] px-2 py-0.5 rounded-full border ${
              selectedTags.includes(tag.id) ? "text-white" : "text-gray-600"
            }`}
            style={{
              backgroundColor: selectedTags.includes(tag.id) ? tag.color : "transparent",
              borderColor: tag.color,
            }}
          >
            {tag.name}
          </button>
        ))}
      </div>

      {showNotes && (
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 max-h-32 overflow-y-auto">
          {notes.map((n) => (
            <p key={n.id} className="text-xs text-gray-600 mb-1">
              <span className="font-medium">{n.authorName}:</span> {n.content}
            </p>
          ))}
          <div className="flex gap-2 mt-2">
            <input
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Nota interna (no se envía al cliente)"
              className="flex-1 text-xs border rounded px-2 py-1"
            />
            <button onClick={handleAddNote} className="text-xs bg-gray-800 text-white px-2 py-1 rounded">Guardar</button>
          </div>
        </div>
      )}

      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50"
      >
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            messageId={msg.id}
            role={msg.role}
            content={msg.content}
            mediaType={msg.media_type}
            createdAt={msg.created_at}
            colors={chatColors}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 py-3 border-t border-gray-200 bg-white">
        {isClosed ? (
          <div className="flex flex-col items-center gap-2 py-1 sm:flex-row sm:justify-center">
            <p className="text-sm text-gray-500 text-center">
              Conversación cerrada — solo lectura del historial.
            </p>
            <button
              type="button"
              onClick={handleReopen}
              disabled={reopening}
              className="text-sm bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium sm:hidden"
            >
              {reopening ? "Reabriendo…" : "Reabrir"}
            </button>
          </div>
        ) : conversation.mode === "AI" ? (
          <p className="text-sm text-gray-400 text-center py-2">El bot responde automáticamente</p>
        ) : (
          <>
            {quickReplies.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {quickReplies.map((qr) => (
                  <button
                    key={qr.id}
                    onClick={() => handleSend(qr.content)}
                    className="text-xs border border-gray-200 rounded px-2 py-1 hover:bg-gray-50"
                  >
                    {qr.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Escribe un mensaje..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                disabled={sending}
              />
              <button
                onClick={() => handleSend()}
                disabled={sending || !input.trim()}
                className="px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                style={{ backgroundColor: chatColors.human }}
              >
                Enviar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
