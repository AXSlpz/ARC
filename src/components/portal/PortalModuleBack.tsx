import Link from "next/link";

/** Flecha para salir de un módulo del portal y volver al menú principal. */
export function PortalModuleBack() {
  return (
    <Link
      href="/portal/inicio"
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
      aria-label="Volver al menú principal"
    >
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      Inicio
    </Link>
  );
}
