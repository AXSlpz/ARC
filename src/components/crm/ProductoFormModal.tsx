"use client";

import { useEffect, useState } from "react";
import {
  CrmModal,
  ErrorBanner,
  Field,
  dangerBtn,
  fieldClass,
  primaryBtn,
  secondaryBtn,
} from "./CrmUi";
import { asProductStatus, crmFetch, errorMessage, pathId } from "./helpers";
import {
  PRODUCT_UNITS,
  UNIT_LABELS,
  type Product,
  type ProductStatus,
  type ProductUnit,
} from "./types";

const STATUSES: ProductStatus[] = ["active", "inactive", "discontinued"];

const STATUS_LABELS: Record<ProductStatus, string> = {
  active: "Activo",
  inactive: "Inactivo",
  discontinued: "Descontinuado",
};

export function ProductoFormModal({
  open,
  product,
  canWrite = true,
  onClose,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  product: Product | null;
  canWrite?: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState<ProductUnit>("pza");
  const [status, setStatus] = useState<ProductStatus>("active");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setSku(product?.sku ?? "");
    setName(product?.name ?? "");
    setDescription(product?.description ?? "");
    setUnit(
      PRODUCT_UNITS.includes(product?.unit as ProductUnit)
        ? (product?.unit as ProductUnit)
        : "pza"
    );
    setStatus(asProductStatus(product?.status));
    setError("");
    setSaving(false);
    setDeleting(false);
    setConfirmDelete(false);
  }, [open, product]);

  async function handleSave() {
    if (!sku.trim() || !name.trim()) {
      setError("SKU y nombre son obligatorios.");
      return;
    }
    setSaving(true);
    setError("");
    const body = {
      sku: sku.trim(),
      name: name.trim(),
      description: description.trim() || undefined,
      unit,
      status,
    };
    try {
      if (product) {
        await crmFetch(`/api/admin/crm/products/${pathId(product.id)}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await crmFetch("/api/admin/crm/products", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err, "No se pudo guardar el producto."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!product) return;
    setDeleting(true);
    setError("");
    try {
      await crmFetch(`/api/admin/crm/products/${pathId(product.id)}`, {
        method: "DELETE",
      });
      onDeleted?.();
      onClose();
    } catch (err) {
      setError(errorMessage(err, "No se pudo eliminar el producto."));
    } finally {
      setDeleting(false);
    }
  }

  const busy = saving || deleting;

  return (
    <CrmModal
      open={open}
      title={product ? "Editar servicio" : "Nuevo servicio"}
      onClose={onClose}
      footer={
        <>
          {canWrite && product ? (
            confirmDelete ? (
              <div className="mr-auto flex items-center gap-2 text-xs text-red-700">
                <span>¿Eliminar este producto?</span>
                <button
                  type="button"
                  className={dangerBtn}
                  disabled={busy}
                  onClick={() => void handleDelete()}
                >
                  {deleting ? "Eliminando…" : "Sí, eliminar"}
                </button>
                <button
                  type="button"
                  className={secondaryBtn}
                  disabled={busy}
                  onClick={() => setConfirmDelete(false)}
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={`${dangerBtn} mr-auto`}
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
              >
                Eliminar
              </button>
            )
          ) : null}
          <button type="button" className={secondaryBtn} onClick={onClose}>
            Cancelar
          </button>
          {canWrite ? (
            <button
              type="button"
              className={primaryBtn}
              onClick={handleSave}
              disabled={busy}
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          ) : null}
        </>
      }
    >
      <ErrorBanner message={error} />
      <Field label="SKU" htmlFor="crm-prod-sku">
        <input
          id="crm-prod-sku"
          className={fieldClass}
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          autoComplete="off"
          disabled={!canWrite}
        />
      </Field>
      <Field label="Nombre" htmlFor="crm-prod-name">
        <input
          id="crm-prod-name"
          className={fieldClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          disabled={!canWrite}
        />
      </Field>
      <Field label="Descripción" htmlFor="crm-prod-desc">
        <textarea
          id="crm-prod-desc"
          className={`${fieldClass} min-h-[80px]`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!canWrite}
        />
      </Field>
      <Field label="Unidad" htmlFor="crm-prod-unit">
        <select
          id="crm-prod-unit"
          className={fieldClass}
          value={unit}
          onChange={(e) => setUnit(e.target.value as ProductUnit)}
          disabled={!canWrite}
        >
          {PRODUCT_UNITS.map((u) => (
            <option key={u} value={u}>
              {UNIT_LABELS[u]} ({u})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Estatus" htmlFor="crm-prod-status">
        <select
          id="crm-prod-status"
          className={fieldClass}
          value={status}
          onChange={(e) => setStatus(e.target.value as ProductStatus)}
          disabled={!canWrite}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </Field>
    </CrmModal>
  );
}
