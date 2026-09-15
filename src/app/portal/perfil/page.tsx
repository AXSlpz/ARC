"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PortalUser } from "@/lib/portal/types";
import { fetchJson } from "@/components/portal/portalClient";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40";

const primaryBtnClass =
  "w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50 sm:w-auto";

export default function PortalProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Datos de la cuenta
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
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

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await fetchJson<{ user: PortalUser | null }>(
          "/api/portal/me",
        );
        if (!me.user) {
          router.replace("/portal");
          return;
        }
        const data = await fetchJson<{ user: PortalUser }>(
          "/api/portal/profile",
        );
        if (active) {
          setName(data.user.name ?? "");
          setEmail(data.user.email ?? "");
          setPhone(data.user.phone ?? "");
        }
      } catch (err) {
        if (active)
          setLoadError(
            err instanceof Error
              ? err.message
              : "No se pudo cargar tu perfil",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

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
      <div className="mb-5 flex items-center gap-3">
        <Link
          href="/portal/tickets"
          className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
        >
          ← Volver
        </Link>
      </div>

      <h1 className="mb-1 text-xl font-bold text-slate-900 sm:text-2xl">
        Mi perfil
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        Actualiza los datos de tu cuenta y tu contraseña.
      </p>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Cargando…
        </div>
      )}

      {!loading && loadError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {loadError}
        </div>
      )}

      {!loading && !loadError && (
        <div className="space-y-6">
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
      )}
    </div>
  );
}
