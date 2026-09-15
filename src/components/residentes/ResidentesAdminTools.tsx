"use client";

import { useRef, useState } from "react";

export function ResidentesAdminTools() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    inserted: number;
    errors: { row: number; message: string }[];
    totalRows: number;
  } | null>(null);

  const handleExport = () => {
    window.open("/api/residentes/export", "_blank");
  };

  const handleTemplate = () => {
    window.open("/api/residentes/template", "_blank");
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/residentes/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setImportResult(data);
      } else {
        setImportResult({
          inserted: 0,
          errors: [{ row: 0, message: data.error ?? "Error al importar" }],
          totalRows: 0,
        });
      }
    } catch {
      setImportResult({
        inserted: 0,
        errors: [{ row: 0, message: "Error de conexión" }],
        totalRows: 0,
      });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Exportar CSV
        </button>

        <label className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 cursor-pointer">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {importing ? "Importando..." : "Importar CSV"}
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            disabled={importing}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
            }}
          />
        </label>

        <button
          type="button"
          onClick={handleTemplate}
          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800 hover:bg-violet-100"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          Machote Imp
        </button>
      </div>

      {importResult && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            importResult.errors.length > 0
              ? "bg-amber-50 border border-amber-200 text-amber-900"
              : "bg-green-50 border border-green-200 text-green-900"
          }`}
        >
          <p className="font-medium">
            {importResult.inserted} de {importResult.totalRows} registros
            importados correctamente.
          </p>
          {importResult.errors.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium">
                {importResult.errors.length} errores
              </summary>
              <ul className="mt-1 space-y-0.5 text-xs">
                {importResult.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>
                    Fila {e.row}: {e.message}
                  </li>
                ))}
                {importResult.errors.length > 20 && (
                  <li>...y {importResult.errors.length - 20} más</li>
                )}
              </ul>
            </details>
          )}
          <button
            type="button"
            onClick={() => setImportResult(null)}
            className="mt-2 text-xs underline"
          >
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
}
