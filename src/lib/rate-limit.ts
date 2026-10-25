interface WindowEntry {
  count: number;
  windowStart: number;
  /** Tamaño de ventana en ms para este key. Guardado para que purge lo use. */
  windowMs: number;
}

const store = new Map<string, WindowEntry>();

function purge(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    // Purgar solo si la ventana REAL de esta clave ya expiró.
    // ANTES se usaba un hardcode de 120_000 ms, lo que borraba prematuramente
    // claves con ventanas largas (p.ej. 15 min) y reseteaba el contador.
    if (now - entry.windowStart > entry.windowMs) {
      store.delete(key);
    }
  }
}

let purgeCounter = 0;
function maybePurge(): void {
  if (++purgeCounter % 500 === 0) purge();
}

/**
 * Returns true if the request should be blocked (rate limit exceeded).
 *
 * @param key       Unique key (e.g. "ip:POST:/api/admin/faq")
 * @param limit     Max requests allowed within the window
 * @param windowMs  Window size in milliseconds
 */
export function isRateLimited(
  key: string,
  limit: number,
  windowMs: number
): boolean {
  maybePurge();
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    store.set(key, { count: 1, windowStart: now, windowMs });
    return false;
  }

  entry.count += 1;
  return entry.count > limit;
}

/**
 * Extracts the best available IP from a request.
 * Trusts X-Forwarded-For only in production behind a reverse proxy.
 */
export function getClientIp(req: Request): string {
  if (process.env.NODE_ENV === "production") {
    const xff = (req.headers as Headers).get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
  }
  return "local";
}

// ── Exports para pruebas unitarias (no usar en producción) ───────────────────

/** Fuerza una purga inmediata. Solo para tests. */
export function purgeForTest(): void {
  purge();
}

/** Inserta una entrada arbitraria al store. Solo para tests. */
export function setEntryForTest(key: string, entry: WindowEntry): void {
  store.set(key, entry);
}
