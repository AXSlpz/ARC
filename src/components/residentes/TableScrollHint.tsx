"use client";

import { useEffect, useState, type RefObject } from "react";

interface TableScrollHintProps {
  scrollRef: RefObject<HTMLElement | null>;
  /** Cambia cuando se recarga la tabla (búsqueda, página, datos) para re-mostrar el hint. */
  triggerKey: string | number;
}

const HINT_MS = 1650; // ~3 blinks a 0.55s

export function TableScrollHint({ scrollRef, triggerKey }: TableScrollHintProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const checkAndShow = () => {
      if (cancelled) return;
      const hasOverflow = el.scrollHeight > el.clientHeight + 12;
      if (!hasOverflow) {
        setVisible(false);
        return;
      }
      setVisible(true);
      timeoutId = setTimeout(() => {
        if (!cancelled) setVisible(false);
      }, HINT_MS);
    };

    // Esperar layout (sticky header / flex) antes de medir overflow
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(checkAndShow);
    });

    const onScroll = () => {
      setVisible(false);
      if (timeoutId) clearTimeout(timeoutId);
    };
    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (timeoutId) clearTimeout(timeoutId);
      el.removeEventListener("scroll", onScroll);
    };
  }, [scrollRef, triggerKey]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2"
      aria-hidden
    >
      <div className="animate-blink-scroll-hint flex h-7 w-7 items-center justify-center rounded-full bg-violet-600/90 text-white shadow-md shadow-violet-300/50">
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
    </div>
  );
}
