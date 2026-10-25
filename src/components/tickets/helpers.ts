import type { TicketStatus } from "@/lib/portal/types";

/** Fetch JSON con manejo consistente de `{ error }`. Lanza Error con mensaje útil. */
export async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body != null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  if (init?.signal) {
    if (init.signal.aborted) ac.abort();
    else init.signal.addEventListener("abort", () => ac.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(input, {
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

/** Epoch en segundos → fecha y hora legible en español (MX). */
export function formatDateTime(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Epoch en segundos → solo fecha. */
export function formatDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleDateString("es-MX", {
    dateStyle: "medium",
  } as Intl.DateTimeFormatOptions);
}

/** Bytes → tamaño legible (B, KB, MB, GB). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** exponent;
  const rounded = exponent === 0 ? value : Math.round(value * 10) / 10;
  return `${rounded} ${units[exponent]}`;
}

export const STATUS_BADGE_CLASS: Record<TicketStatus, string> = {
  nuevo: "bg-blue-100 text-blue-800",
  en_revision: "bg-amber-100 text-amber-800",
  autorizado: "bg-emerald-100 text-emerald-800",
  rechazado: "bg-red-100 text-red-800",
  cancelado: "bg-rose-100 text-rose-700",
  held: "bg-violet-100 text-violet-800",
};
