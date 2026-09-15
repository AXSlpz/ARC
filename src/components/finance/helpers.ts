/** Fetch JSON con manejo consistente de `{ error }`. Lanza Error con mensaje útil. */
export async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body != null;
  const res = await fetch(input, {
    ...init,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

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
