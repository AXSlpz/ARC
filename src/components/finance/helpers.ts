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

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Centavos → texto en MXN (divide entre 100). */
export function formatCents(cents: number): string {
  return MXN.format(cents / 100);
}

/** "YYYY-MM-DD" → fecha legible sin desfase de zona horaria. */
export function formatOccurredOn(occurredOn: string): string {
  const [y, m, d] = occurredOn.split("-").map(Number);
  if (!y || !m || !d) return occurredOn;
  return new Date(y, m - 1, d).toLocaleDateString("es-MX", {
    dateStyle: "medium",
  } as Intl.DateTimeFormatOptions);
}

/** Mes actual como "YYYY-MM". */
export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Hoy como "YYYY-MM-DD". */
export function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}
