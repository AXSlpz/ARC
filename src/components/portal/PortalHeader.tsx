"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import type { PortalUser } from "@/lib/portal/types";
import { fetchJson } from "./portalClient";

export function PortalHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<PortalUser | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const loadMe = useCallback(async () => {
    try {
      const data = await fetchJson<{ user: PortalUser | null }>(
        "/api/portal/me",
      );
      setUser(data.user);
    } catch {
      setUser(null);
    }
  }, []);

  // Re-sincroniza al navegar (el layout no se re-monta entre rutas del portal).
  useEffect(() => {
    loadMe();
  }, [loadMe, pathname]);

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

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
        <Link
          href={user ? "/portal/tickets" : "/portal"}
          className="flex items-center gap-2"
          aria-label="ARC — Portal de clientes"
        >
          <span className="text-2xl font-black tracking-[0.25em] text-slate-900">
            ARC
          </span>
          <span className="hidden text-xs font-medium text-slate-400 sm:inline">
            Portal de clientes
          </span>
        </Link>

        {user && (
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden max-w-[10rem] truncate text-sm font-medium text-slate-600 sm:inline">
              {user.name}
            </span>
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
