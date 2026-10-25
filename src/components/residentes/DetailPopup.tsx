"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export function DetailField({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-violet-400">{label}</p>
      <p className="mt-0.5 text-sm text-gray-900 tabular-nums">
        {value != null && value !== "" ? String(value) : "—"}
      </p>
    </div>
  );
}

export function DetailSection({
  title,
  columns = 2,
  children,
}: {
  title: string;
  columns?: 2 | 3;
  children: ReactNode;
}) {
  return (
    <div>
      <h4 className="mb-3 w-full border-b border-violet-200 pb-1.5 text-sm font-semibold uppercase tracking-wider text-violet-600">
        {title}
      </h4>
      <div
        className={
          columns === 3
            ? "grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3"
            : "grid grid-cols-2 gap-x-6 gap-y-3"
        }
      >
        {children}
      </div>
    </div>
  );
}

export function detailBtnPress(className: string): string {
  return `${className} touch-manipulation select-none transition-[transform,background-color,color] duration-100 [transition-timing-function:var(--ease-out)] active:scale-[0.97] motion-reduce:active:scale-100`;
}

export function DetailPopup({
  title,
  subtitle,
  headerExtra,
  onClose,
  children,
  footer,
  wide = true,
  size,
  layer = "base",
  flush = false,
}: {
  title: string;
  subtitle?: string;
  headerExtra?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  size?: "md" | "lg" | "xl";
  layer?: "base" | "form";
  flush?: boolean;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const root = dialogRef.current;
    const active = document.activeElement;
    if (root && (!(active instanceof Node) || !root.contains(active))) {
      root.focus();
    }

    const focusables = () => {
      if (!root) return [];
      return Array.from(
        root.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof Node && root && !root.contains(event.target)) {
        return;
      }
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = focusables();
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const widthClass =
    size === "xl"
      ? "max-w-[min(92rem,96vw)]"
      : size === "md" || (!wide && !size)
        ? "max-w-2xl"
        : "max-w-4xl";
  const zClass = layer === "form" ? "z-[80]" : "z-40";

  return (
    <div className={`fixed inset-0 ${zClass} flex items-center justify-center p-3 sm:p-6`}>
      <div
        className="arc-detail-scrim absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`arc-detail-modal relative flex max-h-[min(92dvh,calc(100dvh-1.5rem))] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none ${widthClass}`}
      >
        <div className="flex shrink-0 items-center justify-between bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-4">
          <div className="min-w-0">
            <h3 id={titleId} className="truncate text-lg font-semibold tracking-tight text-white">
              {title}
            </h3>
            {subtitle ? (
              <p className="truncate text-sm text-violet-200">{subtitle}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerExtra}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-white/80 transition-colors duration-100 touch-manipulation active:scale-[0.97] [@media(hover:hover)]:hover:bg-white/10 [@media(hover:hover)]:hover:text-white motion-reduce:active:scale-100"
              aria-label="Cerrar"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div
          className={
            flush
              ? "flex min-h-0 flex-1 flex-col overflow-hidden"
              : "min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5"
          }
        >
          {children}
        </div>

        {footer ? (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-violet-100 bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
