"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { AdminSignaturePad } from "@/components/admin/AdminSignaturePad";

const pressEase = [0.4, 0, 0.2, 1] as const;

function ProfileButton({
  className = "",
  disabled,
  onClick,
  children,
}: {
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      disabled={disabled}
      whileTap={reduce || disabled ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.12, ease: pressEase }}
      className={`inline-flex h-11 items-center justify-center rounded-xl px-3 text-sm font-medium motion-reduce:transform-none disabled:opacity-40 ${className}`}
      onClick={onClick}
    >
      {children}
    </motion.button>
  );
}

interface Profile {
  displayName: string;
  email: string;
  jobTitle: string;
  hasSignature: boolean;
  username: string;
}

export function AdminProfileDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signatureVersion, setSignatureVersion] = useState(0);
  const [hasSignature, setHasSignature] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [drawOpen, setDrawOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/profile", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { profile?: Profile; error?: string } | null;
        if (!res.ok || !data?.profile) throw new Error(data?.error || "No se pudo cargar el perfil");
        return data.profile;
      })
      .then((loaded) => {
        if (cancelled) return;
        setProfile(loaded);
        setDisplayName(loaded.displayName);
        setEmail(loaded.email);
        setJobTitle(loaded.jobTitle);
        setHasSignature(loaded.hasSignature);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo cargar el perfil");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || drawOpen) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose, drawOpen]);

  async function saveProfile() {
    setError("");
    setMessage("");
    if (newPassword && newPassword !== confirmPassword) {
      setError("La confirmación no coincide con la nueva contraseña.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          email,
          jobTitle,
          currentPassword,
          newPassword,
        }),
      });
      const data = (await res.json().catch(() => null)) as { profile?: Profile; error?: string } | null;
      if (!res.ok || !data?.profile) throw new Error(data?.error || "No se pudo guardar");
      setProfile(data.profile);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Perfil guardado.");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function uploadSignature(file: File | null) {
    if (!file) return;
    setError("");
    setMessage("");
    if (file.size > 1_500_000) {
      setError("La firma debe pesar menos de 1.5 MB.");
      return;
    }
    const body = new FormData();
    body.set("signature", file);
    const res = await fetch("/api/admin/profile/signature", { method: "POST", body });
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setError(data?.error || "No se pudo guardar la firma");
      return;
    }
    setHasSignature(true);
    setSignatureVersion((value) => value + 1);
    setMessage("Firma lista. Saldrá en las cartas de autorización.");
  }

  async function removeSignature() {
    setError("");
    const res = await fetch("/api/admin/profile/signature", { method: "DELETE" });
    if (!res.ok) {
      setError("No se pudo quitar la firma");
      return;
    }
    setHasSignature(false);
    setMessage("Firma quitada.");
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-8">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-xl"
        aria-label="Cerrar perfil"
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-profile-title"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0.12 : 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 max-h-[min(92vh,760px)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl motion-reduce:transform-none"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 id="admin-profile-title" className="text-lg font-semibold tracking-tight text-slate-900">
              Perfil
            </h2>
            <p className="text-sm text-slate-500">
              {profile ? `Usuario ${profile.username}` : "Cargando…"}
            </p>
          </div>
          <ProfileButton
            onClick={onClose}
            className="w-auto shrink-0 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          >
            Cerrar
          </ProfileButton>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="profile-name">
            Nombre
            <input
              id="profile-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700" htmlFor="profile-role">
            Puesto
            <input
              id="profile-role"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="Arq. responsable"
              className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700" htmlFor="profile-email">
            Correo
            <input
              id="profile-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700" htmlFor="profile-current">
              Contraseña actual
              <input
                id="profile-current"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700" htmlFor="profile-new">
              Nueva contraseña
              <input
                id="profile-new"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              />
            </label>
          </div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="profile-confirm">
            Confirmar nueva contraseña
            <input
              id="profile-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
            />
          </label>
          <ProfileButton
            onClick={() => void saveProfile()}
            disabled={saving || !profile}
            className="w-full bg-slate-900 text-white hover:bg-slate-800"
          >
            {saving ? "Guardando…" : "Guardar perfil"}
          </ProfileButton>
        </div>

        <div className="mt-2 border-t border-slate-200 pt-4">
          <p className="text-sm font-medium text-slate-800">Firma para las cartas</p>
          <p className="mt-1 text-sm leading-5 text-slate-500">
            Esta imagen es la que aparece al autorizar una solicitud.
          </p>
          <div className="mt-2 flex h-16 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">
            {hasSignature ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/admin/profile/signature?v=${signatureVersion}`}
                alt="Firma cargada"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="text-sm text-slate-400">Sin firma</span>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            aria-label="Cargar firma"
            onChange={(e) => {
              void uploadSignature(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <ProfileButton
              onClick={() => fileRef.current?.click()}
              className="border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
            >
              Subir imagen
            </ProfileButton>
            <ProfileButton
              onClick={() => setDrawOpen(true)}
              className="bg-violet-600 text-white hover:bg-violet-700"
            >
              Dibuja firma
            </ProfileButton>
          </div>
          <ProfileButton
            onClick={() => void removeSignature()}
            disabled={!hasSignature}
            className="mt-2 w-full border border-red-200 bg-white text-red-600 hover:bg-red-50"
          >
            Quitar firma
          </ProfileButton>
        </div>
        {drawOpen ? (
          <AdminSignaturePad
            onClose={() => setDrawOpen(false)}
            onConfirm={(file) => {
              setDrawOpen(false);
              void uploadSignature(file);
            }}
          />
        ) : null}

        <p className="mt-3 min-h-5 text-sm text-emerald-700" role="status">
          {message}
        </p>
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </motion.div>
    </div>,
    document.body
  );
}
