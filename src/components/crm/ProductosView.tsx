"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge,
  EmptyCard,
  ErrorBanner,
  LoadingCard,
  clickableRowProps,
  fieldClass,
  primaryBtn,
  tabBtnClass,
  tableHeadClass,
} from "./CrmUi";
import { PriceListsPanel } from "./PriceListsPanel";
import { ProductoFormModal } from "./ProductoFormModal";
import {
  asProductStatus,
  crmFetch,
  errorMessage,
  useCanWrite,
} from "./helpers";
import {
  PRODUCT_STATUS_CLASS,
  PRODUCT_STATUS_LABELS,
  UNIT_LABELS,
  type Product,
  type ProductStatus,
  type ProductUnit,
} from "./types";
import { ResidenteSearch } from "@/components/residentes/ResidenteSearch";

type Tab = "productos" | "listas";

export function ProductosView() {
  const { canWrite } = useCanWrite();
  const [tab, setTab] = useState<Tab>("productos");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ProductStatus | "">("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    if (!hasLoaded.current) setLoading(true);
    else setIsSearching(true);
    setError("");
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    try {
      const data = await crmFetch<{ products: Product[] }>(
        `/api/admin/crm/products?${params}`
      );
      setProducts(data.products ?? []);
      hasLoaded.current = true;
    } catch (err) {
      setProducts([]);
      setError(errorMessage(err, "No se pudieron cargar los servicios."));
    } finally {
      setLoading(false);
      setIsSearching(false);
    }
  }, [search, status]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setOpenId(null);
    setFormOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setOpenId(String(product.id));
    setFormOpen(true);
  }

  async function handleDeleted() {
    setFormOpen(false);
    setEditing(null);
    setOpenId(null);
    await load();
  }

  return (
    <div className="flex h-full flex-col bg-[#f8f7fc]">
      <div className="shrink-0 px-4 pb-0 pt-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-violet-200">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setTab("productos")}
              className={tabBtnClass(tab === "productos")}
            >
              Servicios
            </button>
            <button
              type="button"
              onClick={() => setTab("listas")}
              className={tabBtnClass(tab === "listas")}
            >
              Listas de precio
            </button>
          </div>
          {canWrite && tab === "productos" ? (
            <button
              type="button"
              className={`${primaryBtn} mb-1.5`}
              onClick={openCreate}
            >
              <span className="inline-flex items-center gap-1.5">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Nuevo servicio
              </span>
            </button>
          ) : null}
        </div>
      </div>

      {tab === "listas" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6">
          <PriceListsPanel canWrite={canWrite} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 space-y-3 px-4 pb-3 pt-4 sm:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <ResidenteSearch
                value={search}
                onChange={setSearch}
                placeholder="Buscar por SKU o nombre…"
                isSearching={isSearching}
              />
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProductStatus | "")}
                className={`${fieldClass} w-auto`}
              >
                <option value="">Todos los estatus</option>
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
                <option value="discontinued">Descontinuado</option>
              </select>
            </div>
          </div>

          <div className="px-4 sm:px-6">
            <ErrorBanner message={error} onRetry={load} />
          </div>

          <div className="flex min-h-0 flex-1 overflow-hidden px-4 pb-4 sm:px-6">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm">
              {loading ? (
                <LoadingCard text="Cargando servicios…" />
              ) : products.length === 0 ? (
                <EmptyCard text="No se encontraron servicios" />
              ) : (
                <div className="min-h-0 flex-1 overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-violet-100">
                        <th className={`${tableHeadClass} text-left`}>SKU</th>
                        <th className={`${tableHeadClass} text-left`}>Nombre</th>
                        <th className={`${tableHeadClass} text-left hidden sm:table-cell`}>
                          Unidad
                        </th>
                        <th className={`${tableHeadClass} text-left`}>Estatus</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product) => {
                        const st = asProductStatus(product.status);
                        const unit = product.unit as ProductUnit;
                        return (
                          <tr
                            key={String(product.id)}
                            {...clickableRowProps(
                              () => openEdit(product),
                              openId === String(product.id)
                            )}
                          >
                            <td className="px-4 py-3 font-mono text-gray-700">
                              {product.sku}
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-900">
                              {product.name}
                            </td>
                            <td className="hidden px-4 py-3 text-gray-700 sm:table-cell">
                              {UNIT_LABELS[unit] ?? product.unit}
                            </td>
                            <td className="px-4 py-3">
                              <Badge className={PRODUCT_STATUS_CLASS[st]}>
                                {PRODUCT_STATUS_LABELS[st]}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ProductoFormModal
        open={formOpen}
        product={editing}
        canWrite={canWrite}
        onClose={() => {
          setFormOpen(false);
          setOpenId(null);
        }}
        onSaved={() => {
          void load();
        }}
        onDeleted={() => {
          void handleDeleted();
        }}
      />
    </div>
  );
}
