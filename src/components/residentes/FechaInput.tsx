"use client";

import { useRef } from "react";
import { ddmmyyyyToIso, isoToDdmmyyyy } from "@/lib/date-format";

interface FechaInputProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}

export function FechaInput({ label, value, onChange }: FechaInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  };

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          type="date"
          lang="es-MX"
          value={ddmmyyyyToIso(value)}
          onChange={(e) => {
            const iso = e.target.value;
            onChange(iso ? isoToDdmmyyyy(iso) : null);
          }}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 pr-10 text-sm text-gray-900 focus:border-violet-400 focus:outline-none [color-scheme:light] [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
        />
        <button
          type="button"
          onClick={openPicker}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-violet-600 hover:text-violet-700"
          aria-label={`Abrir calendario de ${label}`}
          tabIndex={-1}
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
