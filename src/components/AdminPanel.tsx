"use client";

import { useEffect, useState } from "react";
import type {
  AdminSettings,
  AdminUser,
  ChatColors,
  DaySchedule,
  UserRole,
  WeekdayKey,
} from "@/lib/admin-settings-types";
import {
  WEEKDAY_KEYS,
  WEEKDAY_LABELS,
  DEFAULT_CHAT_COLORS,
  ROLE_LABELS,
  USER_ROLES,
} from "@/lib/admin-settings-types";
import { AdminFeatures } from "./AdminFeatures";
import type { WaLineStatus } from "./LineSetupScreen";
import { PasswordStrengthBar } from "./PasswordStrengthBar";
import { ResidentesAdminTools } from "./residentes/ResidentesAdminTools";
import { NotificationControls } from "./NotificationControls";
import { PortalClaimsAdmin } from "./admin/PortalClaimsAdmin";
import { PortalCatalogAdmin } from "./admin/PortalCatalogAdmin";
import { PortalReviewAdmin } from "./admin/PortalReviewAdmin";
import { AdminModulesPanel } from "./admin/AdminModulesPanel";
import { formatAllowedLineLabels } from "@/lib/line-display";
import {
  DEFAULT_INACTIVITY_FAREWELL_MESSAGE,
  INACTIVITY_TIMEOUT_MINUTES,
} from "@/lib/inactivity";

function LineConnectionPanel({ line }: { line: WaLineStatus }) {
  if (line.provider === "meta") {
    if (line.status === "connected") {
      return (
        <p className="text-xs text-emerald-700 mt-3">
          Conectada vía Meta API
          {line.phone ? ` · +${line.phone}` : ""}
        </p>
      );
    }
    return (
      <p className="text-xs text-blue-700 mt-3">
        Conectada vía Meta API · pendiente de token / registro en Meta
      </p>
    );
  }

  const showQr =
    (line.status === "qr" || line.status === "connecting") && line.qrPng;

  if (line.status === "connected") {
    return (
      <p className="text-xs text-emerald-700 mt-3">
        Línea activa{line.phone ? ` · +${line.phone}` : ""}
      </p>
    );
  }

  if (showQr) {
    return (
      <div className="mt-4 text-center">
        <img
          src={line.qrPng!}
          alt={`QR ${line.name}`}
          className={`mx-auto w-48 h-48 rounded-lg border border-gray-200 ${
            line.status === "connecting" ? "opacity-50" : ""
          }`}
        />
        <p className="text-xs text-gray-500 mt-2">
          Escanea con WhatsApp → Dispositivos vinculados
        </p>
        {line.status === "connecting" && (
          <p className="text-xs text-blue-600 mt-1">Conectando...</p>
        )}
      </div>
    );
  }

  if (line.status === "connecting") {
    return (
      <div className="mt-4 py-6 text-center">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-emerald-500 rounded-full animate-spin mx-auto" />
        <p className="text-xs text-gray-500 mt-3">Conectando...</p>
      </div>
    );
  }

  return (
    <div className="mt-4 py-6 text-center">
      <div className="w-8 h-8 border-4 border-gray-200 border-t-emerald-500 rounded-full animate-spin mx-auto" />
      <p className="text-xs text-gray-500 mt-3">Generando código QR...</p>
      <p className="text-xs text-gray-400 mt-1">Listo en unos segundos</p>
    </div>
  );
}

