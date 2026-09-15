"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  loadNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/notification-preferences";
import {
  getNotificationPermission,
  requestNotificationPermission,
  showBrowserNotification,
  type NotificationPermissionState,
} from "@/lib/browser-notifications";
import {
  initNotificationSounds,
  playAdvisorRequestNotification,
  playMessageNotification,
} from "@/lib/notification-sounds";

function BellIcon() {
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
        d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0a3 3 0 0 1-6 0"
      />
    </svg>
  );
}

interface NotificationControlsProps {
  enabled: boolean;
  variant?: "popover" | "embedded";
}

function NotificationSettingsPanel({
  prefs,
  permission,
  desktopBlocked,
  updatePrefs,
  handleEnableDesktop,
  handleTest,
}: {
  prefs: NotificationPreferences;
  permission: NotificationPermissionState;
  desktopBlocked: boolean;
  updatePrefs: (patch: Partial<NotificationPreferences>) => void;
  handleEnableDesktop: () => Promise<void>;
  handleTest: () => Promise<void>;
}) {
  return (
    <>
      <div className="space-y-3">
        <label className="flex items-center justify-between gap-3 text-sm text-slate-700">
          <span>Sonido</span>
          <input
            type="checkbox"
            checked={prefs.soundEnabled}
            onChange={(e) => updatePrefs({ soundEnabled: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600"
          />
        </label>

        <label className="flex items-center justify-between gap-3 text-sm text-slate-700">
          <span>Mensajes nuevos</span>
          <input
            type="checkbox"
            checked={prefs.notifyMessages}
            onChange={(e) => updatePrefs({ notifyMessages: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600"
          />
        </label>

        <label className="flex items-center justify-between gap-3 text-sm text-slate-700">
          <span>Solicitud de asesor</span>
          <input
            type="checkbox"
            checked={prefs.notifyAdvisor}
            onChange={(e) => updatePrefs({ notifyAdvisor: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600"
          />
        </label>

        <label className="flex items-center justify-between gap-3 text-sm text-slate-700">
          <span>Notificaciones del sistema</span>
          <input
            type="checkbox"
            checked={prefs.desktopEnabled && permission === "granted"}
            disabled={desktopBlocked}
            onChange={async (e) => {
              if (e.target.checked) {
                await handleEnableDesktop();
              } else {
                updatePrefs({ desktopEnabled: false });
              }
            }}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 disabled:opacity-40"
          />
        </label>
      </div>

      {permission === "default" && (
        <button
          type="button"
          onClick={handleEnableDesktop}
          className="mt-4 w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          Activar notificaciones
        </button>
      )}

      {permission === "denied" && (
        <p className="mt-3 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">
          Las notificaciones están bloqueadas en el navegador. Habilítalas en
          ajustes del sitio.
        </p>
      )}

      <button
        type="button"
        onClick={handleTest}
        className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Probar sonido y aviso
      </button>
    </>
  );
}

export function NotificationControls({
  enabled,
  variant = "popover",
}: NotificationControlsProps) {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES
  );
  const [permission, setPermission] =
    useState<NotificationPermissionState>("default");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPrefs(loadNotificationPreferences());
    setPermission(getNotificationPermission());
  }, []);

  useEffect(() => {
    if (!enabled) return;
    initNotificationSounds();
  }, [enabled]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const updatePrefs = useCallback((patch: Partial<NotificationPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveNotificationPreferences(next);
      window.dispatchEvent(new CustomEvent("wa:notification-prefs-changed"));
      return next;
    });
  }, []);

  const handleEnableDesktop = async () => {
    initNotificationSounds();
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === "granted") {
      updatePrefs({ desktopEnabled: true });
    }
  };

  const handleTest = async () => {
    initNotificationSounds();
    if (prefs.soundEnabled) playMessageNotification();
    if (prefs.desktopEnabled && permission === "granted") {
      await showBrowserNotification({
        title: "Prueba de notificación",
        body: "Sonido y avisos del sistema están activos.",
        tag: "wa-test",
      });
    }
  };

  if (!enabled) return null;

  const desktopBlocked =
    permission === "denied" || permission === "unsupported";

  if (variant === "embedded") {
    return (
      <NotificationSettingsPanel
        prefs={prefs}
        permission={permission}
        desktopBlocked={desktopBlocked}
        updatePrefs={updatePrefs}
        handleEnableDesktop={handleEnableDesktop}
        handleTest={handleTest}
      />
    );
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative inline-flex items-center justify-center rounded-lg border p-2 transition-colors ${
          open
            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
            : "border-slate-200 text-slate-600 hover:bg-slate-50"
        }`}
        title="Notificaciones y sonido"
        aria-label="Notificaciones y sonido"
        aria-expanded={open}
      >
        <BellIcon />
        {permission === "granted" && prefs.soundEnabled && (
          <span
            className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500"
            aria-hidden="true"
          />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
          <p className="text-sm font-semibold text-slate-900">Alertas</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Avisos de mensajes nuevos y solicitudes de asesor.
          </p>

          <div className="mt-4">
            <NotificationSettingsPanel
              prefs={prefs}
              permission={permission}
              desktopBlocked={desktopBlocked}
              updatePrefs={updatePrefs}
              handleEnableDesktop={handleEnableDesktop}
              handleTest={handleTest}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function NotificationPermissionBanner({ enabled }: { enabled: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      return;
    }
    const prefs = loadNotificationPreferences();
    setVisible(
      prefs.desktopEnabled && getNotificationPermission() === "default"
    );
  }, [enabled]);

  if (!visible) return null;

  return (
    <div className="shrink-0 border-b border-emerald-100 bg-emerald-50 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs sm:text-sm text-emerald-900">
        Activa notificaciones para enterarte de mensajes aunque la app esté en
        segundo plano.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={async () => {
            initNotificationSounds();
            const result = await requestNotificationPermission();
            if (result === "granted") {
              saveNotificationPreferences({
                ...loadNotificationPreferences(),
                desktopEnabled: true,
              });
              window.dispatchEvent(new CustomEvent("wa:notification-prefs-changed"));
            }
            setVisible(false);
          }}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          Activar
        </button>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs text-emerald-800 hover:bg-emerald-100"
        >
          Ahora no
        </button>
      </div>
    </div>
  );
}
