"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PortalUser } from "@/lib/portal/types";
import { fetchJson } from "@/components/portal/portalClient";
import { IneCapture } from "@/components/portal/IneCapture";

type AccessMode = "login" | "register";
type RegStep = 1 | 2 | 3;

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-400/40 disabled:bg-slate-50 disabled:text-slate-400";

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228L9.88 9.88m7.892 7.892L21 21m-3.228-3.228L14.12 14.12M9.88 9.88C9.337 10.423 9 11.173 9 12a3 3 0 003 3c.827 0 1.577-.337 2.12-.88M9.88 9.88L14.12 14.12" />
      </svg>
    );
  }
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  minLength,
  match,
  showMatchHint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder?: string;
  minLength?: number;
  match?: boolean;
  showMatchHint?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const hintId = `${id}-match`;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={match && showMatchHint ? hintId : undefined}
          className={`${inputClass} pr-11 ${
            match
              ? "border-emerald-400 text-emerald-600 caret-emerald-600 focus:border-emerald-500 focus:ring-emerald-400/40"
              : ""
          }`}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-700"
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible}
        >
          <EyeIcon open={visible} />
        </button>
      </div>
      {match && showMatchHint && (
        <p id={hintId} className="mt-1.5 text-xs font-medium text-emerald-600" role="status">
          Las contraseñas coinciden
        </p>
      )}
    </div>
  );
}

const primaryBtnClass =
  "relative z-10 inline-flex w-full items-center justify-center rounded-lg bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:opacity-100 sm:py-2.5";

const secondaryBtnClass =
  "relative z-10 inline-flex w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:py-2.5";

interface Development {
  id: number;
  name: string;
  slug: string;
}

interface Condominio {
  id: number;
  name: string;
  prefijo: string;
  developmentId?: number | null;
  developmentName?: string | null;
}

interface DwellingDraft {
  key: string;
  devId: string;
  condoId: string;
  vivienda: string;
}

const MAX_HOMES = 10;

