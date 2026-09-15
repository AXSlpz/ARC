"use client";

interface ListPaginationProps {
  page: number;
  totalPages: number;
  total: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
}

export function ListPagination({
  page,
  totalPages,
  total,
  itemLabel,
  onPageChange,
}: ListPaginationProps) {
  if (total === 0) return null;

  return (
    <div className="shrink-0 flex items-center justify-between border-t border-violet-100 bg-white px-4 py-3">
      <p className="text-xs text-gray-500">
        {total.toLocaleString("es-MX")} {itemLabel}
        {total !== 1 ? "s" : ""}
        {totalPages > 1 && (
          <span className="text-gray-400">
            {" "}
            · pág. {page} de {totalPages}
          </span>
        )}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="px-2 text-xs text-gray-500">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
