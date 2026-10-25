"use client";

import { compactFieldClass, fieldClass, secondaryBtn } from "./CrmUi";
import { MoneyInput } from "./MoneyInput";
import { formatMxn, lineTotal } from "./helpers";
import type { Product, QuoteLine } from "./types";

export function emptyQuoteLine(): QuoteLine {
  return {
    product_id: "",
    name_snapshot: "",
    sku_snapshot: "",
    qty: 1,
    unit_price: 0,
    discount_pct: 0,
  };
}

const compactCell = "w-16 px-1.5 py-2 align-top sm:w-[4.5rem]";
const priceCell = "w-[7.5rem] px-1.5 py-2 align-top sm:w-32";
const amountCell = "w-[7.5rem] px-1.5 py-2 align-top whitespace-nowrap";

export function QuoteLinesTable({
  lines,
  products,
  currency,
  locked,
  canEdit,
  onChange,
  onProductChange,
  onRemove,
  onAdd,
}: {
  lines: QuoteLine[];
  products: Product[];
  currency: string;
  locked: boolean;
  canEdit: boolean;
  onChange: (index: number, patch: Partial<QuoteLine>) => void;
  onProductChange: (index: number, productId: string) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
}) {
  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Producto</th>
              <th className={`${compactCell} font-medium`}>Cant.</th>
              <th className={`${priceCell} font-medium`}>Precio</th>
              <th className={`${compactCell} font-medium`}>Desc. %</th>
              <th className={`${amountCell} font-medium`}>Importe</th>
              {canEdit ? (
                <th className="w-12 px-1 py-2 font-medium" />
              ) : null}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index} className="border-t border-slate-100">
                <td className="min-w-0 px-3 py-2 align-top">
                  <select
                    className={fieldClass}
                    disabled={locked}
                    value={line.product_id ? String(line.product_id) : ""}
                    onChange={(e) => onProductChange(index, e.target.value)}
                  >
                    <option value="">Línea libre…</option>
                    {products.map((product) => (
                      <option key={String(product.id)} value={String(product.id)}>
                        {product.sku} · {product.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className={`${fieldClass} mt-2`}
                    disabled={locked}
                    placeholder="Nombre o descripción de la línea"
                    value={line.name_snapshot}
                    onChange={(e) =>
                      onChange(index, { name_snapshot: e.target.value })
                    }
                  />
                </td>
                <td className={compactCell}>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={compactFieldClass}
                    disabled={locked}
                    value={line.qty}
                    aria-label="Cantidad"
                    onChange={(e) =>
                      onChange(index, { qty: Number(e.target.value) })
                    }
                  />
                </td>
                <td className={priceCell}>
                  <MoneyInput
                    compact
                    currency={currency}
                    disabled={locked}
                    value={Number(line.unit_price) || 0}
                    aria-label="Precio"
                    onValueChange={(unit_price) => onChange(index, { unit_price })}
                  />
                </td>
                <td className={compactCell}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    className={compactFieldClass}
                    disabled={locked}
                    value={line.discount_pct}
                    aria-label="Descuento porcentaje"
                    onChange={(e) =>
                      onChange(index, { discount_pct: Number(e.target.value) })
                    }
                  />
                </td>
                <td className={`${amountCell} pt-3 text-right text-sm font-medium text-slate-900`}>
                  {formatMxn(
                    lineTotal(line.qty, line.unit_price, line.discount_pct),
                    currency
                  )}
                </td>
                {canEdit ? (
                  <td className="w-12 px-1 py-2 align-top">
                    <button
                      type="button"
                      className="pt-2 text-xs font-medium text-red-600 hover:underline"
                      onClick={() => onRemove(index)}
                    >
                      Quitar
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit ? (
        <button type="button" className={secondaryBtn} onClick={onAdd}>
          Agregar línea
        </button>
      ) : null}
    </>
  );
}