export function PortalAccessClient({
  mode,
  initialDevelopments = [],
  initialCondominios = [],
}: {
  mode: AccessMode;
  initialDevelopments?: Development[];
  initialCondominios?: Condominio[];
}) {
  const router = useRouter();
  const tab = mode;

  // Login
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Registro — paso 1 (selección escalonada)
  const [step, setStep] = useState<RegStep>(1);
  const [developments, setDevelopments] = useState<Development[]>(initialDevelopments);
  const [condominios, setCondominios] = useState<Condominio[]>(initialCondominios);

  const [dwellings, setDwellings] = useState<DwellingDraft[]>([
    { key: "1", devId: "", condoId: "", vivienda: "" },
  ]);
  const [nextKey, setNextKey] = useState(2);

  // Registro — paso 2 (datos personales)
  const [regName, setRegName] = useState("");
  const [ineToken, setIneToken] = useState("");
  const [ineLater, setIneLater] = useState(false);
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(
    mode === "register" &&
      initialDevelopments.length === 0 &&
      initialCondominios.length === 0
  );
  const [catalogError, setCatalogError] = useState("");

  // ── Cargar sesión activa ────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), 8000);
    (async () => {
      try {
        const data = await fetchJson<{ user: PortalUser | null }>("/api/portal/me", {
          signal: ac.signal,
        });
        if (active && data.user) router.replace("/portal/inicio");
      } catch {
        // Sin sesión o timeout
      }
    })();
    return () => {
      active = false;
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [router]);

  // ── Catálogo de registro (SSR + refresco) ───────────────────────────────
  useEffect(() => {
    if (tab !== "register") return;
    const ac = new AbortController();
    if (initialDevelopments.length === 0 && initialCondominios.length === 0) {
      setCatalogLoading(true);
    }
    setCatalogError("");
    Promise.all([
      fetchJson<{ developments: Development[] }>("/api/portal/catalog/developments", {
        signal: ac.signal,
      }),
      fetchJson<{ condominios: Condominio[] }>("/api/portal/catalog/condominios", {
        signal: ac.signal,
      }),
    ])
      .then(([devs, condos]) => {
        if (ac.signal.aborted) return;
        setDevelopments(devs.developments);
        setCondominios(condos.condominios);
        if (devs.developments.length === 0) {
          setCatalogError(
            "No hay desarrollos disponibles. En el admin, asigna un desarrollo al condominio."
          );
        }
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        if (initialDevelopments.length > 0 || initialCondominios.length > 0) return;
        setCatalogError(
          err instanceof Error ? err.message : "No se pudo cargar el catálogo."
        );
      })
      .finally(() => {
        if (!ac.signal.aborted) setCatalogLoading(false);
      });
    return () => ac.abort();
  }, [tab, initialCondominios.length, initialDevelopments.length]);

  // ── Login ────────────────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await fetchJson<{ user: PortalUser }>("/api/portal/login", {
        method: "POST",
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      router.replace("/portal/inicio");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión");
      setLoading(false);
    }
  };

  const condosFor = (devId: string) => {
    if (!devId) return [];
    return condominios.filter(
      (c) => c.developmentId == null || String(c.developmentId) === devId
    );
  };

  const updateDwelling = (key: string, patch: Partial<DwellingDraft>) => {
    setDwellings((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
    setError("");
  };

  const addDwelling = () => {
    if (dwellings.length >= MAX_HOMES) return;
    setDwellings((rows) => [
      ...rows,
      { key: String(nextKey), devId: "", condoId: "", vivienda: "" },
    ]);
    setNextKey((n) => n + 1);
    setError("");
  };

  const removeDwelling = (key: string) => {
    setDwellings((rows) => (rows.length <= 1 ? rows : rows.filter((row) => row.key !== key)));
    setError("");
  };

  // ── Registro paso 1: validar selección y avanzar ──────────────────────────
  const handleStep1Next = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const seen = new Set<string>();
    for (let i = 0; i < dwellings.length; i++) {
      const row = dwellings[i]!;
      const label = dwellings.length > 1 ? `Vivienda ${i + 1}: ` : "";
      if (!row.devId) return setError(`${label}Selecciona un desarrollo.`);
      if (!row.condoId) return setError(`${label}Selecciona un condominio.`);
      const viviendaNum = Number(row.vivienda.trim());
      if (!row.vivienda.trim() || !Number.isInteger(viviendaNum) || viviendaNum <= 0) {
        return setError(`${label}Ingresa el número de vivienda.`);
      }
      if (viviendaNum > 999999) {
        return setError(`${label}El número de vivienda no es válido.`);
      }
      const key = `${row.devId}:${row.condoId}:${viviendaNum}`;
      if (seen.has(key)) return setError("No repitas la misma vivienda.");
      seen.add(key);
    }
    setStep(2);
  };

  // ── Registro paso 2: validar datos y avanzar al confirm ───────────────────
  const handleStep2Next = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (ineLater) {
      if (regName.trim().length < 2) return setError("Escribe tu nombre completo.");
    } else if (!ineToken || regName.trim().length < 2) {
      return setError("Confirma los datos de tu INE, o elige cargarla más adelante.");
    }
    if (!regEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail.trim())) {
      return setError("Correo electrónico inválido.");
    }
    if (!regPhone.trim() || regPhone.replace(/\D/g, "").length < 10) {
      return setError("Ingresa un teléfono válido (10 dígitos).");
    }
    if (regPassword.length < 8) {
      return setError("La contraseña debe tener al menos 8 caracteres.");
    }
    if (regPassword !== regConfirm) {
      return setError("Las contraseñas no coinciden.");
    }
    setStep(3);
  };

  // ── Registro paso 3: confirmar y enviar ───────────────────────────────────
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const properties = dwellings.map((row) => ({
        developmentId: Number(row.devId),
        condominioId: Number(row.condoId),
        numVivienda: Number(row.vivienda.trim()),
      }));
      const first = properties[0]!;
      await fetchJson<{ user: PortalUser }>("/api/portal/register", {
        method: "POST",
        body: JSON.stringify({
          ...first,
          properties,
          name: regName.trim(),
          ...(ineToken ? { ineToken } : {}),
          email: regEmail.trim().toLowerCase(),
          phone: regPhone.trim(),
          password: regPassword,
          confirmPassword: regConfirm,
        }),
      });
      router.replace("/portal/perfil?cuenta=nueva");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la cuenta");
      setLoading(false);
    }
  };

  const homeSummaries = dwellings.map((row) => {
    const dev = developments.find((d) => String(d.id) === row.devId)?.name ?? "";
    const condo = condominios.find((c) => String(c.id) === row.condoId);
    const condoLabel = condo
      ? `${condo.name}${condo.prefijo ? ` (${condo.prefijo})` : ""}`
      : "";
    return {
      key: row.key,
      dev,
      condo: condoLabel,
      vivienda: row.vivienda.trim() ? `Vivienda ${row.vivienda.trim()}` : "",
    };
  });
  const homesReady = dwellings.every(
    (row) => row.devId && row.condoId && row.vivienda.trim()
  );

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Bienvenido al portal ARC</h1>
        <p className="mt-1 text-sm text-slate-500">
          Consulta y da seguimiento a tus solicitudes.
        </p>
      </div>

      <div className="relative z-10 isolate rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
          <a
            href="/portal"
            className={`relative z-10 block rounded-md px-3 py-2.5 text-center text-sm font-medium transition-colors ${
              tab === "login"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Iniciar sesión
          </a>
          <a
            href="/portal/registro"
            className={`relative z-10 block rounded-md px-3 py-2.5 text-center text-sm font-medium transition-colors ${
              tab === "register"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Crear cuenta
          </a>
        </div>

        {/* ── LOGIN ─────────────────────────────────────────────────────── */}
        {tab === "login" && (
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
            <PasswordField
              id="login-password"
              label="Contraseña"
              value={loginPassword}
              onChange={setLoginPassword}
              autoComplete="current-password"
              placeholder="••••••••"
            />
            {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
            <button type="submit" disabled={loading} className={primaryBtnClass}>
              {loading ? "Entrando…" : "Iniciar sesión"}
            </button>
            <a href="/portal/registro" className={secondaryBtnClass}>
              Crear cuenta
            </a>
          </form>
        )}

        {/* ── REGISTRO ────────────────────────────────────────────────────── */}
        {tab === "register" && (
          <div>
            {/* Indicador de pasos */}
            <div className="mb-5 flex items-center gap-2">
              {([1, 2, 3] as RegStep[]).map((s) => (
                <div key={s} className="flex flex-1 items-center gap-1.5">
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                      s === step
                        ? "bg-violet-600 text-white"
                        : s < step
                          ? "bg-violet-100 text-violet-700"
                          : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {s < step ? "✓" : s}
                  </div>
                  <span className="text-xs text-slate-500">
                    {s === 1 ? "Tus viviendas" : s === 2 ? "Tus datos" : "Confirmar"}
                  </span>
                  {s < 3 && <div className="flex-1 border-t border-slate-200" />}
                </div>
              ))}
            </div>

            {/* Paso 1: selección escalonada */}
            {step === 1 && (
              <form onSubmit={handleStep1Next} className="space-y-4">
                <p className="text-sm text-slate-600">
                  Selecciona tu desarrollo, condominio y número de vivienda.
                  Si tienes más de una, agrégalas ahora o más adelante, tú eliges.
                </p>

                {dwellings.map((row, index) => {
                  const rowCondos = condosFor(row.devId);
                  return (
                    <div
                      key={row.key}
                      className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-800">
                          {dwellings.length > 1 ? `Vivienda ${index + 1}` : "Tu vivienda"}
                        </p>
                        {dwellings.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeDwelling(row.key)}
                            className="text-xs font-medium text-rose-600 hover:text-rose-700"
                          >
                            Quitar
                          </button>
                        )}
                      </div>

                      <div>
                        <label
                          htmlFor={`reg-dev-${row.key}`}
                          className="mb-1.5 block text-sm font-medium text-slate-700"
                        >
                          Desarrollo
                        </label>
                        <select
                          id={`reg-dev-${row.key}`}
                          name={`developmentId-${row.key}`}
                          autoComplete="off"
                          value={row.devId}
                          onChange={(e) =>
                            updateDwelling(row.key, {
                              devId: e.target.value,
                              condoId: "",
                              vivienda: "",
                            })
                          }
                          className={inputClass}
                          disabled={catalogLoading}
                        >
                          <option value="">
                            {catalogLoading ? "Cargando…" : "Selecciona un desarrollo"}
                          </option>
                          {developments.map((d) => (
                            <option key={d.id} value={String(d.id)}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                        {index === 0 && catalogError && !catalogLoading && (
                          <p role="alert" className="mt-1.5 text-sm text-rose-600">
                            {catalogError}
                          </p>
                        )}
                      </div>

                      <div>
                        <label
                          htmlFor={`reg-condo-${row.key}`}
                          className="mb-1.5 block text-sm font-medium text-slate-700"
                        >
                          Condominio
                        </label>
                        <select
                          id={`reg-condo-${row.key}`}
                          name={`condominioId-${row.key}`}
                          autoComplete="off"
                          value={row.condoId}
                          onChange={(e) =>
                            updateDwelling(row.key, { condoId: e.target.value, vivienda: "" })
                          }
                          className={inputClass}
                          disabled={!row.devId}
                        >
                          <option value="">
                            {!row.devId
                              ? "Primero selecciona un desarrollo"
                              : rowCondos.length === 0
                                ? "Sin condominios disponibles"
                                : "Selecciona un condominio"}
                          </option>
                          {rowCondos.map((c) => (
                            <option key={c.id} value={String(c.id)}>
                              {c.name} {c.prefijo ? `(${c.prefijo})` : ""}
                            </option>
                          ))}
                        </select>
                        {row.devId && rowCondos.length === 0 && (
                          <p className="mt-1.5 text-xs text-amber-700">
                            Este desarrollo no tiene condominios. En el admin, edita el condominio
                            y asígnalo a un desarrollo.
                          </p>
                        )}
                      </div>

                      <div>
                        <label
                          htmlFor={`reg-viv-${row.key}`}
                          className="mb-1.5 block text-sm font-medium text-slate-700"
                        >
                          Número de vivienda
                        </label>
                        <input
                          id={`reg-viv-${row.key}`}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          autoComplete="off"
                          value={row.vivienda}
                          onChange={(e) =>
                            updateDwelling(row.key, {
                              vivienda: e.target.value.replace(/[^\d]/g, "").slice(0, 6),
                            })
                          }
                          className={inputClass}
                          disabled={!row.condoId}
                          placeholder={
                            row.condoId ? "Ej. 42" : "Primero selecciona un condominio"
                          }
                        />
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={addDwelling}
                  disabled={dwellings.length >= MAX_HOMES}
                  className="text-sm font-semibold text-violet-700 hover:text-violet-800 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  + Agrega más viviendas
                </button>
                <p className="text-xs text-slate-500">
                  También puedes agregar más viviendas desde tu perfil cuando la cuenta esté
                  creada. Cada una, incluida la que agregues después, debe ser autorizada por
                  administración.
                </p>

                {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
                <button
                  type="submit"
                  disabled={!homesReady}
                  className={primaryBtnClass}
                >
                  Continuar →
                </button>
              </form>
            )}

            {/* Paso 2: datos personales */}
            {step === 2 && (
              <form onSubmit={handleStep2Next} className="space-y-4">
                {ineLater ? (
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-600">
                      Puedes cargar tu INE después, desde Mi perfil.
                    </p>
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
                        placeholder="Como aparece en tu identificación"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIneLater(false);
                        setError("");
                      }}
                      className="text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                    >
                      Cargar INE ahora
                    </button>
                  </div>
                ) : (
                  <>
                    <IneCapture
                      purpose="register"
                      onReady={(result) => {
                        setIneToken(result.token ?? "");
                        setRegName(result.fields.nombreCompleto);
                        setError("");
                      }}
                      onClear={() => {
                        setIneToken("");
                        setRegName("");
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIneLater(true);
                        setIneToken("");
                        setRegName("");
                        setError("");
                      }}
                      className="text-sm font-semibold text-slate-600 underline hover:text-slate-800"
                    >
                      Cargar más adelante
                    </button>
                    <p className="text-sm text-slate-600">
                      El nombre sale de la credencial. Si un dato no se lee bien, corrígelo. Después escribe correo, teléfono y contraseña.
                    </p>
                  </>
                )}

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
                    maxLength={15}
                  />
                </div>

                <PasswordField
                  id="reg-password"
                  label="Contraseña"
                  value={regPassword}
                  onChange={setRegPassword}
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                  minLength={8}
                  match={Boolean(regPassword && regConfirm && regPassword === regConfirm)}
                />

                <PasswordField
                  id="reg-confirm"
                  label="Confirmar contraseña"
                  value={regConfirm}
                  onChange={setRegConfirm}
                  autoComplete="new-password"
                  placeholder="Repite tu contraseña"
                  match={Boolean(regPassword && regConfirm && regPassword === regConfirm)}
                  showMatchHint
                />

                {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
                <div className="flex flex-col gap-2">
                  <button type="submit" className={primaryBtnClass}>
                    Revisar →
                  </button>
                  <button
                    type="button"
                    onClick={() => { setStep(1); setError(""); }}
                    className={secondaryBtnClass}
                  >
                    ← Atrás
                  </button>
                </div>
              </form>
            )}

            {/* Paso 3: confirmar */}
            {step === 3 && (
              <form onSubmit={handleRegister} className="space-y-4">
                <p className="text-sm font-medium text-slate-700">
                  Confirma tu información antes de crear la cuenta:
                </p>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm space-y-3">
                  {homeSummaries.map((home, index) => (
                    <div key={home.key} className="space-y-1">
                      {homeSummaries.length > 1 && (
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Vivienda {index + 1}
                        </p>
                      )}
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Desarrollo</span>
                        <span className="font-medium text-slate-800">{home.dev}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Condominio</span>
                        <span className="font-medium text-slate-800">{home.condo}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Vivienda</span>
                        <span className="font-medium text-slate-800">{home.vivienda}</span>
                      </div>
                    </div>
                  ))}
                  <hr className="border-slate-200" />
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">Nombre</span>
                    <span className="text-right font-medium text-slate-800">{regName}</span>
                  </div>
                  {ineLater && (
                    <p className="text-xs text-slate-500">La INE se carga después, en Mi perfil.</p>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-500">Correo</span>
                    <span className="font-medium text-slate-800">{regEmail}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Teléfono</span>
                    <span className="font-medium text-slate-800">{regPhone}</span>
                  </div>
                </div>

                <p className="text-xs text-slate-500">
                  Cada vivienda queda pendiente de autorización. Cuando tu cuenta esté creada
                  podrás agregar más desde tu perfil; esas también deben ser autorizadas.
                </p>

                {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
                <div className="flex flex-col gap-2">
                  <button type="submit" disabled={loading} className={primaryBtnClass}>
                    {loading ? "Creando cuenta…" : "Crear cuenta"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setStep(2); setError(""); }}
                    className={secondaryBtnClass}
                    disabled={loading}
                  >
                    ← Atrás
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
