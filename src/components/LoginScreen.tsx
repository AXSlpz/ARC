"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { SessionUser } from "@/lib/admin-settings-types";
import { formatAppVersion } from "@/lib/app-version";

interface LoginScreenProps {
  onLogin: (user: SessionUser) => void;
}

type Step = "credentials" | "totp" | "setup";

type Parallax = { x: number; y: number };

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
        <path
          d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Parallax solo con mouse (escritorio). Sin giroscopio en móvil/tablet. */
function useDesktopMouseParallax(enabled: boolean) {
  const [offset, setOffset] = useState<Parallax>({ x: 0, y: 0 });
  const target = useRef<Parallax>({ x: 0, y: 0 });
  const current = useRef<Parallax>({ x: 0, y: 0 });
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const finePointer =
      typeof window !== "undefined" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    if (!finePointer) {
      target.current = { x: 0, y: 0 };
      current.current = { x: 0, y: 0 };
      setOffset({ x: 0, y: 0 });
      return;
    }

    const tick = () => {
      const ease = 0.1;
      current.current = {
        x: current.current.x + (target.current.x - current.current.x) * ease,
        y: current.current.y + (target.current.y - current.current.y) * ease,
      };
      setOffset({ ...current.current });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);

    const onMouseMove = (e: MouseEvent) => {
      const nx = (e.clientX / window.innerWidth - 0.5) * 2;
      const ny = (e.clientY / window.innerHeight - 0.5) * 2;
      target.current = { x: clamp(nx, -1, 1), y: clamp(ny, -1, 1) };
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [enabled]);

  return offset;
}

function shapeStyle(px: number, py: number, depth: number): CSSProperties {
  return {
    transform: `translate3d(${px * depth}px, ${py * depth}px, 0)`,
    willChange: "transform",
  };
}

function LoginBackdrop({ offset }: { offset: Parallax }) {
  const px = offset.x * 18;
  const py = offset.y * 14;

  return (
    <div className="login-page__backdrop" aria-hidden="true">
      {/* Viñeta suave para dar foco al centro y legibilidad a la tarjeta */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_45%,transparent_45%,rgba(11,6,32,0.65)_100%)]" />
      {/* Resplandor tenue con leve parallax (profundidad, sin tapar la arquitectura) */}
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_45%_40%_at_50%_38%,rgba(124,58,237,0.28),transparent_65%)]"
        style={shapeStyle(px, py, 0.6)}
      />
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border-0 bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-400/70";

const primaryBtnClass =
  "w-full rounded-lg bg-[#c2185b] px-4 py-3 sm:py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(194,24,91,0.35)] hover:bg-[#ad1457] disabled:opacity-50 transition-colors";

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [step, setStep] = useState<Step>("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [motionOk, setMotionOk] = useState(true);

  /** Marca login + PWA móvil (no afecta escritorio con mouse). */
  useEffect(() => {
    const root = document.documentElement;
    const nav = navigator as Navigator & { standalone?: boolean };
    const isIos =
      /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      nav.standalone === true;
    const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;

    root.classList.add("login-active");
    document.body.classList.add("login-active");
    // Solo touch / iOS en standalone — el escritorio sigue con .login-page fixed normal
    if (isStandalone && (isIos || isCoarsePointer)) {
      root.classList.add("login-ios-pwa");
    }

    return () => {
      root.classList.remove("login-active", "login-ios-pwa");
      document.body.classList.remove("login-active");
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setMotionOk(!mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const parallax = useDesktopMouseParallax(motionOk);

  const startSetup = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/2fa/setup", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo iniciar la configuración 2FA");
        return;
      }
      setQrDataUrl(data.qrDataUrl ?? null);
      setTotpSecret(data.secret ?? null);
      setStep("setup");
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setLoading(false);
    }
  };

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Error al iniciar sesión");
        return;
      }

      if (data.requiresTotpSetup) {
        await startSetup();
        return;
      }

      if (data.requiresTotp) {
        setStep("totp");
        setCode("");
        return;
      }

      setError("Respuesta de login inesperada");
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setLoading(false);
    }
  };

  const handleTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/totp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Código incorrecto");
        return;
      }
      onLogin(data.user);
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/2fa/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo activar 2FA");
        return;
      }
      onLogin(data.user);
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <LoginBackdrop offset={parallax} />

      <div className="relative z-10 w-full max-w-[380px] px-4 py-4 sm:px-6">
        <div className="rounded-[28px] border border-white/25 bg-white/10 p-7 shadow-[0_25px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:p-8">
          <div className="mb-8 text-center">
            <h1 className="sr-only">
              {step === "credentials"
                ? "Iniciar sesión"
                : step === "totp"
                  ? "Verificación 2FA"
                  : "Configura autenticador"}
            </h1>
            <div className="flex min-h-28 flex-col items-center justify-center sm:min-h-32">
              <span className="text-6xl font-black leading-none tracking-[0.35em] text-white drop-shadow-[0_6px_28px_rgba(0,0,0,0.55)] sm:text-7xl">
                ARC
              </span>
              <span className="mt-3 h-px w-16 bg-white/40" aria-hidden="true" />
            </div>
            {step === "setup" && (
              <p className="mt-4 text-sm text-white/75">
                Escanea el QR con Google Authenticator / Authy y confirma el código.
              </p>
            )}
            {step === "totp" && (
              <p className="mt-4 text-sm text-white/75">
                Ingresa el código de 6 dígitos de tu autenticador.
              </p>
            )}
          </div>

          {step === "credentials" && (
            <form onSubmit={handleCredentials} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-white/90">
                  Usuario
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  className={inputClass}
                  placeholder="tu.usuario"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-white/90">
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    className={`${inputClass} pr-11`}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
              </div>
              {error && (
                <p className="text-center text-sm text-rose-200">{error}</p>
              )}
              <button type="submit" disabled={loading} className={primaryBtnClass}>
                {loading ? "Verificando..." : "Sign in"}
              </button>
            </form>
          )}

          {step === "totp" && (
            <form onSubmit={handleTotp} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-white/90">
                  Código 2FA
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  className={`${inputClass} text-center tracking-widest`}
                  placeholder="000000"
                />
              </div>
              {error && (
                <p className="text-center text-sm text-rose-200">{error}</p>
              )}
              <button type="submit" disabled={loading} className={primaryBtnClass}>
                {loading ? "Verificando..." : "Entrar"}
              </button>
              <button
                type="button"
                className="w-full text-sm text-white/70 hover:text-white"
                onClick={() => {
                  setStep("credentials");
                  setCode("");
                  setError("");
                }}
              >
                Volver
              </button>
            </form>
          )}

          {step === "setup" && (
            <form onSubmit={handleConfirmSetup} className="space-y-4">
              {qrDataUrl && (
                <img
                  src={qrDataUrl}
                  alt="QR 2FA"
                  className="mx-auto rounded-lg border border-white/20 bg-white p-2"
                />
              )}
              {totpSecret && (
                <p className="break-all text-center text-xs text-white/65">
                  Clave manual: <span className="font-mono text-white/90">{totpSecret}</span>
                </p>
              )}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-white/90">
                  Código de confirmación
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  className={`${inputClass} text-center tracking-widest`}
                  placeholder="000000"
                />
              </div>
              {error && (
                <p className="text-center text-sm text-rose-200">{error}</p>
              )}
              <button type="submit" disabled={loading} className={primaryBtnClass}>
                {loading ? "Activando..." : "Activar 2FA y entrar"}
              </button>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-xs tabular-nums text-white/40">
          {formatAppVersion()}
        </p>
      </div>
    </div>
  );
}
