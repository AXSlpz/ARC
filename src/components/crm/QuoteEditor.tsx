"use client";

import { useEffect, useMemo, useState } from "react";
import { CrmModal, ErrorBanner, primaryBtn, secondaryBtn } from "./CrmUi";
import {
  asNumericId,
  asQuoteStatus,
  crmFetch,
  errorMessage,
  formatMxn,
  pathId,
  pickEntity,
  quoteTotals,
  sameId,
  toDateInput,
} from "./helpers";
import { QuoteEditorMeta } from "./QuoteEditorMeta";
import { QuoteLinesTable, emptyQuoteLine } from "./QuoteLinesTable";
import type {
  PriceList,
  Product,
  Prospecto,
  ProspectosPage,
  Quote,
  QuoteLine,
} from "./types";

function unwrapQuote(data: unknown): Quote {
  const quote = pickEntity<Quote>(data, "quote");
  const extra = data && typeof data === "object" ? (data as Quote) : quote;
  return {
    ...quote,
    lines: quote.lines ?? extra.lines ?? [],
    prospecto: quote.prospecto ?? extra.prospecto ?? null,
  };
}

export function QuoteEditor({
  open,
  quoteId,
  canWrite,
  onClose,
  onSaved,
}: {
  open: boolean;
  quoteId: string | null;
  canWrite: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [prospectos, setProspectos] = useState<Prospecto[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [prospectoId, setProspectoId] = useState("");
  const [priceListId, setPriceListId] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [currency, setCurrency] = useState("MXN");
  const [status, setStatus] = useState("draft");
  const [number, setNumber] = useState("");
  const [lines, setLines] = useState<QuoteLine[]>([emptyQuoteLine()]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);

  const locked = status !== "draft" || !canWrite;
  const currentId = savedId ?? quoteId;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      setSavedId(null);
      try {
        const [prospectData, productData, listData] = await Promise.all([
          crmFetch<ProspectosPage>("/api/admin/crm/prospectos?limit=100&page=1"),
          crmFetch<{ products: Product[] }>("/api/admin/crm/products"),
          crmFetch<{ priceLists: PriceList[] }>("/api/admin/crm/price-lists"),
        ]);
        if (cancelled) return;
        setProspectos(prospectData.data ?? []);
        setProducts(productData.products ?? []);
        const lists = listData.priceLists ?? [];
        setPriceLists(lists);

        if (quoteId) {
          const detail = unwrapQuote(
            await crmFetch(`/api/admin/crm/quotes/${pathId(quoteId)}`)
          );
          if (cancelled) return;
          setProspectoId(detail.prospecto_id ? String(detail.prospecto_id) : "");
          setPriceListId(detail.price_list_id ? String(detail.price_list_id) : "");
          setValidUntil(toDateInput(detail.valid_until));
          setNotes(detail.notes ?? "");
          setCurrency(detail.currency || "MXN");
          setStatus(detail.status || "draft");
          setNumber(detail.number ?? "");
          setLines(detail.lines?.length ? detail.lines : [emptyQuoteLine()]);
        } else {
          const def = lists.find((list) => list.is_default);
          setProspectoId("");
          setPriceListId(def ? String(def.id) : "");
          setValidUntil("");
          setNotes("");
          setCurrency(def?.currency || "MXN");
          setStatus("draft");
          setNumber("");
          setLines([emptyQuoteLine()]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(errorMessage(err, "No se pudo abrir el editor."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, quoteId]);

  const selectedList = useMemo(
    () => priceLists.find((list) => sameId(list.id, priceListId)) ?? null,
    [priceLists, priceListId]
  );

  const totals = useMemo(() => quoteTotals(lines), [lines]);

  function priceFor(productId: string): number | null {
    const item = selectedList?.items?.find((row) =>
      sameId(row.product_id, productId)
    );
    return item ? Number(item.unit_price) : null;
  }

  function updateLine(index: number, patch: Partial<QuoteLine>) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line))
    );
  }

  function onProductChange(index: number, productId: string) {
    const product = products.find((p) => sameId(p.id, productId));
    const listed = productId ? priceFor(productId) : null;
    updateLine(index, {
      product_id: productId || null,
      name_snapshot: product?.name ?? "",
      sku_snapshot: product?.sku ?? "",
      unit_price: listed ?? 0,
    });
  }

  function onPriceListChange(nextId: string) {
    setPriceListId(nextId);
    const list = priceLists.find((item) => sameId(item.id, nextId));
    if (list?.currency) setCurrency(list.currency);
    setLines((prev) =>
      prev.map((line) => {
        if (!line.product_id) return line;
        const item = list?.items?.find((row) =>
          sameId(row.product_id, line.product_id)
        );
        return item ? { ...line, unit_price: Number(item.unit_price) } : line;
      })
    );
  }

  function payload() {
    return {
      prospecto_id: asNumericId(prospectoId),
      price_list_id: asNumericId(priceListId),
      valid_until: validUntil || undefined,
      notes: notes.trim() || undefined,
      currency: (currency || "MXN").slice(0, 3).toUpperCase(),
      lines: lines
        .filter((line) => line.name_snapshot.trim())
        .map((line) => ({
          product_id: asNumericId(line.product_id) ?? null,
          name_snapshot: line.name_snapshot.trim(),
          sku_snapshot: line.sku_snapshot || undefined,
          qty: Number(line.qty) || 0,
          unit_price: Number(line.unit_price) || 0,
          discount_pct: Number(line.discount_pct) || 0,
        })),
    };
  }

  async function persistDraft(): Promise<string | null> {
    if (!prospectoId) {
      setError("Selecciona un prospecto.");
      return null;
    }
    const body = payload();
    if (body.lines.length === 0) {
      setError("Agrega al menos una línea con nombre.");
      return null;
    }
    if (body.lines.some((line) => line.qty <= 0)) {
      setError("Cada línea debe tener cantidad mayor a 0.");
      return null;
    }
    if (!body.prospecto_id) {
      setError("Selecciona un prospecto.");
      return null;
    }
    if (currentId) {
      await crmFetch(`/api/admin/crm/quotes/${pathId(currentId)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      return currentId;
    }
    const created = await crmFetch<unknown>("/api/admin/crm/quotes", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const quote = unwrapQuote(created);
    if (quote.id == null) {
      setError("El servidor no devolvió el folio de la cotización.");
      return null;
    }
    setSavedId(String(quote.id));
    return String(quote.id);
  }

  async function saveDraft() {
    setSaving(true);
    setError("");
    try {
      if (await persistDraft()) onSaved();
    } catch (err) {
      setError(errorMessage(err, "No se pudo guardar el borrador."));
    } finally {
      setSaving(false);
    }
  }

  async function sendWhatsApp() {
    setSaving(true);
    setError("");
    try {
      const id = await persistDraft();
      if (!id) return;
      await crmFetch(`/api/admin/crm/quotes/${pathId(id)}/send`, { method: "POST" });
      setStatus("sent");
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "No se pudo enviar por WhatsApp."));
    } finally {
      setSaving(false);
    }
  }

  async function setQuoteStatus(next: "accepted" | "rejected") {
    if (!currentId) return;
    // TODO(ARC): al aceptar + trato ganado, pasar prospecto a Residente (cliente).
    // Ese flujo se configura más adelante.
    setSaving(true);
    setError("");
    try {
      await crmFetch(`/api/admin/crm/quotes/${pathId(currentId)}/status`, {
        method: "POST",
        body: JSON.stringify({ status: next }),
      });
      setStatus(next);
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "No se pudo actualizar el estatus."));
    } finally {
      setSaving(false);
    }
  }

  function openPdf() {
    if (!currentId) {
      setError("Guarda el borrador antes de descargar el PDF.");
      return;
    }
    window.open(`/api/admin/crm/quotes/${pathId(currentId)}/pdf`, "_blank");
  }

  return (
    <CrmModal
      open={open}
      size="xl"
      title={number ? `Cotización ${number}` : "Nueva cotización"}
      subtitle={
        status !== "draft"
          ? "Solo lectura: la cotización ya no está en borrador."
          : "Sin IVA. Totales calculados en el cliente."
      }
      onClose={onClose}
      footer={
        <>
          <button type="button" className={secondaryBtn} onClick={onClose}>
            Cerrar
          </button>
          {currentId ? (
            <button type="button" className={secondaryBtn} onClick={openPdf}>
              Descargar PDF
            </button>
          ) : null}
          {canWrite && asQuoteStatus(status) === "sent" ? (
            <>
              <button
                type="button"
                className={secondaryBtn}
                disabled={saving}
                onClick={() => void setQuoteStatus("accepted")}
              >
                Marcar aceptada
              </button>
              <button
                type="button"
                className={secondaryBtn}
                disabled={saving}
                onClick={() => void setQuoteStatus("rejected")}
              >
                Marcar rechazada
              </button>
            </>
          ) : null}
          {canWrite && status === "draft" ? (
            <>
              <button
                type="button"
                className={secondaryBtn}
                disabled={saving || loading}
                onClick={() => void saveDraft()}
              >
                {saving ? "Guardando…" : "Guardar borrador"}
              </button>
              <button
                type="button"
                className={primaryBtn}
                disabled={saving || loading}
                onClick={() => void sendWhatsApp()}
              >
                Enviar por WhatsApp
              </button>
            </>
          ) : null}
        </>
      }
    >
      <ErrorBanner message={error} />
      {loading ? (
        <p className="text-sm text-gray-400">Cargando editor…</p>
      ) : (
        <div className="space-y-4">
          <QuoteEditorMeta
            prospectos={prospectos}
            priceLists={priceLists}
            prospectoId={prospectoId}
            priceListId={priceListId}
            validUntil={validUntil}
            notes={notes}
            locked={locked}
            onProspecto={setProspectoId}
            onPriceList={onPriceListChange}
            onValidUntil={setValidUntil}
            onNotes={setNotes}
          />

          <QuoteLinesTable
            lines={lines}
            products={products}
            currency={currency}
            locked={locked}
            canEdit={canWrite && status === "draft"}
            onChange={updateLine}
            onProductChange={onProductChange}
            onRemove={(index) =>
              setLines((prev) =>
                prev.length === 1
                  ? [emptyQuoteLine()]
                  : prev.filter((_, i) => i !== index)
              )
            }
            onAdd={() => setLines((prev) => [...prev, emptyQuoteLine()])}
          />

          <div className="ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{formatMxn(totals.subtotal, currency)}</span>
            </div>
            <div className="flex justify-between font-semibold text-slate-900">
              <span>Total</span>
              <span>{formatMxn(totals.total, currency)}</span>
            </div>
          </div>
        </div>
      )}
    </CrmModal>
  );
}
