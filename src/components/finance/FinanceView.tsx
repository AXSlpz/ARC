"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  FinanceCategory,
  FinanceEntry,
  FinanceKind,
  MonthlyReport,
} from "@/lib/portal/types";
import { useToast } from "@/components/Toast";
import {
  currentMonth,
  fetchJson,
  formatCents,
  formatOccurredOn,
  today,
} from "./helpers";
import { CategoriesManager } from "./CategoriesManager";
import { MoneyInput } from "@/components/crm/MoneyInput";

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "income" | "expense" | "balance-positive" | "balance-negative";
}) {
  const valueClass =
    tone === "income"
      ? "text-emerald-700"
      : tone === "expense"
        ? "text-red-700"
        : tone === "balance-positive"
          ? "text-emerald-700"
          : "text-red-700";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

function NewEntryForm({
  onSaved,
  refreshKey,
}: {
  onSaved: () => void;
  refreshKey: number;
}) {
  const { toast } = useToast();
  const [kind, setKind] = useState<FinanceKind>("income");
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [amount, setAmount] = useState(0);
  const [occurredOn, setOccurredOn] = useState(today());
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchJson<{ categories: FinanceCategory[] }>(
      `/api/admin/finance/categories?kind=${kind}`
    )
      .then((data) => setCategories(data.categories))
      .catch(() => setCategories([]));
    setCategoryId("");
  }, [kind, refreshKey]);

  const handleSubmit = async () => {
    const amountNum = amount;
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast("Ingresa un monto válido mayor a 0.", "error");
      return;
    }
    if (!occurredOn) {
      toast("Selecciona una fecha.", "error");
      return;
    }
    setSaving(true);
    try {
      await fetchJson("/api/admin/finance/entries", {
        method: "POST",
        body: JSON.stringify({
          kind,
          categoryId: categoryId ? Number(categoryId) : undefined,
          amount: amountNum,
          description: description.trim() || undefined,
          occurredOn,
          method: method.trim() || undefined,
          reference: reference.trim() || undefined,
        }),
      });
      toast("Registro guardado.", "success");
      setAmount(0);
      setDescription("");
      setMethod("");
      setReference("");
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-800">Nuevo registro</h3>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Tipo
          </label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as FinanceKind)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="income">Ingreso</option>
            <option value="expense">Egreso</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Categoría
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Monto (MXN)
          </label>
          <MoneyInput
            value={amount}
            aria-label="Monto en pesos"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            onValueChange={setAmount}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Fecha
          </label>
          <input
            type="date"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Descripción
          </label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Método (opcional)
          </label>
          <input
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            placeholder="Efectivo, transferencia..."
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Referencia (opcional)
          </label>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          />
        </div>
      </div>
      <div className="mt-4">
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar registro"}
        </button>
      </div>
    </div>
  );
}

export function FinanceView() {
  const { toast } = useToast();
  const [month, setMonth] = useState(currentMonth());

  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showCategories, setShowCategories] = useState(false);
  const [categoriesRefreshKey, setCategoriesRefreshKey] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [reportData, entriesData] = await Promise.all([
        fetchJson<{ report: MonthlyReport }>(
          `/api/admin/finance/report?month=${month}`
        ),
        fetchJson<{ entries: FinanceEntry[] }>(
          `/api/admin/finance/entries?month=${month}`
        ),
      ]);
      setReport(reportData.report);
      setEntries(entriesData.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar finanzas");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const { incomeCategories, expenseCategories } = useMemo(() => {
    const income = (report?.byCategory ?? []).filter((c) => c.kind === "income");
    const expense = (report?.byCategory ?? []).filter(
      (c) => c.kind === "expense"
    );
    return { incomeCategories: income, expenseCategories: expense };
  }, [report]);

  const handleDeleteEntry = async (entry: FinanceEntry) => {
    if (!window.confirm("¿Eliminar este registro?")) return;
    try {
      await fetchJson(`/api/admin/finance/entries/${entry.id}`, {
        method: "DELETE",
      });
      toast("Registro eliminado.", "success");
      await loadData();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al eliminar", "error");
    }
  };

  const balanceCents = report?.balanceCents ?? 0;

  return (
    <div className="flex h-full flex-col bg-[var(--color-surface)]">
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto w-full max-w-5xl space-y-5">
          {/* Encabezado y selector de mes */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-slate-900">Finanzas</h2>
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600">Mes</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none"
              />
              <button
                onClick={() => setShowCategories((v) => !v)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                {showCategories ? "Ocultar categorías" : "Categorías"}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
              <button
                onClick={loadData}
                className="ml-2 font-medium underline hover:no-underline"
              >
                Reintentar
              </button>
            </div>
          )}

          {/* Tarjetas resumen */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SummaryCard
              label="Ingresos"
              value={formatCents(report?.totalIncomeCents ?? 0)}
              tone="income"
            />
            <SummaryCard
              label="Egresos"
              value={formatCents(report?.totalExpenseCents ?? 0)}
              tone="expense"
            />
            <SummaryCard
              label="Balance"
              value={formatCents(balanceCents)}
              tone={balanceCents >= 0 ? "balance-positive" : "balance-negative"}
            />
          </div>

          {showCategories && (
            <CategoriesManager
              onChanged={() => {
                setCategoriesRefreshKey((k) => k + 1);
                loadData();
              }}
            />
          )}

          {/* Desglose por categoría */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-emerald-700">
                Ingresos por categoría
              </h3>
              {incomeCategories.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">Sin ingresos.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {incomeCategories.map((c) => (
                    <li
                      key={`${c.categoryId ?? "none"}`}
                      className="flex justify-between gap-3 text-sm"
                    >
                      <span className="text-slate-700">{c.categoryName}</span>
                      <span className="font-medium text-emerald-700">
                        {formatCents(c.totalCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-red-700">
                Egresos por categoría
              </h3>
              {expenseCategories.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">Sin egresos.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {expenseCategories.map((c) => (
                    <li
                      key={`${c.categoryId ?? "none"}`}
                      className="flex justify-between gap-3 text-sm"
                    >
                      <span className="text-slate-700">{c.categoryName}</span>
                      <span className="font-medium text-red-700">
                        {formatCents(c.totalCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Nuevo registro */}
          <NewEntryForm onSaved={loadData} refreshKey={categoriesRefreshKey} />

          {/* Tabla de registros */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-800">
                Registros del mes
              </h3>
            </div>
            {loading ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">
                Cargando...
              </p>
            ) : entries.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-400">
                No hay registros en este mes.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Fecha</th>
                      <th className="px-4 py-3 font-medium">Tipo</th>
                      <th className="px-4 py-3 font-medium">Categoría</th>
                      <th className="px-4 py-3 font-medium">Descripción</th>
                      <th className="px-4 py-3 font-medium">Método</th>
                      <th className="px-4 py-3 text-right font-medium">Monto</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.id} className="border-t border-slate-100">
                        <td className="px-4 py-3 text-slate-600">
                          {formatOccurredOn(e.occurredOn)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              e.kind === "income"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {e.kind === "income" ? "Ingreso" : "Egreso"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {e.categoryName ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {e.description ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {e.method ?? "—"}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-medium ${
                            e.kind === "income"
                              ? "text-emerald-700"
                              : "text-red-700"
                          }`}
                        >
                          {e.kind === "income" ? "+" : "−"}
                          {formatCents(e.amountCents)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDeleteEntry(e)}
                            className="text-xs text-red-600 hover:text-red-800"
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
