/**
 * Rate limiter en memoria simple para endpoints sensibles.
 *
 * No es persistente entre reinicios del servidor (intencional para entornos
 * de proceso único como este). Para alta disponibilidad se usaría Redis.
 *
 * Uso:
 *   const rl = new RateLimiter({ max: 5, windowMs: 10 * 60 * 1000 });
 *   if (!rl.check(userId)) return 429;
 */

interface BucketEntry {
  count: number;
  resetAt: number; // timestamp ms
}

export interface RateLimiterOptions {
  /** Máximo de llamadas permitidas en la ventana. */
  max: number;
  /** Tamaño de la ventana en milisegundos. */
  windowMs: number;
}

export class RateLimiter {
  private readonly max: number;
  private readonly windowMs: number;
  private readonly buckets = new Map<string, BucketEntry>();

  constructor(opts: RateLimiterOptions) {
    this.max = opts.max;
    this.windowMs = opts.windowMs;
  }

  /**
   * Verifica y registra una solicitud para la clave dada.
   * @returns `true` si la solicitud está permitida, `false` si bloqueada.
   */
  check(key: string): boolean {
    const now = Date.now();
    const entry = this.buckets.get(key);

    if (!entry || now >= entry.resetAt) {
      // Ventana nueva
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (entry.count >= this.max) {
      return false; // límite alcanzado
    }

    entry.count++;
    return true;
  }

  /**
   * Limpia el estado de un usuario (útil en tests o reset manual).
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /** Número de solicitudes actuales para una clave (debug / tests). */
  count(key: string): number {
    const now = Date.now();
    const entry = this.buckets.get(key);
    if (!entry || now >= entry.resetAt) return 0;
    return entry.count;
  }
}

// ── Instancia compartida para uploads de identidad ───────────────────────────
// 5 uploads de INE por usuario cada 10 minutos
export const identityUploadRateLimiter = new RateLimiter({
  max: Number(process.env.IDENTITY_UPLOAD_MAX ?? 5),
  windowMs: Number(process.env.IDENTITY_UPLOAD_WINDOW_MS ?? 10 * 60 * 1000),
});
