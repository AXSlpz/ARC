"use client";

import { useCallback, useEffect, useState } from "react";

interface ModuleRow {
  key: string;
  label: string;
  super_admin: boolean;
  admin: boolean;
  lockedForSuperAdmin: boolean;
}

export function AdminModulesPanel() {
  const [rows, setRows] = useState<ModuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingKey, setSavingKey] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/modules", { cache: "no-store" });
      const data = (await res.json()) as { modules?: ModuleRow[]; error?: string };
      if (!res.ok) {
        setError(data.error || "No se pudo cargar");
        return;
      }
      setRows(data.modules ?? []);
    } catch {
      setError("No se pudo cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(role: "super_admin" | "admin", row: ModuleRow) {
    const enabled = role === "super_admin" ? !row.super_admin : !row.admin;
    if (role === "super_admin" && row.lockedForSuperAdmin && !enabled) return;
    setSavingKey(`${role}:${row.key}`);
    setError("");
    try {
      const res = await fetch("/api/admin/modules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, module: row.key, enabled }),
      });
      const data = (await res.json()) as { modules?: ModuleRow[]; error?: string };
      if (!res.ok) {
        setError(data.error || "No se pudo guardar");
        return;
      }
      setRows(data.modules ?? []);
      window.dispatchEvent(new Event("arc-modules-changed"));
    } catch {
      setError("No se pudo guardar");
    } finally {
      setSavingKey("");
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Cargando módulos...</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-900">Módulos</h3>
        <p className="mt-1 text-sm text-gray-500">
          Prende o apaga cada módulo del panel para los dos perfiles de la
          aplicación. Super admin eres tú. Admin son los encargados de ARC.
        </p>
        <p className="mt-1 text-sm text-gray-500">
          Las cuentas de residentes no están aquí. Se guardan en el módulo{" "}
          <span className="font-medium text-gray-700">Clientes / Residentes</span>.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3 font-medium">Módulo</th>
              <th className="px-4 py-3 font-medium">Super admin</th>
              <th className="px-4 py-3 font-medium">Admin</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-900">{row.label}</td>
                <td className="px-4 py-3">
                  <ModuleSwitch
                    on={row.super_admin}
                    locked={row.lockedForSuperAdmin}
                    busy={savingKey === `super_admin:${row.key}`}
                    label={`${row.label} para super admin`}
                    onClick={() => void toggle("super_admin", row)}
                  />
                </td>
                <td className="px-4 py-3">
                  <ModuleSwitch
                    on={row.admin}
                    busy={savingKey === `admin:${row.key}`}
                    label={`${row.label} para admin`}
                    onClick={() => void toggle("admin", row)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ModuleSwitch({
  on,
  locked,
  busy,
  label,
  onClick,
}: {
  on: boolean;
  locked?: boolean;
  busy: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={locked || busy}
      title={locked ? "Siempre prendido para que puedas volver a entrar" : undefined}
      onClick={onClick}
      className={`relative h-6 w-11 rounded-full transition-colors ${
        on ? "bg-violet-600" : "bg-gray-300"
      } ${locked || busy ? "cursor-not-allowed opacity-70" : ""}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          on ? "left-5" : "left-0.5"
        }`}
      />
    </button>
  );
}
