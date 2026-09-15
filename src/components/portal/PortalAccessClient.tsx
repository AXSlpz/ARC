"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PortalUser } from "@/lib/portal/types";
import { fetchJson } from "@/components/portal/portalClient";

type Tab = "login" | "register";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40";

const primaryBtnClass =
  "w-full rounded-lg bg-emerald-600 px-4 py-3 sm:py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50";

export function PortalAccessClient() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("login");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regPassword, setRegPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), 8000);

    (async () => {
      try {
        const data = await fetchJson<{ user: PortalUser | null }>(
          "/api/portal/me",
          { signal: ac.signal },
        );
        if (active && data.user) {
          router.replace("/portal/tickets");
        }
      } catch {
        // Sin sesión o timeout: el formulario ya está visible.
      }
    })();

    return () => {
      active = false;
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [router]);

  const switchTab = (next: Tab) => {
    setTab(next);
    setError("");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await fetchJson<{ user: PortalUser }>("/api/portal/login", {
        method: "POST",
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      router.replace("/portal/tickets");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión");
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regPassword.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await fetchJson<{ user: PortalUser }>("/api/portal/register", {
        method: "POST",
        body: JSON.stringify({
          name: regName,
          email: regEmail,
          phone: regPhone,
          password: regPassword,
        }),
      });
      router.replace("/portal/tickets");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la cuenta");
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-slate-900">
          Bienvenido al portal ARC
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Consulta y da seguimiento a tus solicitudes.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => switchTab("login")}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === "login"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            onClick={() => switchTab("register")}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === "register"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Crear cuenta
          </button>
        </div>

        {tab === "login" ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="login-email"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Correo electrónico
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className={inputClass}
                placeholder="tucorreo@ejemplo.com"
              />
            </div>
            <div>
              <label
                htmlFor="login-password"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Contraseña
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className={inputClass}
                placeholder="••••••••"
              />
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button type="submit" disabled={loading} className={primaryBtnClass}>
              {loading ? "Entrando…" : "Iniciar sesión"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label
                htmlFor="reg-name"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Nombre completo
              </label>
              <input
                id="reg-name"
                type="text"
                autoComplete="name"
                required
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                className={inputClass}
                placeholder="Tu nombre"
              />
            </div>
            <div>
              <label
                htmlFor="reg-email"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Correo electrónico
              </label>
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                required
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                className={inputClass}
                placeholder="tucorreo@ejemplo.com"
              />
            </div>
            <div>
              <label
                htmlFor="reg-phone"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Teléfono
              </label>
              <input
                id="reg-phone"
                type="tel"
                autoComplete="tel"
                required
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
                className={inputClass}
                placeholder="10 dígitos"
              />
            </div>
            <div>
              <label
                htmlFor="reg-password"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Contraseña
              </label>
              <input
                id="reg-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                className={inputClass}
                placeholder="Mínimo 8 caracteres"
              />
              <p className="mt-1 text-xs text-slate-400">
                Usa al menos 8 caracteres.
              </p>
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button type="submit" disabled={loading} className={primaryBtnClass}>
              {loading ? "Creando cuenta…" : "Crear cuenta"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
