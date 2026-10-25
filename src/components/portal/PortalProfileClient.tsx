"use client";

import { useEffect, useState } from "react";
import type { PortalUser } from "@/lib/portal/types";
import { PortalModuleBack } from "@/components/portal/PortalModuleBack";
import { fetchJson } from "@/components/portal/portalClient";
import { IneCapture, IneFieldsList } from "@/components/portal/IneCapture";
import type { IneFields } from "@/lib/portal/ine-fields";

interface PortalHome {
  id: number;
  developmentName: string;
  condominioName: string;
  numVivienda: number;
  status: string;
  statusLabel: string;
}

interface Development {
  id: number;
  name: string;
}

interface Condominio {
  id: number;
  name: string;
  prefijo: string;
  developmentId?: number | null;
}

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40";

const primaryBtnClass =
  "w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50 sm:w-auto";

export function PortalProfileClient({
  initialUser,
  justCreated = false,
}: {
  initialUser: PortalUser;
  justCreated?: boolean;
}) {
  const [name, setName] = useState(initialUser.name ?? "");
  const [email, setEmail] = useState(initialUser.email ?? "");
  const [phone, setPhone] = useState(initialUser.phone ?? "");
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [accountSuccess, setAccountSuccess] = useState("");

  // Cambio de contraseña
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  const [homes, setHomes] = useState<PortalHome[]>([]);
  const [homesLoading, setHomesLoading] = useState(true);
  const [addingHome, setAddingHome] = useState(false);
  const [homeError, setHomeError] = useState("");
  const [homeSuccess, setHomeSuccess] = useState("");
  const [developments, setDevelopments] = useState<Development[]>([]);
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [devId, setDevId] = useState("");
  const [condoId, setCondoId] = useState("");
  const [vivienda, setVivienda] = useState("");
  const [savingHome, setSavingHome] = useState(false);
  const [ineFields, setIneFields] = useState<IneFields | null>(null);
  const [ineNote, setIneNote] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchJson<{ homes: PortalHome[] }>("/api/portal/properties"),
      fetchJson<{ developments: Development[] }>("/api/portal/catalog/developments"),
      fetchJson<{ condominios: Condominio[] }>("/api/portal/catalog/condominios"),
    ])
      .then(([homesData, devs, condos]) => {
        if (!active) return;
        setHomes(homesData.homes);
        setDevelopments(devs.developments);
        setCondominios(condos.condominios);
      })
      .catch(() => {
        if (active) setHomeError("No se pudieron cargar tus viviendas.");
      })
      .finally(() => {
        if (active) setHomesLoading(false);
      });

    fetchJson<{ fields: IneFields | null }>("/api/portal/identity/current")
      .then((data) => {
        if (active) setIneFields(data.fields);
      })
      .catch(() => {
        if (active) setIneFields(null);
      });

    return () => {
      active = false;
    };
  }, []);

  const visibleCondos = devId
    ? condominios.filter(
        (c) => c.developmentId == null || String(c.developmentId) === devId
      )
    : [];

  const handleAddHome = async (e: React.FormEvent) => {
    e.preventDefault();
    setHomeError("");
    setHomeSuccess("");
    const num = Number(vivienda.trim());
    if (!devId || !condoId || !Number.isInteger(num) || num <= 0) {
      setHomeError("Completa desarrollo, condominio y número de vivienda.");
      return;
    }
    setSavingHome(true);
    try {
      const data = await fetchJson<{ homes: PortalHome[] }>("/api/portal/properties", {
        method: "POST",
        body: JSON.stringify({
          developmentId: Number(devId),
          condominioId: Number(condoId),
          numVivienda: num,
        }),
      });
      setHomes(data.homes);
      setDevId("");
      setCondoId("");
      setVivienda("");
      setAddingHome(false);
      setHomeSuccess(
        "Vivienda enviada. Queda pendiente de autorización por administración."
      );
    } catch (err) {
      setHomeError(
        err instanceof Error ? err.message : "No se pudo agregar la vivienda"
      );
    } finally {
      setSavingHome(false);
    }
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAccount(true);
    setAccountError("");
    setAccountSuccess("");
    try {
      const data = await fetchJson<{ user: PortalUser }>(
        "/api/portal/profile",
        {
          method: "PUT",
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim(),
          }),
        },
      );
      setName(data.user.name ?? "");
      setEmail(data.user.email ?? "");
      setPhone(data.user.phone ?? "");
      setAccountSuccess("Datos actualizados correctamente.");
    } catch (err) {
      setAccountError(
        err instanceof Error
          ? err.message
          : "No se pudieron guardar los cambios",
      );
    } finally {
      setSavingAccount(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");
    if (newPassword.length < 8) {
      setPasswordError("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("La confirmación no coincide con la nueva contraseña.");
      return;
    }
    setSavingPassword(true);
    try {
      await fetchJson<{ ok: true }>("/api/portal/profile/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess("Contraseña actualizada correctamente.");
    } catch (err) {
      setPasswordError(
        err instanceof Error
          ? err.message
          : "No se pudo cambiar la contraseña",
      );
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div>
      <div className="mb-5">
        <PortalModuleBack />
      </div>

      <h1 className="mb-1 text-xl font-bold text-slate-900 sm:text-2xl">
        Mi perfil
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        Actualiza tus datos y administra tus viviendas. Cada vivienda nueva debe ser autorizada.
      </p>

      {justCreated && (
        <p className="mb-6 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          Tu cuenta quedó creada. Puedes agregar más viviendas en esta pantalla.
          Cada una queda pendiente hasta que administración la autorice.
        </p>
      )}

      <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-sm font-semibold text-slate-800">Mis viviendas</h2>
            <p className="mt-1 text-sm text-slate-500">
              Si tienes otra propiedad, agrégala aquí. También debe ser autorizada.
            </p>

            {homesLoading ? (
              <p className="mt-4 text-sm text-slate-400">Cargando viviendas…</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {homes.map((home) => (
                  <li
                    key={home.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm"
                  >
                    <span className="text-slate-800">
                      {home.developmentName} · {home.condominioName} · {home.numVivienda}
                    </span>
                    <span className="shrink-0 text-xs font-medium text-slate-500">
                      {home.statusLabel}
                    </span>
                  </li>
                ))}
                {homes.length === 0 && (
                  <li className="text-sm text-slate-500">Aún no hay viviendas registradas.</li>
                )}
              </ul>
            )}

            {homeError && <p className="mt-3 text-sm text-rose-600">{homeError}</p>}
            {homeSuccess && <p className="mt-3 text-sm text-emerald-600">{homeSuccess}</p>}

            {!addingHome ? (
              <button
                type="button"
                onClick={() => {
                  setAddingHome(true);
                  setHomeError("");
                  setHomeSuccess("");
                }}
                className="mt-4 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
              >
                + Agrega más viviendas
              </button>
            ) : (
              <form onSubmit={handleAddHome} className="mt-4 space-y-4">
                <div>
                  <label htmlFor="home-dev" className="mb-1.5 block text-sm font-medium text-slate-700">
                    Desarrollo
                  </label>
                  <select
                    id="home-dev"
                    value={devId}
                    onChange={(e) => {
                      setDevId(e.target.value);
                      setCondoId("");
                      setVivienda("");
                    }}
                    className={inputClass}
                  >
                    <option value="">Selecciona un desarrollo</option>
                    {developments.map((d) => (
                      <option key={d.id} value={String(d.id)}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="home-condo" className="mb-1.5 block text-sm font-medium text-slate-700">
                    Condominio
                  </label>
                  <select
                    id="home-condo"
                    value={condoId}
                    onChange={(e) => {
                      setCondoId(e.target.value);
                      setVivienda("");
                    }}
                    className={inputClass}
                    disabled={!devId}
                  >
                    <option value="">
                      {devId ? "Selecciona un condominio" : "Primero selecciona un desarrollo"}
                    </option>
                    {visibleCondos.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.name} {c.prefijo ? `(${c.prefijo})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="home-viv" className="mb-1.5 block text-sm font-medium text-slate-700">
                    Número de vivienda
                  </label>
                  <input
                    id="home-viv"
                    inputMode="numeric"
                    value={vivienda}
                    onChange={(e) => setVivienda(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
                    className={inputClass}
                    disabled={!condoId}
                    placeholder={condoId ? "Ej. 42" : "Primero selecciona un condominio"}
                  />
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button type="submit" disabled={savingHome} className={primaryBtnClass}>
                    {savingHome ? "Enviando…" : "Enviar para autorización"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddingHome(false)}
                    className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </section>

          {/* Datos de la cuenta */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-sm font-semibold text-slate-800">
              Datos de la cuenta
            </h2>
            <form onSubmit={handleSaveAccount} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="profile-name"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Nombre completo
                </label>
                <input
                  id="profile-name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  placeholder="Tu nombre"
                />
              </div>
              <div>
                <label
                  htmlFor="profile-email"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Correo electrónico
                </label>
                <input
                  id="profile-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="tucorreo@ejemplo.com"
                />
              </div>
              <div>
                <label
                  htmlFor="profile-phone"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Teléfono
                </label>
                <input
                  id="profile-phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClass}
                  placeholder="10 dígitos"
                />
              </div>

              {accountError && (
                <p className="text-sm text-rose-600">{accountError}</p>
              )}
              {accountSuccess && (
                <p className="text-sm text-emerald-600">{accountSuccess}</p>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingAccount}
                  className={primaryBtnClass}
                >
                  {savingAccount ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </form>
            <div className="mt-6 border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-slate-800">Datos INE</h3>
              {ineFields ? (
                <div className="mt-3">
                  <IneFieldsList fields={ineFields} />
                  {ineFields.expired && (
                    <p className="mt-2 text-sm text-rose-600">Esta credencial está vencida.</p>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">
                  Todavía no hay una INE guardada. Cárgala en la sección de abajo.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-sm font-semibold text-slate-800">Tu INE</h2>
            <p className="mt-1 text-sm text-slate-500">
              Aquí se reemplaza tu credencial. Primero el frente y después el reverso. La nueva debe traer el mismo nombre, la misma CURP y la misma fecha de nacimiento.
            </p>
            {ineNote && <p className="mt-3 text-sm text-emerald-700">{ineNote}</p>}
            <div className="mt-4">
              <IneCapture
                purpose="profile"
                compact
                onReady={(result) => {
                  setIneFields(result.fields);
                  setIneNote("INE actualizada.");
                }}
                onClear={() => setIneNote("")}
              />
            </div>
          </section>

          {/* Cambiar contraseña */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-sm font-semibold text-slate-800">
              Cambiar contraseña
            </h2>
            <form onSubmit={handleChangePassword} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="current-password"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Contraseña actual
                </label>
                <input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className={inputClass}
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label
                  htmlFor="new-password"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Nueva contraseña
                </label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={inputClass}
                  placeholder="Mínimo 8 caracteres"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Usa al menos 8 caracteres.
                </p>
              </div>
              <div>
                <label
                  htmlFor="confirm-password"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Confirmar nueva contraseña
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClass}
                  placeholder="Repite la nueva contraseña"
                />
              </div>

              {passwordError && (
                <p className="text-sm text-rose-600">{passwordError}</p>
              )}
              {passwordSuccess && (
                <p className="text-sm text-emerald-600">{passwordSuccess}</p>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingPassword}
                  className={primaryBtnClass}
                >
                  {savingPassword ? "Actualizando…" : "Cambiar contraseña"}
                </button>
              </div>
            </form>
          </section>
        </div>
    </div>
  );
}
