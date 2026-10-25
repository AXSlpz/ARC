"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  CrmModal,
  EmptyCard,
  ErrorBanner,
  Field,
  LoadingCard,
  fieldClass,
  primaryBtn,
  secondaryBtn,
  tableHeadClass,
} from "./CrmUi";
import {
  crmFetch,
  errorMessage,
  formatMxn,
  pathId,
  sameId,
  toDateInput,
} from "./helpers";
import { MoneyInput } from "./MoneyInput";
import type { PriceList, Product } from "./types";

export function PriceListsPanel({ canWrite }: { canWrite: boolean }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [lists, setLists] = useState<PriceList[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("MXN");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [saving, setSaving] = useState(false);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [listData, productData] = await Promise.all([
        crmFetch<{ priceLists: PriceList[] }>("/api/admin/crm/price-lists"),
        crmFetch<{ products: Product[] }>("/api/admin/crm/products"),
      ]);
      setProducts(productData.products ?? []);
      const next = listData.priceLists ?? [];
      setLists(next);
      setSelectedId((current) => {
        if (current && next.some((list) => sameId(list.id, current))) {
          return current;
        }
        const fallback = next.find((list) => list.is_default) ?? next[0];
        return fallback ? String(fallback.id) : null;
      });
    } catch (err) {
      setLists([]);
      setError(errorMessage(err, "No se pudieron cargar las listas de precio."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => lists.find((list) => sameId(list.id, selectedId)) ?? null,
    [lists, selectedId]
  );

  useEffect(() => {
    if (!selected) {
      setPriceDrafts({});
      return;
    }
    const next: Record<string, number> = {};
    for (const item of selected.items ?? []) {
      next[String(item.product_id)] = Number(item.unit_price) || 0;
    }
    setPriceDrafts(next);
  }, [selected]);

  async function createList() {
    if (!name.trim()) {
      setError("El nombre de la lista es obligatorio.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await crmFetch("/api/admin/crm/price-lists", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          currency: (currency.trim() || "MXN").slice(0, 3).toUpperCase(),
          valid_from: validFrom || undefined,
          valid_until: validUntil || undefined,
        }),
      });
      setCreateOpen(false);
      setName("");
      setCurrency("MXN");
      setValidFrom("");
      setValidUntil("");
      await load();
    } catch (err) {
      setError(errorMessage(err, "No se pudo crear la lista."));
    } finally {
      setSaving(false);
    }
  }

  async function markDefault(list: PriceList) {
    setError("");
    try {
      await crmFetch(`/api/admin/crm/price-lists/${pathId(list.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ is_default: true }),
      });
      await load();
    } catch (err) {
      setError(errorMessage(err, "No se pudo marcar como predeterminada."));
    }
  }

  async function deleteList(list: PriceList) {
    if (!window.confirm(`¿Eliminar la lista «${list.name}»?`)) return;
    setError("");
    try {
      await crmFetch(`/api/admin/crm/price-lists/${pathId(list.id)}`, {
        method: "DELETE",
      });
      await load();
    } catch (err) {
      setError(errorMessage(err, "No se pudo eliminar la lista."));
    }
  }

  async function upsertPrice(productId: string, unitPrice: number) {
    if (!selected) return;
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setError("El precio debe ser un número mayor o igual a 0.");
      return;
    }
    const original = selected.items?.find((item) =>
      sameId(item.product_id, productId)
    );
    if (original && Number(original.unit_price) === unitPrice) return;
    if (!original && unitPrice === 0) return;
    setError("");
    try {
      await crmFetch(
        `/api/admin/crm/price-lists/${pathId(selected.id)}/items`,
        {
          method: "PUT",
          body: JSON.stringify({
            product_id: Number.isNaN(Number(productId))
              ? productId
              : Number(productId),
            unit_price: unitPrice,
          }),
        }
      );
      await load();
    } catch (err) {
      setError(errorMessage(err, "No se pudo guardar el precio."));
    }
  }

  if (loading) return <LoadingCard text="Cargando listas de precio…" />;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      <aside className="w-full shrink-0 overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm lg:w-[280px]">
        <div className="flex items-center justify-between border-b border-violet-100 px-3 py-3">
          <h3 className="text-sm font-semibold text-violet-900">Listas</h3>
          {canWrite ? (
            <button
              type="button"
              className={primaryBtn}
              onClick={() => setCreateOpen(true)}
            >
              Nueva
            </button>
          ) : null}
        </div>
        {lists.length === 0 ? (
          <p className="px-3 py-6 text-sm text-gray-400">
            No hay listas de precio.
          </p>
        ) : (
          <ul className="divide-y divide-violet-50">
            {lists.map((list) => (
              <li key={String(list.id)}>
                <button
                  type="button"
                  onClick={() => setSelectedId(String(list.id))}
                  className={`flex w-full items-start justify-between gap-2 px-3 py-3 text-left text-sm ${
                    sameId(list.id, selectedId)
                      ? "bg-violet-100 ring-1 ring-inset ring-violet-300"
                      : "[@media(hover:hover)]:hover:bg-violet-50/30"
                  }`}
                >
                  <span>
                    <span className="block font-medium text-gray-900">
                      {list.name}
                    </span>
                    <span className="text-xs text-gray-500">
                      {list.currency}
                    </span>
                  </span>
                  {list.is_default ? (
                    <Badge className="bg-violet-100 text-violet-800">
                      Default
                    </Badge>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="min-w-0 flex-1 space-y-3">
        <ErrorBanner message={error} onRetry={load} />
        {!selected ? (
          <EmptyCard text="Selecciona o crea una lista de precio." />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-violet-100 bg-white px-4 py-3 shadow-sm">
              <div>
                <h3 className="font-semibold text-violet-900">{selected.name}</h3>
                <p className="text-xs text-gray-500">
                  {selected.currency}
                  {selected.valid_from
                    ? ` · Desde ${toDateInput(selected.valid_from)}`
                    : ""}
                  {selected.valid_until
                    ? ` · Hasta ${toDateInput(selected.valid_until)}`
                    : ""}
                </p>
              </div>
              {canWrite ? (
                <div className="flex flex-wrap gap-2">
                  {!selected.is_default ? (
                    <button
                      type="button"
                      className={secondaryBtn}
                      onClick={() => void markDefault(selected)}
                    >
                      Marcar default
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 [@media(hover:hover)]:hover:bg-red-50"
                    onClick={() => void deleteList(selected)}
                  >
                    Borrar lista
                  </button>
                </div>
              ) : null}
            </div>
            {products.length === 0 ? (
              <EmptyCard text="Primero agrega productos para asignar precios." />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-violet-100">
                      <th className={`${tableHeadClass} text-left`}>SKU</th>
                      <th className={`${tableHeadClass} text-left`}>Producto</th>
                      <th className={`${tableHeadClass} text-left`}>Precio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => {
                      const key = String(product.id);
                      const draft = priceDrafts[key] ?? 0;
                      const hasPrice = selected.items?.some((item) =>
                        sameId(item.product_id, key)
                      );
                      return (
                        <tr key={key} className="border-b border-gray-50">
                          <td className="px-4 py-3 font-mono text-gray-700">
                            {product.sku}
                          </td>
                          <td className="px-4 py-3 text-gray-900">
                            {product.name}
                          </td>
                          <td className="px-4 py-3">
                            {canWrite ? (
                              <div className="max-w-[180px]">
                                <MoneyInput
                                  currency={selected.currency}
                                  value={draft}
                                  aria-label={`Precio de ${product.name}`}
                                  onValueChange={(unitPrice) =>
                                    setPriceDrafts((prev) => ({
                                      ...prev,
                                      [key]: unitPrice,
                                    }))
                                  }
                                  onBlurCommit={(unitPrice) => {
                                    void upsertPrice(key, unitPrice);
                                  }}
                                />
                              </div>
                            ) : (
                              <span>
                                {hasPrice
                                  ? formatMxn(draft, selected.currency)
                                  : "—"}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <CrmModal
        open={createOpen}
        title="Nueva lista de precio"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button
              type="button"
              className={secondaryBtn}
              onClick={() => setCreateOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={primaryBtn}
              disabled={saving}
              onClick={() => void createList()}
            >
              {saving ? "Creando…" : "Crear"}
            </button>
          </>
        }
      >
        <Field label="Nombre" htmlFor="crm-pl-name">
          <input
            id="crm-pl-name"
            className={fieldClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Moneda" htmlFor="crm-pl-currency">
          <input
            id="crm-pl-currency"
            className={fieldClass}
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          />
        </Field>
        <Field label="Vigente desde" htmlFor="crm-pl-from">
          <input
            id="crm-pl-from"
            type="date"
            className={fieldClass}
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
          />
        </Field>
        <Field label="Vigente hasta" htmlFor="crm-pl-until">
          <input
            id="crm-pl-until"
            type="date"
            className={fieldClass}
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />
        </Field>
      </CrmModal>
    </div>
  );
}
