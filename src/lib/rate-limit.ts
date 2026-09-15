interface WindowEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, WindowEntry>();

function purge() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.windowStart > 120_000) store.delete(key);
  }
}

let purgeCounter = 0;
function maybeePurge() {
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
  maybeePurge();
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    store.set(key, { count: 1, windowStart: now });
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
