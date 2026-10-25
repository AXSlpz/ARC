"use client";

import { useEffect, useState } from "react";
import type {
  AuthMeResponse,
  CrmId,
  ProductStatus,
  QuoteLine,
  QuoteStatus,
} from "./types";

export async function crmFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body != null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  if (init?.signal) {
    if (init.signal.aborted) ac.abort();
    else init.signal.addEventListener("abort", () => ac.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      signal: ac.signal,
      cache: "no-store",
      headers: {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("El servidor tardó demasiado en responder");
    }
    throw new Error("No se pudo conectar con el servidor");
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Error ${res.status}`;
    throw new Error(message);
  }

  return data as T;
}

export function pathId(id: CrmId): string {
  return encodeURIComponent(String(id));
}

export function sameId(a: CrmId | null | undefined, b: CrmId | null | undefined): boolean {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      /* texto plano */
    }
    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function parseTagsInput(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function pickEntity<T>(data: unknown, key: string): T {
  if (data && typeof data === "object" && key in data) {
    const nested = (data as Record<string, unknown>)[key];
    if (nested != null && typeof nested === "object") {
      return nested as T;
    }
  }
  return data as T;
}

export function roundMoney(n: number): number {
  return Math.round(((Number.isFinite(n) ? n : 0) + Number.EPSILON) * 100) / 100;
}

export function lineTotal(qty: number, price: number, discountPct: number): number {
  const safeQty = Number.isFinite(qty) ? qty : 0;
  const safePrice = Number.isFinite(price) ? price : 0;
  const pct = Math.min(100, Math.max(0, Number.isFinite(discountPct) ? discountPct : 0));
  return roundMoney(safeQty * safePrice * (1 - pct / 100));
}

export function quoteTotals(lines: Pick<QuoteLine, "qty" | "unit_price" | "discount_pct">[]): {
  subtotal: number;
  total: number;
} {
  let subtotal = 0;
  let total = 0;
  for (const line of lines) {
    const qty = Number.isFinite(line.qty) ? line.qty : 0;
    const price = Number.isFinite(line.unit_price) ? line.unit_price : 0;
    subtotal = roundMoney(subtotal + roundMoney(qty * price));
    total = roundMoney(total + lineTotal(qty, price, line.discount_pct));
  }
  return { subtotal, total };
}

export function asNumericId(value: string | number | null | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export { formatMxn, parseMoneyInput } from "@/lib/money";

export function formatDate(value?: string | number | null): string {
  if (value == null || value === "") return "—";
  const date =
    typeof value === "number"
      ? new Date(value < 1e12 ? value * 1000 : value)
      : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-MX", { dateStyle: "medium" });
}

export function toDateInput(value?: string | null): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function asQuoteStatus(value: string | undefined): QuoteStatus {
  if (
    value === "draft" ||
    value === "sent" ||
    value === "accepted" ||
    value === "rejected" ||
    value === "expired"
  ) {
    return value;
  }
  return "draft";
}

export function asProductStatus(value: string | undefined): ProductStatus {
  if (value === "active" || value === "inactive" || value === "discontinued") {
    return value;
  }
  return "active";
}

export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useCanWrite(): { canWrite: boolean; ready: boolean } {
  const [canWrite, setCanWrite] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await crmFetch<AuthMeResponse>("/api/auth/me");
        const role = data.user?.role;
        if (!cancelled) {
          setCanWrite(role === "admin" || role === "super_admin");
        }
      } catch {
        if (!cancelled) setCanWrite(false);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { canWrite, ready };
}
