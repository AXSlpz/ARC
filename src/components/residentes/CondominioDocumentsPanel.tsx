"use client";

import { useCallback, useEffect, useState } from "react";

interface DocumentInfo {
  name: string;
  kind: "pdf" | "image";
  size: number;
  modifiedAt: number;
}

interface CondominioDocumentsPanelProps {
  condominioId: number;
  condominioName: string;
  onClose: () => void;
  onDocumentsChanged?: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CondominioDocumentsPanel({
  condominioId,
  condominioName,
  onClose,
  onDocumentsChanged,
}: CondominioDocumentsPanelProps) {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [error, setError] = useState("");
  const [lastIndexedAt, setLastIndexedAt] = useState<number | null>(null);
  const [indexChunks, setIndexChunks] = useState(0);
  const [indexSources, setIndexSources] = useState(0);

  const baseUrl = `/api/condominios/${condominioId}/documents`;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(baseUrl);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Error al cargar documentos");
      }
      const data = await res.json();
      setDocuments(Array.isArray(data.documents) ? data.documents : []);
      setLastIndexedAt(data.lastIndexedAt ?? null);
      setIndexChunks(data.chunks ?? 0);
      setIndexSources(data.sources ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(baseUrl, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al subir");
      await load();
      onDocumentsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!window.confirm(`¿Eliminar "${name}"?`)) return;
    setError("");
    try {
      const res = await fetch(
        `${baseUrl}?name=${encodeURIComponent(name)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al eliminar");
      await load();
      onDocumentsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
    }
  };

  const handleReindex = async () => {
    setReindexing(true);
    setError("");
    try {
      const res = await fetch(`${baseUrl}/reindex`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al re-indexar");
      setLastIndexedAt(data.generatedAt ?? null);
      setIndexChunks(data.chunks ?? 0);
      setIndexSources(data.sources ?? 0);
      onDocumentsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al re-indexar");
    } finally {
      setReindexing(false);
    }
  };

  const previewUrl = (name: string) =>
    `${baseUrl}/file?name=${encodeURIComponent(name)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-violet-100 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-violet-900">Documentos</h3>
            <p className="mt-0.5 truncate text-sm text-gray-500">
              {condominioName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            Cerrar
          </button>
        </div>

        <div className="shrink-0 space-y-3 border-b border-gray-100 px-5 py-4 sm:px-6">
          <p className="text-sm text-gray-500">
            Sube PDFs (hasta 20 MB) o imágenes JPEG/PNG/WEBP (hasta 10 MB) solo
            para este condominio. El bot usará únicamente estos archivos cuando
            atienda a residentes de {condominioName}.
          </p>

          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">
              {uploading ? "Subiendo..." : "Subir archivo"}
              <input
                type="file"
                accept=".pdf,image/jpeg,image/jpg,image/png,image/webp"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  void handleUpload(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => void handleReindex()}
              disabled={reindexing || documents.length === 0}
              className="rounded-lg border border-violet-200 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50"
            >
              {reindexing ? "Indexando..." : "Re-indexar documentos"}
            </button>
          </div>

          <div className="rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2.5 text-sm text-violet-900">
            {lastIndexedAt ? (
              <>
                <span className="font-medium">Última indexación:</span>{" "}
                {new Date(lastIndexedAt * 1000).toLocaleString("es-MX")}
                {indexChunks > 0 && (
                  <span className="text-violet-700">
                    {" "}
                    · {indexChunks} fragmentos de {indexSources} archivos
                  </span>
                )}
              </>
            ) : (
              <span className="text-violet-700">
                Aún no indexado. Sube archivos y pulsa &quot;Re-indexar
                documentos&quot;.
              </span>
            )}
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4 sm:px-6">
          {loading ? (
            <p className="py-10 text-center text-sm text-gray-400">Cargando...</p>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <svg
                className="mb-3 h-12 w-12 text-violet-200"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
              <p className="text-sm text-gray-500">
                No hay documentos en este condominio
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {documents.map((doc) => (
                <div
                  key={doc.name}
                  className="group flex flex-col overflow-hidden rounded-xl border border-violet-100 bg-violet-50/20 shadow-sm"
                >
                  <div className="relative flex aspect-[4/3] items-center justify-center bg-gradient-to-b from-violet-50 to-white">
                    {doc.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={previewUrl(doc.name)}
                        alt={doc.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-violet-500">
                        <svg
                          className="h-10 w-10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <path d="M14 2v6h6" />
                          <path d="M9 13h6M9 17h4" />
                        </svg>
                        <span className="text-xs font-semibold">PDF</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-2.5">
                    <p
                      className="truncate text-xs font-medium text-gray-800"
                      title={doc.name}
                    >
                      {doc.name}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {formatSize(doc.size)} ·{" "}
                      {new Date(doc.modifiedAt * 1000).toLocaleDateString("es-MX")}
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleDelete(doc.name)}
                      className="mt-auto self-start rounded-md px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