function LinePermissionCheckboxes({
  lines,
  value,
  onChange,
  disabled = false,
}: {
  lines: WaLineStatus[];
  value: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
}) {
  const toggle = (lineId: number) => {
    if (disabled) return;
    if (value.includes(lineId)) {
      if (value.length <= 1) return;
      onChange(value.filter((id) => id !== lineId));
      return;
    }
    onChange([...value, lineId].sort((a, b) => a - b));
  };

  if (lines.length === 0) {
    return (
      <p className="text-sm text-gray-400">No hay líneas configuradas.</p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">Líneas de atención</p>
      <div className="flex flex-wrap gap-3">
        {lines.map((line) => (
          <label
            key={line.id}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              disabled
                ? "border-gray-100 bg-gray-50 text-gray-400"
                : "border-gray-200 bg-white text-gray-800 cursor-pointer hover:border-emerald-300"
            }`}
          >
            <input
              type="checkbox"
              checked={value.includes(line.id)}
              disabled={disabled}
              onChange={() => toggle(line.id)}
              className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            {line.name}
          </label>
        ))}
      </div>
      {disabled && (
        <p className="text-xs text-gray-400">
          Los administradores tienen acceso a todas las líneas.
        </p>
      )}
    </div>
  );
}

interface AdminPanelProps {
  open: boolean;
  onClose: () => void;
  lines: WaLineStatus[];
  viewerRole?: UserRole;
  onLinesChange: () => Promise<void>;
  onSaved: (settings: AdminSettings) => void;
  onDisconnectLine: (lineId: number) => Promise<void>;
  onLogout: () => Promise<void>;
  onNavigateToCondominios?: () => void;
}

type TabId =
  | "general"
  | "hours"
  | "holidays"
  | "documents"
  | "appearance"
  | "ai"
  | "faq"
  | "tags"
  | "quickreplies"
  | "audit"
  | "system"
  | "users"
  | "modules"
  | "inactivity"
  | "portal";

const TABS: { id: TabId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "users", label: "Usuarios" },
  { id: "modules", label: "Módulos" },
  { id: "portal", label: "Portal ARC" },
  { id: "ai", label: "IA / Menú" },
  { id: "inactivity", label: "Cierre auto." },
  { id: "faq", label: "FAQ" },
  { id: "hours", label: "Horario" },
  { id: "holidays", label: "Festivos" },
  { id: "documents", label: "Documentos" },
  { id: "tags", label: "Etiquetas" },
  { id: "quickreplies", label: "Resp. rápidas" },
  { id: "appearance", label: "Apariencia" },
  { id: "audit", label: "Auditoría" },
  { id: "system", label: "Sistema" },
];

export function AdminPanel({
  open,
  onClose,
  lines,
  viewerRole = "admin",
  onLinesChange,
  onSaved,
  onDisconnectLine,
  onLogout,
  onNavigateToCondominios,
}: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [businessName, setBusinessName] = useState("ARC");
  const [timezone, setTimezone] = useState("America/Mexico_City");
  const [businessHours, setBusinessHours] = useState<
    AdminSettings["businessHours"]
  >({} as AdminSettings["businessHours"]);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [chatColors, setChatColors] = useState<ChatColors>(DEFAULT_CHAT_COLORS);
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [menuEnabled, setMenuEnabled] = useState(true);
  const [urgencyKeywords, setUrgencyKeywords] = useState<string[]>([]);
  const [inactivityFarewellMessage, setInactivityFarewellMessage] = useState(
    DEFAULT_INACTIVITY_FAREWELL_MESSAGE
  );
  const [inactivityAutoCloseEnabled, setInactivityAutoCloseEnabled] =
    useState(false);
  const [newHoliday, setNewHoliday] = useState("");

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [userRole, setUserRole] = useState<UserRole>("atencion");
  const [userAllowedLineIds, setUserAllowedLineIds] = useState<number[]>([]);
  const [creatingUser, setCreatingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("atencion");
  const [editAllowedLineIds, setEditAllowedLineIds] = useState<number[]>([]);
  const [editPassword, setEditPassword] = useState("");
  const [savingUser, setSavingUser] = useState(false);

  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnectLineId, setConfirmDisconnectLineId] = useState<
    number | null
  >(null);
  const [lineNames, setLineNames] = useState<Record<number, string>>({});
  const [savingLineName, setSavingLineName] = useState<number | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!open) return;

    setLoading(true);
    setError("");
    setMessage("");

    Promise.all([
      fetch("/api/admin/settings").then((res) => res.json()),
      fetch("/api/admin/users").then((res) => res.json()),
    ])
      .then(([settings, usersData]) => {
        setBusinessName(settings.businessName);
        setTimezone(settings.timezone);
        setBusinessHours(settings.businessHours);
        setHolidays(settings.holidays ?? []);
        setLogoUrl(settings.logoUrl ?? null);
        setChatColors(settings.chatColors ?? DEFAULT_CHAT_COLORS);
        setWelcomeMessage(settings.welcomeMessage ?? "");
        setMenuEnabled(settings.menuEnabled ?? true);
        setUrgencyKeywords(settings.urgencyKeywords ?? []);
        setInactivityFarewellMessage(
          settings.inactivityFarewellMessage ?? DEFAULT_INACTIVITY_FAREWELL_MESSAGE
        );
        setInactivityAutoCloseEnabled(settings.inactivityAutoCloseEnabled === true);
        setUsers(Array.isArray(usersData) ? usersData : []);
      })
      .catch(() => setError("No se pudo cargar la configuración"))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    const names: Record<number, string> = {};
    for (const line of lines) {
      names[line.id] = line.name;
    }
    setLineNames(names);
    const allLineIds = lines.map((line) => line.id);
    setUserAllowedLineIds((prev) =>
      prev.length > 0 ? prev.filter((id) => allLineIds.includes(id)) : allLineIds
    );
  }, [lines]);

  useEffect(() => {
    if (!open) return;
    const pendingConnection = lines.some((line) => line.status !== "connected");
    if (!pendingConnection) return;
    onLinesChange();
    const interval = setInterval(onLinesChange, 3_000);
    return () => clearInterval(interval);
  }, [open, lines, onLinesChange]);

  if (!open) return null;

  const selectableRoles = USER_ROLES.filter(
    (role) => viewerRole === "super_admin" || role !== "super_admin"
  );

  const isElevatedRole = (role: UserRole) =>
    role === "admin" || role === "super_admin";

  const roleBadgeClass = (role: UserRole) => {
    if (role === "super_admin") return "bg-rose-100 text-rose-800";
    if (role === "admin") return "bg-purple-100 text-purple-800";
    return "bg-blue-100 text-blue-800";
  };

  const updateDay = (day: WeekdayKey, patch: Partial<DaySchedule>) => {
    setBusinessHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], ...patch },
    }));
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          timezone,
          businessHours,
          holidays,
          chatColors,
          welcomeMessage,
          menuEnabled,
          urgencyKeywords,
          inactivityFarewellMessage,
          inactivityAutoCloseEnabled,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar");

      setMessage("Configuración guardada correctamente");
      onSaved(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (file: File | null) => {
    if (!file) return;

    setUploadingLogo(true);
    setError("");
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("logo", file);

      const res = await fetch("/api/admin/logo", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al subir logo");

      setLogoUrl(`${data.logoUrl}?t=${Date.now()}`);
      setMessage("Logo actualizado correctamente");

      const settingsRes = await fetch("/api/admin/settings");
      if (settingsRes.ok) onSaved(await settingsRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleAddHoliday = () => {
    if (!newHoliday || holidays.includes(newHoliday)) return;
    setHolidays((prev) => [...prev, newHoliday].sort());
    setNewHoliday("");
  };

  const startEditUser = (user: AdminUser) => {
    setEditingUserId(user.id);
    setEditDisplayName(user.displayName ?? "");
    setEditRole(user.role);
    setEditAllowedLineIds(user.allowedLineIds);
    setEditPassword("");
    setError("");
    setMessage("");
  };

  const cancelEditUser = () => {
    setEditingUserId(null);
    setEditDisplayName("");
    setEditRole("atencion");
    setEditAllowedLineIds([]);
    setEditPassword("");
  };

  const handleUpdateUser = async () => {
    if (editingUserId === null) return;

    setSavingUser(true);
    setError("");
    setMessage("");

    try {
      const body: Record<string, string | number[]> = {
        displayName: editDisplayName,
        role: editRole,
        allowedLineIds: editAllowedLineIds,
      };
      if (editPassword.trim()) {
        body.password = editPassword;
      }

      const res = await fetch(`/api/admin/users/${editingUserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al actualizar usuario");

      setUsers((prev) =>
        prev.map((user) => (user.id === editingUserId ? data : user))
      );
      cancelEditUser();
      setMessage("Usuario actualizado correctamente");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar usuario");
    } finally {
      setSavingUser(false);
    }
  };

  const handleCreateUser = async () => {
    setCreatingUser(true);
    setError("");
    setMessage("");

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          displayName,
          role: userRole,
          allowedLineIds: userAllowedLineIds,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al crear usuario");

      setUsers((prev) => [data, ...prev]);
      setUsername("");
      setDisplayName("");
      setPassword("");
      setUserRole("atencion");
      setUserAllowedLineIds(lines.map((line) => line.id));
      setMessage("Usuario creado correctamente");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear usuario");
    } finally {
      setCreatingUser(false);
    }
  };

  const handleDisconnectLine = async (lineId: number) => {
    setDisconnecting(true);
    setError("");
    try {
      await onDisconnectLine(lineId);
      setMessage(`Línea desconectada correctamente`);
    } catch {
      setError("Error al desconectar la línea");
    } finally {
      setDisconnecting(false);
      setConfirmDisconnectLineId(null);
    }
  };

  const handleSaveLineName = async (lineId: number) => {
    const name = lineNames[lineId]?.trim();
    if (!name) return;

    setSavingLineName(lineId);
    setError("");
    try {
      const res = await fetch(`/api/lines/${lineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Error al guardar");
      }
      setMessage("Nombre de línea actualizado");
      await onLinesChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar línea");
    } finally {
      setSavingLineName(null);
    }
  };

  const showSaveButton =
    activeTab !== "users" &&
    activeTab !== "documents" &&
    activeTab !== "system" &&
    activeTab !== "faq" &&
    activeTab !== "tags" &&
    activeTab !== "quickreplies" &&
    activeTab !== "audit" &&
    activeTab !== "portal" &&
    activeTab !== "modules";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 sm:px-6 py-3 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Administración
          </h2>
          <p className="text-sm text-gray-500 hidden sm:block">
            Configura el negocio, documentos y usuarios
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
        >
          Cerrar
        </button>
      </div>

      <div
        role="tablist"
        aria-label="Secciones de administración"
        className="flex flex-wrap gap-2 border-b border-gray-100 px-4 sm:px-6 py-2 shrink-0 overflow-x-auto"
      >
        {TABS.filter(
          (tab) => tab.id !== "modules" || viewerRole === "super_admin"
        ).map((tab) => (
          <button
            key={tab.id}
            id={`tab-btn-${tab.id}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-btn-${activeTab}`}
        tabIndex={-1}
        className="flex-1 overflow-y-auto min-h-0 px-4 sm:px-6 lg:px-8 py-5"
      >
        <div className="max-w-5xl mx-auto w-full">
          {loading ? (
            <p className="text-sm text-gray-500">Cargando configuración...</p>
          ) : (
            <>
              {activeTab === "general" && (
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre del negocio
                    </label>
                    <input
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                      placeholder="Ej. Condominio Paris"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Logo (portal captivo / login)
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                      Este logo se muestra en la pantalla de inicio de sesión y
                      queda disponible en{" "}
                      <code className="rounded bg-gray-100 px-1">/branding/logo.*</code>{" "}
                      para el portal captivo de la red.
                    </p>
                    <div className="flex items-center gap-4">
                      <div className="h-20 w-20 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
                        {logoUrl ? (
                          <img
                            src={logoUrl}
                            alt="Logo"
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <span className="text-xs text-gray-400">Sin logo</span>
                        )}
                      </div>
                      <div>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(e) =>
                            handleLogoUpload(e.target.files?.[0] ?? null)
                          }
                          className="text-sm"
                          disabled={uploadingLogo}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          PNG, JPG o WEBP. Máximo 2 MB.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Zona horaria
                    </label>
                    <input
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                    />
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <p className="text-sm font-medium text-gray-800 mb-1">
                      Sesión de administrador
                    </p>
                    <p className="text-xs text-gray-500 mb-3">
                      Cierra tu sesión del panel de administración.
                    </p>
                    {confirmLogout ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            setLoggingOut(true);
                            try {
                              await onLogout();
                            } finally {
                              setLoggingOut(false);
                              setConfirmLogout(false);
                            }
                          }}
                          disabled={loggingOut}
                          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {loggingOut ? "Cerrando..." : "Confirmar cierre"}
                        </button>
                        <button
                          onClick={() => setConfirmLogout(false)}
                          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-white"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmLogout(true)}
                        className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                      >
                        Cerrar sesión
                      </button>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "hours" && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500 mb-4">
                    Define cuándo el bot puede transferir solicitudes a un asesor
                    humano.
                  </p>
                  {WEEKDAY_KEYS.map((day) => {
                    const schedule = businessHours[day];
                    return (
                      <div
                        key={day}
                        className="grid grid-cols-[120px_80px_1fr_1fr] gap-3 items-center rounded-lg border border-gray-100 px-3 py-3"
                      >
                        <span className="text-sm font-medium text-gray-800">
                          {WEEKDAY_LABELS[day]}
                        </span>
                        <label className="flex items-center gap-2 text-sm text-gray-600">
                          <input
                            type="checkbox"
                            checked={schedule.enabled}
                            onChange={(e) =>
                              updateDay(day, { enabled: e.target.checked })
                            }
                          />
                          Activo
                        </label>
                        <input
                          type="time"
                          value={schedule.open}
                          disabled={!schedule.enabled}
                          onChange={(e) =>
                            updateDay(day, { open: e.target.value })
                          }
                          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-50 text-gray-900"
                        />
                        <input
                          type="time"
                          value={schedule.close}
                          disabled={!schedule.enabled}
                          onChange={(e) =>
                            updateDay(day, { close: e.target.value })
                          }
                          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-50 text-gray-900"
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {activeTab === "holidays" && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-500">
                    En estas fechas no habrá atención personalizada.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={newHoliday}
                      onChange={(e) => setNewHoliday(e.target.value)}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                    />
                    <button
                      onClick={handleAddHoliday}
                      className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white hover:opacity-90"
                    >
                      Agregar
                    </button>
                  </div>
                  {holidays.length === 0 ? (
                    <p className="text-sm text-gray-400">
                      No hay días festivos configurados.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {holidays.map((date) => (
                        <li
                          key={date}
                          className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2"
                        >
                          <span className="text-sm text-gray-800">
                            {date}
                          </span>
                          <button
                            onClick={() =>
                              setHolidays((prev) =>
                                prev.filter((item) => item !== date)
                              )
                            }
                            className="text-sm text-red-500 hover:text-red-700"
                          >
                            Quitar
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {activeTab === "documents" && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-violet-100 bg-violet-50/50 px-4 py-5">
                    <h3 className="text-sm font-semibold text-violet-900">
                      Documentos por condominio
                    </h3>
                    <p className="mt-2 text-sm text-gray-600">
                      Los PDFs e imágenes del bot ahora se gestionan por cada
                      condominio. Así un residente solo recibe información de su
                      propio desarrollo.
                    </p>
                    <p className="mt-2 text-sm text-gray-600">
                      Ve a{" "}
                      <span className="font-medium text-violet-800">
                        Residentes → Condominios
                      </span>{" "}
                      y pulsa{" "}
                      <span className="font-medium text-violet-800">
                        Documentos
                      </span>{" "}
                      en la fila del condominio.
                    </p>
                    {onNavigateToCondominios && (
                      <button
                        type="button"
                        onClick={onNavigateToCondominios}
                        className="mt-4 inline-flex items-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
                      >
                        Ir a Condominios
                      </button>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "appearance" && (
                <div className="space-y-5">
                  <p className="text-sm text-gray-500">
                    Personaliza los colores de los mensajes en el chat.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {(
                      [
                        ["assistant", "IA (azul por defecto)"],
                        ["human", "Humano (verde por defecto)"],
                        ["user", "Cliente (amarillo por defecto)"],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key}>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {label}
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={chatColors[key]}
                            onChange={(e) =>
                              setChatColors((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                            className="h-10 w-14 rounded border border-gray-300 cursor-pointer"
                          />
                          <input
                            type="text"
                            value={chatColors[key]}
                            onChange={(e) =>
                              setChatColors((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono text-gray-900"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-lg border border-gray-100 p-4 space-y-2">
                    <p className="text-xs text-gray-500 mb-3">Vista previa</p>
                    <div className="flex flex-col gap-2">
                      {(["user", "assistant", "human"] as const).map((role) => (
                        <div
                          key={role}
                          className="rounded-xl px-4 py-2 text-sm max-w-xs"
                          style={{
                            backgroundColor: chatColors[role],
                            color: "#fff",
                            alignSelf: role === "user" ? "flex-start" : "flex-end",
                          }}
                        >
                          {role === "user"
                            ? "Mensaje del cliente"
                            : role === "assistant"
                              ? "Respuesta IA"
                              : "Respuesta humano"}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {["faq", "tags", "quickreplies", "ai", "audit"].includes(
                activeTab
              ) && (
                <AdminFeatures
                  tab={activeTab as "faq" | "tags" | "quickreplies" | "ai" | "audit"}
                  welcomeMessage={welcomeMessage}
                  menuEnabled={menuEnabled}
                  urgencyKeywords={urgencyKeywords}
                  onAiSettingsChange={(v) => {
                    setWelcomeMessage(v.welcomeMessage);
                    setMenuEnabled(v.menuEnabled);
                    setUrgencyKeywords(v.urgencyKeywords);
                  }}
                />
              )}

              {activeTab === "inactivity" && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        Cierre automático
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        {inactivityAutoCloseEnabled
                          ? `Encendido. A los ${INACTIVITY_TIMEOUT_MINUTES} minutos sin respuesta se cierra la conversación y se envía el mensaje.`
                          : `Apagado. No se cierra la conversación ni se envía el mensaje a los ${INACTIVITY_TIMEOUT_MINUTES} minutos.`}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={inactivityAutoCloseEnabled}
                      aria-label="Cierre automático"
                      onClick={() =>
                        setInactivityAutoCloseEnabled((on) => !on)
                      }
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                        inactivityAutoCloseEnabled ? "bg-violet-600" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          inactivityAutoCloseEnabled ? "left-5" : "left-0.5"
                        }`}
                      />
                    </button>
                  </div>
                  <p className="text-sm text-gray-500">
                    El mensaje de abajo se usa solo cuando el cierre está
                    encendido, tras{" "}
                    <strong>{INACTIVITY_TIMEOUT_MINUTES} minutos</strong>{" "}
                    esperando respuesta (pregunta abierta, menú, archivo o
                    confirmación). No se envía tras un acuse o agradecimiento
                    final del bot. Guarda los cambios para que aplique.
                  </p>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Mensaje de cierre automático
                    </label>
                    <textarea
                      value={inactivityFarewellMessage}
                      onChange={(e) =>
                        setInactivityFarewellMessage(e.target.value)
                      }
                      rows={8}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                      placeholder={DEFAULT_INACTIVITY_FAREWELL_MESSAGE}
                    />
                    <p className="mt-1 text-xs text-gray-400">
                      Puedes usar {"{minutos}"} para insertar el tiempo de
                      inactividad ({INACTIVITY_TIMEOUT_MINUTES}).
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setInactivityFarewellMessage(
                        DEFAULT_INACTIVITY_FAREWELL_MESSAGE
                      )
                    }
                    className="text-sm text-emerald-600 hover:text-emerald-800"
                  >
                    Restaurar mensaje predeterminado
                  </button>
                </div>
              )}

              {activeTab === "system" && (
                <div className="space-y-5">
                  <div className="rounded-lg border border-gray-200 bg-white px-4 py-4">
                    <h3 className="text-sm font-semibold text-gray-900">
                      Líneas WhatsApp
                    </h3>
                    <p className="text-sm text-gray-500 mt-1 mb-4">
                      Administra el nombre y la conexión de cada línea. Escanea
                      el QR de cada línea que quieras activar.
                    </p>
                    <div className="space-y-4">
                      {lines.map((line) => (
                        <div
                          key={line.id}
                          className="rounded-lg border border-gray-100 bg-gray-50 p-4"
                        >
                          <div className="flex flex-wrap items-center gap-2 mb-3">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                line.status === "connected"
                                  ? "bg-emerald-500"
                                  : "bg-gray-300"
                              }`}
                            />
                            <span className="text-xs text-gray-500 capitalize">
                              {line.status === "connected"
                                ? "Conectada"
                                : line.status}
                            </span>
                            {line.phone && (
                              <span className="text-xs font-mono text-gray-600">
                                +{line.phone}
                              </span>
                            )}
                          </div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Nombre de la línea
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={lineNames[line.id] ?? line.name}
                              onChange={(e) =>
                                setLineNames((prev) => ({
                                  ...prev,
                                  [line.id]: e.target.value,
                                }))
                              }
                              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            />
                            <button
                              onClick={() => handleSaveLineName(line.id)}
                              disabled={savingLineName === line.id}
                              className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
                            >
                              {savingLineName === line.id ? "..." : "Guardar"}
                            </button>
                          </div>
                          <LineConnectionPanel line={line} />
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            {confirmDisconnectLineId === line.id ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-red-700">
                                  ¿Desconectar {line.name}?
                                </span>
                                <button
                                  onClick={() => handleDisconnectLine(line.id)}
                                  disabled={disconnecting}
                                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700 disabled:opacity-50"
                                >
                                  {disconnecting ? "..." : "Sí, desconectar"}
                                </button>
                                <button
                                  onClick={() => setConfirmDisconnectLineId(null)}
                                  className="rounded-lg bg-gray-200 px-3 py-1.5 text-xs text-gray-700"
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDisconnectLineId(line.id)}
                                className="text-xs text-red-600 hover:text-red-800 font-medium"
                              >
                                Desconectar esta línea
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-white px-4 py-4">
                    <h3 className="text-sm font-semibold text-gray-900">
                      Residentes
                    </h3>
                    <p className="text-sm text-gray-500 mt-1 mb-4">
                      Exporta, importa o descarga el machote CSV para cargar
                      residentes en lote.
                    </p>
                    <ResidentesAdminTools />
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-white px-4 py-4">
                    <h3 className="text-sm font-semibold text-gray-900">
                      Alertas y sonido
                    </h3>
                    <p className="text-sm text-gray-500 mt-1 mb-4">
                      Configura avisos de mensajes nuevos y solicitudes de
                      asesor.
                    </p>
                    <NotificationControls enabled variant="embedded" />
                  </div>
                </div>
              )}

              {activeTab === "modules" && viewerRole === "super_admin" && (
                <AdminModulesPanel />
              )}

              {activeTab === "portal" && (
                <div className="space-y-6">
                  {/* ── Bandeja de verificación de cuentas ─────────────── */}
                  <div className="rounded-lg border border-gray-200 bg-white px-4 py-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-1">
                      Verificación de cuentas del portal
                    </h3>
                    <p className="text-sm text-gray-500 mb-4">
                      Revisa solicitudes de registro pendientes, aprueba o rechaza el acceso
                      de propietarios al portal de clientes.
                    </p>
                    <PortalClaimsAdmin />
                  </div>

                  {/* ── Catálogo de desarrollos / viviendas ────────────── */}
                  <div className="rounded-lg border border-gray-200 bg-white px-4 py-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-1">
                      Catálogo de desarrollos y viviendas
                    </h3>
                    <p className="text-sm text-gray-500 mb-4">
                      Vincula condominios a desarrollos e importa viviendas en lote
                      (CSV). Las viviendas importadas aparecen en el formulario de registro.
                    </p>
                    <PortalCatalogAdmin />
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-white px-4 py-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-1">
                      Modificaciones y firma del comité
                    </h3>
                    <p className="text-sm text-gray-500 mb-4">
                      Activa las solicitudes de cada desarrollo, incluidas las que
                      no vienen encendidas de origen, y registra quién firma la resolución.
                    </p>
                    <PortalReviewAdmin />
                  </div>
                </div>
              )}

              {activeTab === "users" && (
                <div className="space-y-5">
                  <p className="text-sm text-gray-500">
                    <strong>{ROLE_LABELS.super_admin}:</strong> acceso completo;
                    puede borrar conversaciones.{" "}
                    <strong>{ROLE_LABELS.admin}:</strong> administración sin
                    borrar conversaciones.{" "}
                    <strong>{ROLE_LABELS.atencion}:</strong> atiende chats; sin
                    etiquetas ni apariencia.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      id="new-user-username"
                      aria-label="Nombre de usuario"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Usuario"
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                    />
                    <input
                      id="new-user-displayname"
                      aria-label="Nombre visible"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Nombre visible"
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                    />
                    <div>
                      <input
                        id="new-user-password"
                        aria-label="Contraseña (mínimo 8 caracteres)"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Contraseña (mín. 8 chars)"
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                      />
                      <PasswordStrengthBar password={password} />
                    </div>
                    <select
                      id="new-user-role"
                      aria-label="Rol del usuario"
                      value={userRole}
                      onChange={(e) => {
                        const nextRole = e.target.value as UserRole;
                        setUserRole(nextRole);
                        if (isElevatedRole(nextRole)) {
                          setUserAllowedLineIds(lines.map((line) => line.id));
                        }
                      }}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                    >
                      {selectableRoles.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <LinePermissionCheckboxes
                    lines={lines}
                    value={userAllowedLineIds}
                    onChange={setUserAllowedLineIds}
                    disabled={isElevatedRole(userRole)}
                  />

                  <button
                    onClick={handleCreateUser}
                    disabled={creatingUser}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {creatingUser ? "Creando..." : "Crear usuario"}
                  </button>

                  {users.length === 0 ? (
                    <p className="text-sm text-gray-400">No hay usuarios creados.</p>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-gray-100">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-left text-gray-500">
                          <tr>
                            <th className="px-4 py-2">Usuario</th>
                            <th className="px-4 py-2">Nombre</th>
                            <th className="px-4 py-2">Rol</th>
                            <th className="px-4 py-2">Líneas</th>
                            <th className="px-4 py-2">Creado</th>
                            <th className="px-4 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {users.map((user) => (
                            <tr
                              key={user.id}
                              className="border-t border-gray-100"
                            >
                              {editingUserId === user.id ? (
                                <td colSpan={6} className="px-4 py-4 bg-gray-50">
                                  <div className="space-y-3">
                                    <p className="text-sm font-medium text-gray-800">
                                      Editando: {user.username}
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                      <input
                                        value={editDisplayName}
                                        onChange={(e) =>
                                          setEditDisplayName(e.target.value)
                                        }
                                        placeholder="Nombre visible"
                                        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                                      />
                                      <select
                                        value={editRole}
                                        onChange={(e) => {
                                          const nextRole = e.target.value as UserRole;
                                          setEditRole(nextRole);
                                          if (isElevatedRole(nextRole)) {
                                            setEditAllowedLineIds(
                                              lines.map((line) => line.id)
                                            );
                                          }
                                        }}
                                        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                                      >
                                        {selectableRoles.map((role) => (
                                          <option key={role} value={role}>
                                            {ROLE_LABELS[role]}
                                          </option>
                                        ))}
                                      </select>
                                      <div>
                                        <input
                                          type="password"
                                          value={editPassword}
                                          onChange={(e) =>
                                            setEditPassword(e.target.value)
                                          }
                                          placeholder="Nueva contraseña (opcional)"
                                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                                        />
                                        <PasswordStrengthBar password={editPassword} />
                                      </div>
                                    </div>
                                    <LinePermissionCheckboxes
                                      lines={lines}
                                      value={editAllowedLineIds}
                                      onChange={setEditAllowedLineIds}
                                      disabled={isElevatedRole(editRole)}
                                    />
                                    <div className="flex gap-2">
                                      <button
                                        onClick={handleUpdateUser}
                                        disabled={savingUser}
                                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
                                      >
                                        {savingUser ? "Guardando..." : "Guardar"}
                                      </button>
                                      <button
                                        onClick={cancelEditUser}
                                        className="rounded-lg bg-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-300"
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              ) : (
                                <>
                                  <td className="px-4 py-2 font-medium text-gray-800">
                                    {user.username}
                                  </td>
                                  <td className="px-4 py-2 text-gray-600">
                                    {user.displayName ?? "—"}
                                  </td>
                                  <td className="px-4 py-2">
                                    <span
                                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${roleBadgeClass(user.role)}`}
                                    >
                                      {ROLE_LABELS[user.role]}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2 text-gray-600">
                                    {isElevatedRole(user.role)
                                      ? "Todas"
                                      : formatAllowedLineLabels(
                                          user.allowedLineIds,
                                          new Map(
                                            Object.entries(lineNames).map(
                                              ([id, name]) => [Number(id), name]
                                            )
                                          )
                                        )}
                                  </td>
                                  <td className="px-4 py-2 text-gray-500">
                                    {new Date(
                                      user.createdAt * 1000
                                    ).toLocaleDateString("es-MX")}
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    <button
                                      onClick={() => startEditUser(user)}
                                      className="text-sm text-emerald-600 hover:text-emerald-800"
                                    >
                                      Editar
                                    </button>
                                  </td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="border-t border-gray-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-4 shrink-0 bg-white">
        {/* role="status" para que lectores de pantalla anuncien cambios de estado */}
        <div className="text-sm" role="status" aria-live="polite" aria-atomic="true">
          {message && (
            <span className="text-emerald-600">
              {message}
            </span>
          )}
          {error && (
            <span className="text-red-600">{error}</span>
          )}
        </div>
        {showSaveButton && (
          <button
            onClick={handleSaveSettings}
            disabled={saving || loading}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        )}
      </div>
    </div>
  );
}
