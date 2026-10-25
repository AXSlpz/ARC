"use client";

import { useEffect, useRef, useState } from "react";

interface ResidenteSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isSearching?: boolean;
}

export function ResidenteSearch({
  value,
  onChange,
  placeholder = "Buscar en todos los campos: nombre, contactos, celular, vivienda...",
  isSearching = false,
}: ResidenteSearchProps) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const handleChange = (val: string) => {
    setLocal(val);
    if (timer.current) clearTimeout(timer.current);
    if (val === "") {
      onChange("");
      return;
    }
    timer.current = setTimeout(() => onChange(val), 200);
  };

  return (
    <div className="relative flex-1">
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-violet-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        type="search"
        value={local}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-violet-200 bg-white py-2 pl-10 pr-9 text-base text-gray-900 placeholder-gray-400 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400 sm:text-sm"
      />
      {isSearching && local && (
        <span className="absolute right-8 top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full border-2 border-violet-300 border-t-violet-600 animate-spin" />
      )}
      {local && (
        <button
          type="button"
          onClick={() => handleChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          aria-label="Limpiar búsqueda"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
