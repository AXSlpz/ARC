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
  tableHeadClass,
} from "./CrmUi";
import { QuoteEditor } from "./QuoteEditor";
import {
  asQuoteStatus,
  crmFetch,
  errorMessage,
  formatDate,
  formatMxn,
  useCanWrite,
} from "./helpers";
import {
  QUOTE_STATUS_CLASS,
  QUOTE_STATUS_LABELS,
  type Quote,
  type QuoteStatus,
} from "./types";
import { ResidenteSearch } from "@/components/residentes/ResidenteSearch";

export function CotizacionesView() {
  const { canWrite } = useCanWrite();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<QuoteStatus | "">("");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    if (!hasLoaded.current) setLoading(true);
    else setIsSearching(true);
    setError("");
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    try {
      const data = await crmFetch<{ quotes: Quote[] }>(
        `/api/admin/crm/quotes?${params}`
      );
      setQuotes(data.quotes ?? []);
      hasLoaded.current = true;
    } catch (err) {
      setQuotes([]);
      setError(errorMessage(err, "No se pudieron cargar las cotizaciones."));
    } finally {
      setLoading(false);
      setIsSearching(false);
    }
  }, [search, status]);

  useEffect(() => {
    void load();
  }, [load]);

  function openQuote(id: string | null) {
    setEditingId(id);
    setEditorOpen(true);
  }

  return (
    <div className="flex h-full flex-col bg-[#f8f7fc]">
      <div className="shrink-0 space-y-3 px-4 pb-3 pt-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-violet-900">Cotizaciones</h2>
            <p className="mt-1 text-sm text-gray-500">
              Borradores, envío por WhatsApp y PDF.
            </p>
          </div>
          {canWrite ? (
            <button type="button" className={primaryBtn} onClick={() => openQuote(null)}>
              <span className="inline-flex items-center gap-1.5">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Nueva cotización
              </span>
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <ResidenteSearch
            value={search}
            onChange={setSearch}
            placeholder="Buscar por folio o prospecto…"
            isSearching={isSearching}
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as QuoteStatus | "")}
            className={`${fieldClass} w-auto`}
          >
            <option value="">Todos los estatus</option>
            {(Object.keys(QUOTE_STATUS_LABELS) as QuoteStatus[]).map((key) => (
              <option key={key} value={key}>
                {QUOTE_STATUS_LABELS[key]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="px-4 sm:px-6">
        <ErrorBanner message={error} onRetry={load} />
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden px-4 pb-4 sm:px-6">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm">
          {loading ? (
            <LoadingCard text="Cargando cotizaciones…" />
          ) : quotes.length === 0 ? (
            <EmptyCard text="No se encontraron cotizaciones" />
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-violet-100">
                    <th className={`${tableHeadClass} text-left`}>Folio</th>
                    <th className={`${tableHeadClass} text-left`}>Prospecto</th>
                    <th className={`${tableHeadClass} text-left`}>Estatus</th>
                    <th className={`${tableHeadClass} text-left`}>Total</th>
                    <th className={`${tableHeadClass} text-left hidden md:table-cell`}>
                      Vigencia
                    </th>
                    <th className={`${tableHeadClass} text-left hidden lg:table-cell`}>
                      Creada
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((quote) => {
                    const st = asQuoteStatus(quote.status);
                    return (
                      <tr
                        key={String(quote.id)}
                        {...clickableRowProps(
                          () => openQuote(String(quote.id)),
                          editingId === String(quote.id) && editorOpen
                        )}
                      >
                        <td className="px-4 py-3 font-mono font-medium text-gray-900">
                          {quote.number}
                        </td>
                        <td className="px-4 py-3 text-gray-800">
                          {quote.prospecto_name || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={QUOTE_STATUS_CLASS[st]}>
                            {QUOTE_STATUS_LABELS[st]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-gray-800">
                          {formatMxn(quote.total, quote.currency || "MXN")}
                        </td>
                        <td className="hidden px-4 py-3 text-gray-500 md:table-cell">
                          {formatDate(quote.valid_until)}
                        </td>
                        <td className="hidden px-4 py-3 text-gray-500 lg:table-cell">
                          {formatDate(quote.created_at)}
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

      <QuoteEditor
        open={editorOpen}
        quoteId={editingId}
        canWrite={canWrite}
        onClose={() => {
          setEditorOpen(false);
          setEditingId(null);
        }}
        onSaved={() => {
          void load();
        }}
      />
    </div>
  );
}
