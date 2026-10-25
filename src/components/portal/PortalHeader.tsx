"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import type { PortalUser } from "@/lib/portal/types";
import { fetchJson } from "./portalClient";
import {
  PORTAL_FILE_PREVIEW_EVENT,
  requestClosePortalFilePreview,
} from "./portalFilePreview";

export function PortalHeader({
  initialUser = null,
}: {
  initialUser?: PortalUser | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<PortalUser | null>(initialUser);
  const [loggingOut, setLoggingOut] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setUser(initialUser);
  }, [initialUser]);

  const loadMe = useCallback(async () => {
    try {
      const data = await fetchJson<{ user: PortalUser | null }>(
        "/api/portal/me",
      );
      setUser(data.user);
    } catch {
      // Conserva la sesión que ya pintó el servidor si /me no responde.
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe, pathname]);

  useEffect(() => {
    const onPreview = (event: Event) => {
      const active = (event as CustomEvent<boolean>).detail === true;
      setPreviewing(active);
    };
    window.addEventListener(PORTAL_FILE_PREVIEW_EVENT, onPreview);
    return () => window.removeEventListener(PORTAL_FILE_PREVIEW_EVENT, onPreview);
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetchJson<{ ok: true }>("/api/portal/logout", { method: "POST" });
    } catch {
      // Aunque falle, forzamos salida al portal.
    } finally {
      setUser(null);
      setLoggingOut(false);
      router.replace("/portal");
    }
  };

  const onAccessPage =
    pathname === "/portal" || pathname === "/portal/registro";

  useEffect(() => {
    const node = headerRef.current;
    if (!node) return;
    const apply = () => {
      document.documentElement.style.setProperty(
        "--portal-header-h",
        `${node.offsetHeight}px`,
      );
    };
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, [previewing, user, onAccessPage]);

  useEffect(() => {
    if (!previewing) return;
    headerRef.current
      ?.querySelector<HTMLButtonElement>("[data-portal-preview-back]")
      ?.focus();
  }, [previewing]);

  return (
    <header
      ref={headerRef}
      className={`${
        user && !onAccessPage ? "sticky top-0 z-40" : "relative z-0"
      } border-b border-slate-200 bg-white/90 backdrop-blur`}
    >
      <div
        className={`mx-auto flex max-w-3xl items-center px-4 py-3 sm:px-6 ${
          onAccessPage ? "justify-center" : "justify-between"
        }`}
      >
        {previewing ? (
          <span className="text-2xl font-black tracking-[0.25em] text-slate-900">
            ARC
          </span>
        ) : (
          <Link
            href={user ? "/portal/inicio" : "/portal"}
            className="flex items-center gap-2"
            aria-label="ARC — Portal de clientes"
          >
            <span className="text-2xl font-black tracking-[0.25em] text-slate-900">
              ARC
            </span>
            <span
              className={`text-xs font-medium text-slate-400 ${
                onAccessPage ? "inline" : "hidden sm:inline"
              }`}
            >
              Portal de clientes
            </span>
          </Link>
        )}

        {user && previewing ? (
          <button
            type="button"
            data-portal-preview-back
            onClick={requestClosePortalFilePreview}
            aria-label="Regresar"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-800 shadow-sm"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
          </button>
        ) : null}

        {user && !previewing && (
          <div className="flex items-center gap-2 sm:gap-3">
            <nav className="hidden items-center gap-1 sm:flex">
              <Link
                href="/portal/inicio"
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
              >
                Inicio
              </Link>
              <Link
                href="/portal/tickets"
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
              >
                Mis solicitudes
              </Link>
            </nav>
            <Link
              href="/portal/perfil"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              Mi perfil
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              {loggingOut ? "Saliendo…" : "Salir"}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
