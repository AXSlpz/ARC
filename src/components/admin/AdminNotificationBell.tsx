"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Notice {
  id: number;
  kind: "solicitud" | "servicio";
  title: string;
  body: string;
  ticketId: number | null;
  folio: string | null;
  createdAt: number;
  read: boolean;
}

function formatWhen(unixSeconds: number): string {
  const diff = Math.max(0, Date.now() / 1000 - unixSeconds);
  if (diff < 60) return "Ahora";
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86_400) return `Hace ${Math.floor(diff / 3600)} h`;
  if (diff < 86_400 * 7) return `Hace ${Math.floor(diff / 86_400)} d`;
  return new Date(unixSeconds * 1000).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  });
}

function NoticeRow({ item, onOpen }: { item: Notice; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={`flex w-full gap-2 px-3 py-2.5 text-left transition hover:bg-slate-50 ${
          item.read ? "bg-white" : "bg-sky-50"
        }`}
      >
        <span
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
            item.read ? "bg-transparent" : "bg-sky-600"
          }`}
          aria-hidden="true"
        />
        <span className="min-w-0">
          <span
            className={`block text-sm ${
              item.read ? "font-medium text-slate-700" : "font-semibold text-slate-900"
            }`}
          >
            {item.title}
          </span>
          <span className="mt-0.5 block text-xs leading-4 text-slate-600">{item.body}</span>
          <span className="mt-1 block text-[11px] text-slate-400">
            {item.kind === "servicio" ? "Servicio" : "Solicitud"}
            {" · "}
            {formatWhen(item.createdAt)}
          </span>
        </span>
      </button>
    </li>
  );
}

export function AdminNotificationBell({
  onOpenTicket,
}: {
  onOpenTicket: (ticketId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        notifications?: Notice[];
        unreadCount?: number;
      };
      setItems(Array.isArray(data.notifications) ? data.notifications : []);
      setUnread(typeof data.unreadCount === "number" ? data.unreadCount : 0);
    } catch {
      /* el siguiente aviso vuelve a pedir la lista */
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    const onNotice = () => {
      void load();
    };
    window.addEventListener("arc-admin-notice", onNotice);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("arc-admin-notice", onNotice);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markOne(id: number) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
    setUnread((count) => Math.max(0, count - (items.some((item) => item.id === id && !item.read) ? 1 : 0)));
    await fetch("/api/admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => undefined);
  }

  async function markAll() {
    setItems((prev) => prev.map((item) => ({ ...item, read: true })));
    setUnread(0);
    await fetch("/api/admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => undefined);
  }

  const badge = unread > 9 ? "9+" : String(unread);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={unread > 0 ? `Notificaciones, ${unread} sin leer` : "Notificaciones"}
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          void load();
        }}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-black/[0.05] hover:text-slate-900"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17a3 3 0 0 0 6 0" />
        </svg>
        {unread > 0 ? (
          <span className="absolute right-0.5 top-0.5 inline-flex min-w-[1.05rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold leading-4 text-white">
            {badge}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5">
            <p className="text-sm font-semibold text-slate-900">Notificaciones</p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => void markAll()}
                className="text-xs font-medium text-violet-700 hover:text-violet-900"
              >
                Marcar leídas
              </button>
            ) : null}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-3 py-8 text-center text-sm text-slate-500">
                No hay notificaciones.
              </li>
            ) : (
              <>
                {items.some((item) => !item.read) ? (
                  <li className="bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Sin leer
                  </li>
                ) : null}
                {items
                  .filter((item) => !item.read)
                  .map((item) => (
                    <NoticeRow
                      key={item.id}
                      item={item}
                      onOpen={() => {
                        void markOne(item.id);
                        setOpen(false);
                        if (item.ticketId) onOpenTicket(item.ticketId);
                      }}
                    />
                  ))}
                {items.some((item) => item.read) ? (
                  <li className="bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Leídas
                  </li>
                ) : null}
                {items
                  .filter((item) => item.read)
                  .map((item) => (
                    <NoticeRow
                      key={item.id}
                      item={item}
                      onOpen={() => {
                        void markOne(item.id);
                        setOpen(false);
                        if (item.ticketId) onOpenTicket(item.ticketId);
                      }}
                    />
                  ))}
              </>
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
